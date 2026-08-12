from datetime import UTC, datetime, timedelta

import pytest

from app.routers import onboarding
from app.routers.onboarding import (
    _classify,
    _compute_signals,
    _fetch_display_candles_and_signals,
    _score_checklist,
)
from app.schemas import Candle, OnboardingSignal, OnboardingTradeIn
from app.schemas_strategy import StrategyRule
from app.services import onboarding_scenario as scenario


def _candle(i: int, close: float) -> Candle:
    return Candle(time=i, open=close, high=close, low=close, close=close, volume=1.0)


def _candles(closes: list[float]) -> list[Candle]:
    return [_candle(i, c) for i, c in enumerate(closes)]


def test_compute_signals_returns_empty_list_for_no_candles():
    assert _compute_signals([]) == []


def _patch_scenario_rules(monkeypatch, confirmation_comparator: str, confirmation_right: str):
    trigger = StrategyRule(
        left="close", comparator="crosses_above", right="100", description="trigger"
    )
    confirmation = StrategyRule(
        left="close",
        comparator=confirmation_comparator,
        right=confirmation_right,
        description="confirmation",
    )
    monkeypatch.setattr(scenario, "ENTRY_RULES", [trigger])
    monkeypatch.setattr(scenario, "CONFIRMATION_RULE", confirmation)
    monkeypatch.setattr(scenario, "CONFIRMATION_WINDOW", 2)
    monkeypatch.setattr(scenario, "EXIT_RULES", [])


def test_compute_signals_entry_trigger_fires_alone_without_ever_requiring_confirmation(monkeypatch):
    # confirmation condition never holds in this window
    _patch_scenario_rules(monkeypatch, ">", "1000")
    candles = _candles([90, 95, 105, 106, 90])
    signals = _compute_signals(candles)
    assert [s.kind for s in signals] == ["entry"]
    assert signals[0].index == 2


def test_compute_signals_emits_confluence_signal_when_confirmation_lands_within_window(monkeypatch):
    # confirmation (close > 105) holds one candle after the trigger at index 2
    _patch_scenario_rules(monkeypatch, ">", "105")
    candles = _candles([90, 95, 105, 106, 90])
    signals = _compute_signals(candles)
    assert [s.kind for s in signals] == ["entry", "entry"]
    assert signals[0].index == 2
    assert signals[1].index == 3
    assert "confluence" in signals[1].description.lower()


def test_classify_no_trades_with_signals_available_is_sat_out():
    candles = _candles([100] * 10)
    signals = _compute_signals(candles)
    from app.schemas import OnboardingSignal

    signals = [
        OnboardingSignal(
            index=3,
            time=3,
            kind="entry",
            description="entry",
            annotation={"type": "marker", "time": 3, "price": 100, "label": "entry"},
        )
    ]
    classification, _ = _classify(candles, signals, [])
    assert classification == "sat_out"


def test_classify_no_trades_and_no_signals_is_mistimed():
    candles = _candles([100] * 10)
    classification, _ = _classify(candles, [], [])
    assert classification == "mistimed"


def test_classify_trade_matching_entry_and_exit_signals_is_perfect():
    from app.schemas import OnboardingSignal

    candles = _candles(range(10))
    signals = [
        OnboardingSignal(
            index=3,
            time=3,
            kind="entry",
            description="entry",
            annotation={"type": "marker", "time": 3, "price": 3, "label": "entry"},
        ),
        OnboardingSignal(
            index=7,
            time=7,
            kind="exit",
            description="exit",
            annotation={"type": "marker", "time": 7, "price": 7, "label": "exit"},
        ),
    ]
    trades = [OnboardingTradeIn(enter_time=3, enter_price=3, exit_time=7, exit_price=7)]
    classification, _ = _classify(candles, signals, trades)
    assert classification == "perfect"


def test_classify_trade_within_tolerance_of_signal_is_perfect():
    from app.schemas import OnboardingSignal

    candles = _candles(range(10))
    signals = [
        OnboardingSignal(
            index=3,
            time=3,
            kind="entry",
            description="entry",
            annotation={"type": "marker", "time": 3, "price": 3, "label": "entry"},
        ),
    ]
    # entered one candle late (index 4 instead of 3) — within the 2-candle tolerance
    trades = [OnboardingTradeIn(enter_time=4, enter_price=4, exit_time=None, exit_price=None)]
    classification, _ = _classify(candles, signals, trades)
    assert classification == "perfect"


