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
    ChartAnnotation,
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
from app.services.indicators import chandelier_stop, ema
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
    "trial run, not writing a report. They replayed a historical window using a simple, "
    "curated playbook. You're told their classification: 'perfect' (traded in line with the "
    "playbook's signals), 'sat_out' (the signals fired and worked out, but they never entered "
    "a trade), or 'mistimed' (entered/exited off the signals, or ignored the exit).\n"
    "Write ONE short sentence, maybe two at most, conversational, encouraging, a little "
    "excited, like a quick text message. No hedging, no disclaimers, no bullet lists, no "
    "restating numbers. Never use an em dash; use a period, comma, or 'and' instead. Never "
    "address them with gendered or informal terms like 'dude', 'bro', 'man', 'girl', or "
    "similar, keep the energy without assuming who you're talking to. The checklist below "
    "already shows the play-by-play, so don't repeat it, just react to how it went:\n"
    "- perfect: hype them up, genuinely.\n"
    "- sat_out: reassure them, it would've worked, and hesitating on a first try is normal.\n"
    "- mistimed: stay encouraging, not critical, a quick nudge toward what to watch next time."
)


def _signal(
    candle: Candle,
    i: int,
    kind: str,
    description: str,
    color: str,
    is_confirmation: bool = False,
    stop_loss_price: float | None = None,
    take_profit_price: float | None = None,
) -> OnboardingSignal:
    return OnboardingSignal(
        index=i,
        time=candle.time,
        kind=kind,
        description=description,
        is_confirmation=is_confirmation,
        stop_loss_price=stop_loss_price,
        take_profit_price=take_profit_price,
        annotation={
            "type": "marker",
            "time": candle.time,
            "price": candle.close,
            "label": description,
            "color": color,
        },
    )


def _avg_range(candles: list[Candle], i: int) -> float | None:
    window = candles[max(0, i - scenario.BIG_CANDLE_LOOKBACK) : i]
    if not window:
        return None
    return sum(c.high - c.low for c in window) / len(window)


class _StrategyResult:
    __slots__ = ("signals", "horizontal_lines", "checklist_stage")

    def __init__(
        self,
        signals: list[OnboardingSignal],
        horizontal_lines: list[ChartAnnotation],
        checklist_stage: list[int],
    ) -> None:
        self.signals = signals
        self.horizontal_lines = horizontal_lines
        self.checklist_stage = checklist_stage


def _run_strategy(candles: list[Candle]) -> _StrategyResult:
    """State machine for the EMA-breakout / pullback / horizontal-line-break playbook.

    seek_breakout > pullback > wait_line_break > in_trade > back to seek_breakout.
    Invalidated (back to seek_breakout, no signal) if price closes back below the EMA
    during the pullback/line-wait phases, or if the breakout candle is oversized.
    """
    signals: list[OnboardingSignal] = []
    horizontal_lines: list[ChartAnnotation] = []
    checklist_stage: list[int] = [0] * len(candles)
    if not candles:
        return _StrategyResult(signals, horizontal_lines, checklist_stage)

    closes = [c.close for c in candles]
    ema_values = ema(closes, scenario.EMA_PERIOD)
    chandelier_values = chandelier_stop(
        candles,
        scenario.CHANDELIER_LENGTH,
        scenario.CHANDELIER_ATR_PERIOD,
        scenario.CHANDELIER_MULT,
    )

    state = "seek_breakout"
    stage = 0
    swing_high = 0.0
    red_count = 0
    line_price = 0.0
    stop_price = 0.0
    take_profit_price = 0.0

    for i, candle in enumerate(candles):
        ema_val = ema_values[i]
        if ema_val is None:
            checklist_stage[i] = stage
            continue
        prev_ema = ema_values[i - 1] if i > 0 else None
        prev_close = candles[i - 1].close if i > 0 else None
        is_red = candle.close < candle.open
        body_bottom = min(candle.open, candle.close)

        if state == "seek_breakout":
            crossed_above = prev_ema is not None and prev_close is not None and (
                prev_close <= prev_ema and candle.close > ema_val and body_bottom > ema_val
            )
            if crossed_above:
                avg_range = _avg_range(candles, i)
                candle_range = candle.high - candle.low
                if not (avg_range and candle_range > scenario.BIG_CANDLE_MULT * avg_range):
                    state = "pullback"
                    swing_high = candle.high
                    red_count = 0
                    stage = 1
                # else: oversized breakout candle. SKIP

        elif state == "pullback":
            if candle.close < ema_val:
                state, stage = "seek_breakout", 0  # broke back below the EMA. SKIP
            else:
                if is_red:
                    red_count += 1
                else:
                    red_count = 0
                    swing_high = max(swing_high, candle.high)
                if red_count >= scenario.PULLBACK_MIN_RED_CANDLES:
                    state = "wait_line_break"
                    line_price = swing_high
                    stage = 2
                    horizontal_lines.append(
                        ChartAnnotation(
                            type="line",
                            time=candle.time,
                            price=line_price,
                            index=i,
                            label=f"Swing high {line_price:.2f}",
                            color=scenario.LINE_COLOR,
                        )
                    )

        elif state == "wait_line_break":
            if candle.close < ema_val:
                state, stage = "seek_breakout", 0  # invalid before the line ever broke
            elif candle.close > line_price:
                stop = chandelier_values[i]
                if stop is None or stop >= candle.close:
                    state, stage = "seek_breakout", 0  # no usable long stop here — skip it
                else:
                    stop_price = stop
                    take_profit_price = candle.close + scenario.RISK_REWARD_MULTIPLE * (
                        candle.close - stop_price
                    )
                    desc = (
                        f"Broke back above the horizontal line at {line_price:.2f} "
                        f"(prior swing high) — buy, stop {stop_price:.2f}, "
                        f"target {take_profit_price:.2f}"
                    )
                    signals.append(
                        _signal(
                            candle,
                            i,
                            "entry",
                            desc,
                            ENTRY_COLOR,
                            stop_loss_price=stop_price,
                            take_profit_price=take_profit_price,
                        )
                    )
                    state, stage = "in_trade", 3

        elif state == "in_trade":
            if candle.close <= stop_price:
                signals.append(
                    _signal(candle, i, "exit", "Chandelier stop hit. Exit", EXIT_COLOR)
                )
                state, stage = "seek_breakout", 0
            elif candle.close >= take_profit_price:
                signals.append(
                    _signal(candle, i, "exit", "Take-profit hit (2x risk). Exit", EXIT_COLOR)
                )
                state, stage = "seek_breakout", 0

        checklist_stage[i] = stage

    return _StrategyResult(signals, horizontal_lines, checklist_stage)


