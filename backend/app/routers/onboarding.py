import asyncio
import logging
from datetime import UTC, datetime

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
    OnboardingDebriefIn,
    OnboardingDebriefOut,
    OnboardingPlaybook,
    OnboardingScenarioOut,
    OnboardingSignal,
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
    "perfect": (
        "You followed the playbook's signals from entry to exit — that's exactly the "
        "discipline this tool is built to support."
    ),
    "sat_out": (
        "The signals lined up and this would have been a good trade. Sitting it out on "
        "your first trial is completely fine — confidence to act comes with reps."
    ),
    "mistimed": (
        "Your trade didn't line up with the playbook's signals — worth revisiting when "
        "each one fired and comparing it to your entry/exit."
    ),
}

DEBRIEF_SYSTEM_PROMPT = (
    "You are a trading coach narrating the debrief of a new user's first practice trial run. "
    "They just replayed a historical window using a simple, curated playbook. You're told "
    "their classification: 'perfect' (they traded in line with the playbook's signals), "
    "'sat_out' (the playbook's signals fired and worked out, but the user never entered a "
    "trade), or 'mistimed' (they entered/exited off the playbook's signals, or ignored the "
    "exit signal). Write 2-4 sentences of direct, encouraging coaching:\n"
    "- perfect: congratulate them concretely, referencing that they followed the signals.\n"
    "- sat_out: reassure them — the signals lined up and it would have worked, but hesitating "
    "on a first trial is completely fine; confidence to act on a signal builds with reps, not "
    "instantly.\n"
    "- mistimed: be constructive, not harsh — point out specifically where their entry/exit "
    "diverged from the playbook's signals and why waiting for the signal matters.\n"
    "No hedging filler, no generic disclaimers, no bullet lists — just talk to them."
)


def _entry_description(candles: list[Candle], i: int) -> str:
    fired = [
        r.description
        for r in scenario.ENTRY_RULES
        if evaluate_rules_at(candles, [r], i)[0]
    ]
    return " + ".join(fired) if fired else scenario.ENTRY_RULES[0].description


def _compute_signals(candles: list[Candle]) -> list[OnboardingSignal]:
    signals: list[OnboardingSignal] = []
    was_entry = False
    was_exit = False
    for i, candle in enumerate(candles):
        entry_now = bool(candles) and all(
            evaluate_rules_at(candles, [r], i)[0] for r in scenario.ENTRY_RULES
        )
        exit_now = any(evaluate_rules_at(candles, [r], i)[0] for r in scenario.EXIT_RULES)

        if entry_now and not was_entry:
            desc = _entry_description(candles, i)
            signals.append(
                OnboardingSignal(
                    index=i,
                    time=candle.time,
                    kind="entry",
                    description=desc,
                    annotation={
                        "type": "marker",
                        "time": candle.time,
                        "price": candle.close,
                        "label": desc,
                        "color": ENTRY_COLOR,
                    },
                )
            )
        if exit_now and not was_exit:
            desc = next(
                (
                    r.description
                    for r in scenario.EXIT_RULES
                    if evaluate_rules_at(candles, [r], i)[0]
                ),
                scenario.EXIT_RULES[0].description,
            )
            signals.append(
                OnboardingSignal(
                    index=i,
                    time=candle.time,
                    kind="exit",
                    description=desc,
                    annotation={
                        "type": "marker",
                        "time": candle.time,
                        "price": candle.close,
                        "label": desc,
                        "color": EXIT_COLOR,
                    },
                )
            )
        was_entry, was_exit = entry_now, exit_now
    return signals


@router.get("/scenario", response_model=OnboardingScenarioOut)
async def get_scenario() -> OnboardingScenarioOut:
    candles = await asyncio.to_thread(
        alpaca_client.get_candles,
        scenario.SYMBOL,
        scenario.TIMEFRAME,
        scenario.WINDOW_START,
        scenario.WINDOW_END,
    )
    signals = _compute_signals(candles)
    return OnboardingScenarioOut(
        symbol=scenario.SYMBOL,
        timeframe=scenario.TIMEFRAME,
        candles=candles,
        playbook=OnboardingPlaybook(
            title=scenario.TITLE,
            markdown=scenario.MARKDOWN,
            checklist=scenario.CHECKLIST,
        ),
        signals=signals,
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
    candles = await asyncio.to_thread(
        alpaca_client.get_candles,
        scenario.SYMBOL,
        scenario.TIMEFRAME,
        scenario.WINDOW_START,
        scenario.WINDOW_END,
    )
    signals = _compute_signals(candles)
    classification, facts = _classify(candles, signals, body.trades)

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

    return OnboardingDebriefOut(debrief=report, classification=classification)


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