@pytest.mark.asyncio
async def test_fetch_display_candles_and_signals_trims_lookback_and_remaps_indices(monkeypatch):
    # 10 daily candles, 2024-01-01 .. 2024-01-10; display window starts on day 5
    # (2024-01-06), so the first 5 candles are lookback-only and must be trimmed.
    day0 = datetime(2024, 1, 1, tzinfo=UTC)
    full_closes = [90, 90, 90, 90, 90, 90, 95, 105, 110, 90]
    full_candles = [
        Candle(
            time=int(day0.timestamp()) + i * 86400,
            open=c,
            high=c,
            low=c,
            close=c,
            volume=1.0,
        )
        for i, c in enumerate(full_closes)
    ]

    monkeypatch.setattr(scenario, "WINDOW_START", day0 + timedelta(days=5))
    monkeypatch.setattr(scenario, "WINDOW_END", day0 + timedelta(days=9))
    monkeypatch.setattr(scenario, "LOOKBACK_DAYS", 5)
    trigger = StrategyRule(
        left="close", comparator="crosses_above", right="100", description="trigger"
    )
    never = StrategyRule(left="close", comparator=">", right="1000", description="never")
    monkeypatch.setattr(scenario, "ENTRY_RULES", [trigger])
    monkeypatch.setattr(scenario, "CONFIRMATION_RULE", never)
    monkeypatch.setattr(scenario, "CONFIRMATION_WINDOW", 0)
    monkeypatch.setattr(scenario, "EXIT_RULES", [])
    monkeypatch.setattr(onboarding.alpaca_client, "get_candles", lambda *a, **k: full_candles)

    candles, signals = await _fetch_display_candles_and_signals()

    # only the 5 candles from the display window onward
    assert len(candles) == 5
    assert candles[0].time == full_candles[5].time
    # the trigger fired at full-list index 7 -> display index 7 - 5 = 2
    assert [s.index for s in signals] == [2]
    assert candles[2].close == 105


def test_score_checklist_no_trades_marks_every_item_not_attempted():
    candles = _candles(range(10))
    results = _score_checklist(candles, [], [])
    assert results
    assert all(r.status == "not_attempted" for r in results)
    assert [r.item for r in results] == scenario.CHECKLIST


def test_score_checklist_perfect_trade_marks_every_item_met():
    candles = _candles(range(10))
    signals = [
        OnboardingSignal(
            index=3,
            time=3,
            kind="entry",
            description="trigger",
            is_confirmation=False,
            annotation={"type": "marker", "time": 3, "price": 3, "label": "trigger"},
        ),
        OnboardingSignal(
            index=4,
            time=4,
            kind="entry",
            description="confirmation",
            is_confirmation=True,
            annotation={"type": "marker", "time": 4, "price": 4, "label": "confirmation"},
        ),
        OnboardingSignal(
            index=8,
            time=8,
            kind="exit",
            description="exit",
            annotation={"type": "marker", "time": 8, "price": 8, "label": "exit"},
        ),
    ]
    trades = [OnboardingTradeIn(enter_time=4, enter_price=4, exit_time=8, exit_price=8)]
    results = _score_checklist(candles, signals, trades)
    assert [r.status for r in results] == ["met", "met", "met", "met"]


def test_score_checklist_entry_only_leaves_confirmation_and_exit_missed():
    candles = _candles(range(10))
    signals = [
        OnboardingSignal(
            index=3,
            time=3,
            kind="entry",
            description="trigger",
            is_confirmation=False,
            annotation={"type": "marker", "time": 3, "price": 3, "label": "trigger"},
        ),
    ]
    trades = [OnboardingTradeIn(enter_time=3, enter_price=3, exit_time=None, exit_price=None)]
    results = _score_checklist(candles, signals, trades)
    assert [r.status for r in results] == ["met", "missed", "met", "missed"]


def test_classify_trade_far_from_any_signal_is_mistimed():
    from app.schemas import OnboardingSignal

    candles = _candles(range(10))
    signals = [
        OnboardingSignal(
            index=3,
            time=3,
            kind="entry",
            description="entry",
            annotation={"type": "marker", "time": 3, "price": 3, "label": "entry"},
        ),
    ]
    # entered way off from the signal
    trades = [OnboardingTradeIn(enter_time=8, enter_price=8, exit_time=None, exit_price=None)]
    classification, _ = _classify(candles, signals, trades)
    assert classification == "mistimed"
