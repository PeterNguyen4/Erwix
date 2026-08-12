import asyncio
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import alpaca_client
from app.auth import get_current_user_id, require_admin
from app.db import get_db
from app.dependencies.rate_limit import rate_limit
from app.models import DebriefReport, UserPreference
from app.schemas import (
    Candle,
    OnboardingChecklistResult,
    OnboardingDebriefIn,
    OnboardingDebriefOut,
    OnboardingPlaybook,
    OnboardingScenarioOut,
    OnboardingSignal,
    OnboardingStorySlide,
)
from app.services import onboarding_scenario as scenario
from app.services.agent_graph import _base_model
from app.services.rule_engine import evaluate_rules_at
from app.services.rule_watch import ENTRY_COLOR, EXIT_COLOR

logger = logging.getLogger("erwix.onboarding")

router = APIRouter(
    prefix="/api/onboarding",
    tags=["onboarding"],
    dependencies=[Depends(get_current_user_id)],
)

_llm_rate_limit = rate_limit("onboarding-llm", limit=5, window_ms=60_000, fail_open=False)

SIGNAL_MATCH_TOLERANCE = 2  # candles

_FALLBACK_NARRATIVE = {
    "perfect": "You caught the signal and rode it out — that's the discipline this is all about!",
    "sat_out": (
        "That would've been a good trade! Sitting it out on your first go is "
        "totally fine — confidence builds with reps."
    ),
    "mistimed": (
        "Not quite lined up with the signals this time — worth a quick look at "
        "what fired and when."
    ),
}

DEBRIEF_SYSTEM_PROMPT = (
    "You are a warm, upbeat trading coach texting a friend right after their first practice "
    "trial run — not writing a report. They replayed a historical window using a simple, "
    "curated playbook. You're told their classification: 'perfect' (traded in line with the "
    "playbook's signals), 'sat_out' (the signals fired and worked out, but they never entered "
    "a trade), or 'mistimed' (entered/exited off the signals, or ignored the exit).\n"
    "Write ONE short sentence, maybe two at most — conversational, encouraging, a little "
    "excited, like a quick text message. No hedging, no disclaimers, no bullet lists, no "
    "restating numbers. Never address them with gendered or informal terms like 'dude', "
    "'bro', 'man', 'girl', or similar — keep the energy without assuming who you're talking "
    "to. The checklist below already shows the play-by-play, so don't repeat it — just react "
    "to how it went:\n"
    "- perfect: hype them up, genuinely.\n"
    "- sat_out: reassure them — it would've worked, and hesitating on a first try is normal.\n"
    "- mistimed: stay encouraging, not critical — a quick nudge toward what to watch next time."
)


def _signal(
    candle: Candle,
    i: int,
    kind: str,
    description: str,
    color: str,
    is_confirmation: bool = False,
) -> OnboardingSignal:
    return OnboardingSignal(
        index=i,
        time=candle.time,
        kind=kind,
        description=description,
        is_confirmation=is_confirmation,
        annotation={
            "type": "marker",
            "time": candle.time,
            "price": candle.close,
            "label": description,
            "color": color,
        },
    )