def _compute_signals(candles: list[Candle]) -> list[OnboardingSignal]:
    return _run_strategy(candles).signals


async def _fetch_scenario_data() -> tuple[list[Candle], _StrategyResult, int]:
    """Fetches wider data range so  50-EMA/chandelier have their full setup."""
    candles = await asyncio.to_thread(
        alpaca_client.get_candles,
        scenario.SYMBOL,
        scenario.TIMEFRAME,
        scenario.DATA_START,
        scenario.WINDOW_END,
    )
    result = _run_strategy(candles)

    trial_start_ts = int(scenario.TRIAL_START.timestamp())
    trial_start_index = next(
        (i for i, c in enumerate(candles) if c.time >= trial_start_ts),
        max(0, len(candles) - 1),
    )
    return candles, result, trial_start_index


async def _fetch_display_candles_and_signals() -> tuple[list[Candle], list[OnboardingSignal]]:
    candles, result, _ = await _fetch_scenario_data()
    return candles, result.signals


@router.get("/scenario", response_model=OnboardingScenarioOut)
async def get_scenario() -> OnboardingScenarioOut:
    candles, result, trial_start_index = await _fetch_scenario_data()
    return OnboardingScenarioOut(
        symbol=scenario.SYMBOL,
        timeframe=scenario.TIMEFRAME,
        candles=candles,
        playbook=OnboardingPlaybook(
            title=scenario.TITLE,
            story=[OnboardingStorySlide(**slide) for slide in scenario.STORY],
            checklist=scenario.CHECKLIST,
        ),
        signals=result.signals,
        chart_indicators=scenario.CHART_INDICATORS,
        trial_start_index=trial_start_index,
        horizontal_lines=result.horizontal_lines,
        checklist_stage=result.checklist_stage,
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
    entry_indices = [s.index for s in signals if s.kind == "entry"]
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

    entry_met = any(_near(i, entry_indices) for i in enter_indices)
    exit_met = any(_near(i, exit_indices) for i in exit_idx_list)

    return [
        OnboardingChecklistResult(item=items[0], status="met" if entry_met else "missed"),
        OnboardingChecklistResult(item=items[1], status="met" if entry_met else "missed"),
        OnboardingChecklistResult(item=items[2], status="met" if entry_met else "missed"),
        OnboardingChecklistResult(item=items[3], status="met" if entry_met else "missed"),
        OnboardingChecklistResult(item=items[4], status="met" if exit_met else "missed"),
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
        window_start=scenario.TRIAL_START,
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