def _compute_signals(candles: list[Candle]) -> list[OnboardingSignal]:
    """Entry fires right on signal."""
    signals: list[OnboardingSignal] = []
    was_entry_trigger = False
    was_exit = False
    pending_entry_index: int | None = None

    for i, candle in enumerate(candles):
        entry_trigger_now = evaluate_rules_at(candles, scenario.ENTRY_RULES, i)[0]
        confirmation_now = evaluate_rules_at(candles, [scenario.CONFIRMATION_RULE], i)[0]
        exit_now = any(evaluate_rules_at(candles, [r], i)[0] for r in scenario.EXIT_RULES)

        if entry_trigger_now and not was_entry_trigger:
            signals.append(
                _signal(candle, i, "entry", scenario.ENTRY_RULES[0].description, ENTRY_COLOR)
            )
            pending_entry_index = i
        elif (
            pending_entry_index is not None
            and i - pending_entry_index > scenario.CONFIRMATION_WINDOW
        ):
            pending_entry_index = None

        if pending_entry_index is not None and confirmation_now:
            desc = (
                f"{scenario.CONFIRMATION_RULE.description} — "
                "confluence stacked, good time to enter"
            )
            signals.append(_signal(candle, i, "entry", desc, ENTRY_COLOR, is_confirmation=True))
            pending_entry_index = None

        if exit_now and not was_exit:
            desc = next(
                (
                    r.description
                    for r in scenario.EXIT_RULES
                    if evaluate_rules_at(candles, [r], i)[0]
                ),
                scenario.EXIT_RULES[0].description,
            )
            signals.append(_signal(candle, i, "exit", desc, EXIT_COLOR))
        was_entry_trigger, was_exit = entry_trigger_now, exit_now
    return signals


async def _fetch_display_candles_and_signals() -> tuple[list[Candle], list[OnboardingSignal]]:
    """Fetches with indicators that peek further into past."""
    lookback_start = scenario.WINDOW_START - timedelta(days=scenario.LOOKBACK_DAYS)
    full_candles = await asyncio.to_thread(
        alpaca_client.get_candles,
        scenario.SYMBOL,
        scenario.TIMEFRAME,
        lookback_start,
        scenario.WINDOW_END,
    )
    full_signals = _compute_signals(full_candles)

    window_start_ts = int(scenario.WINDOW_START.timestamp())
    offset = next(
        (i for i, c in enumerate(full_candles) if c.time >= window_start_ts),
        len(full_candles),
    )
    candles = full_candles[offset:]
    signals = [
        s.model_copy(update={"index": s.index - offset})
        for s in full_signals
        if s.index >= offset
    ]
    return candles, signals


@router.get("/scenario", response_model=OnboardingScenarioOut)
async def get_scenario() -> OnboardingScenarioOut:
    candles, signals = await _fetch_display_candles_and_signals()
    return OnboardingScenarioOut(
        symbol=scenario.SYMBOL,
        timeframe=scenario.TIMEFRAME,
        candles=candles,
        playbook=OnboardingPlaybook(
            title=scenario.TITLE,
            story=[OnboardingStorySlide(**slide) for slide in scenario.STORY],
            checklist=scenario.CHECKLIST,
        ),
        signals=signals,
        chart_indicators=scenario.CHART_INDICATORS,
    )


def _classify(
    candles: list[Candle],
    signals: list[OnboardingSignal],
    trades: list,
) -> tuple[str, str]:
    index_by_time = {c.time: i for i, c in enumerate(candles)}
    entry_indices = [s.index for s in signals if s.kind == "entry"]
    exit_indices = [s.index for s in signals if s.kind == "exit"]

    if not trades:
        if entry_indices:
            return "sat_out", "The user watched the whole trial without entering any trade."
        return "mistimed", "The user did not trade and no clean entry signal fired."

    facts: list[str] = []
    all_matched = True
    for t in trades:
        enter_idx = index_by_time.get(t.enter_time)
        exit_idx = index_by_time.get(t.exit_time) if t.exit_time is not None else None
        entry_ok = enter_idx is not None and any(
            abs(enter_idx - si) <= SIGNAL_MATCH_TOLERANCE for si in entry_indices
        )
        exit_ok = exit_idx is None or any(
            abs(exit_idx - si) <= SIGNAL_MATCH_TOLERANCE for si in exit_indices
        )
        if not (entry_ok and exit_ok):
            all_matched = False
        entry_note = " (on-signal)" if entry_ok else " (off-signal, no entry rule fired nearby)"
        exit_note = " (on-signal)" if exit_ok else " (off-signal, ignored the exit rule)"
        exit_part = (
            f", exited at {t.exit_price:.2f}{exit_note}"
            if t.exit_time is not None
            else ", position left open at end of trial"
        )
        facts.append(f"Entered at {t.enter_price:.2f}{entry_note}{exit_part}")

    classification = "perfect" if all_matched else "mistimed"
    return classification, "; ".join(facts)


def _score_checklist(
    candles: list[Candle],
    signals: list[OnboardingSignal],
    trades: list,
) -> list[OnboardingChecklistResult]:
    """Rate trial performance based on checklist."""
    index_by_time = {c.time: i for i, c in enumerate(candles)}
    trigger_indices = [s.index for s in signals if s.kind == "entry" and not s.is_confirmation]
    confirmation_indices = [s.index for s in signals if s.kind == "entry" and s.is_confirmation]
    exit_indices = [s.index for s in signals if s.kind == "exit"]

    items = scenario.CHECKLIST
    if not trades:
        return [OnboardingChecklistResult(item=item, status="not_attempted") for item in items]

    def _near(idx: int | None, targets: list[int]) -> bool:
        return idx is not None and any(abs(idx - t) <= SIGNAL_MATCH_TOLERANCE for t in targets)

    enter_indices = [index_by_time.get(t.enter_time) for t in trades]
    exit_idx_list = [
        index_by_time.get(t.exit_time) for t in trades if t.exit_time is not None
    ]

    signal_met = any(_near(i, trigger_indices) for i in enter_indices)
    confirmation_met = any(_near(i, confirmation_indices) for i in enter_indices)
    exit_met = any(_near(i, exit_indices) for i in exit_idx_list)

    return [
        OnboardingChecklistResult(item=items[0], status="met" if signal_met else "missed"),
        OnboardingChecklistResult(item=items[1], status="met" if confirmation_met else "missed"),
        OnboardingChecklistResult(item=items[2], status="met" if signal_met else "missed"),
        OnboardingChecklistResult(item=items[3], status="met" if exit_met else "missed"),
    ]


@router.post(
    "/debrief",
    response_model=OnboardingDebriefOut,
    dependencies=[Depends(_llm_rate_limit)],
)
async def submit_debrief(
    body: OnboardingDebriefIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> OnboardingDebriefOut:
    candles, signals = await _fetch_display_candles_and_signals()
    classification, facts = _classify(candles, signals, body.trades)
    checklist_results = _score_checklist(candles, signals, body.trades)

    prompt = f"Classification: {classification}\nWhat happened: {facts}"
    messages: list[AnyMessage] = [
        SystemMessage(DEBRIEF_SYSTEM_PROMPT),
        HumanMessage(prompt),
    ]
    try:
        response = await _base_model().ainvoke(messages)
        narrative = response.content
        if isinstance(narrative, list):
            narrative = "".join(
                b.get("text", "")
                for b in narrative
                if isinstance(b, dict) and b.get("type") == "text"
            )
        narrative = narrative.strip()
    except Exception:
        logger.exception("onboarding debrief narration failed for user %s", user_id)
        narrative = _FALLBACK_NARRATIVE[classification]

    now = datetime.now(UTC)
    report = DebriefReport(
        user_id=user_id,
        report_type="onboarding",
        window_start=scenario.WINDOW_START,
        window_end=scenario.WINDOW_END,
        symbol=scenario.SYMBOL,
        status="ready",
        scheduled_for=now,
        started_at=now,
        completed_at=now,
        total_steps=0,
        current_step=0,
        steps=[],
        summary=narrative,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return OnboardingDebriefOut(
        debrief=report, classification=classification, checklist_results=checklist_results
    )


@router.post("/reset", status_code=204)
async def reset_onboarding(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(require_admin),
) -> None:
    """Admin-only: clear the caller's own onboarding_completed_at so they can replay the
    first-login trial run for testing/demo purposes."""
    pref = (
        (await db.execute(select(UserPreference).where(UserPreference.user_id == user_id)))
        .scalars()
        .first()
    )
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
    pref.onboarding_completed_at = None
    await db.commit()
