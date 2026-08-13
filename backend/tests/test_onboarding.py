from datetime import UTC, datetime, timedelta

import pytest

from app.routers import onboarding
from app.routers.onboarding import (
    _classify,
    _compute_signals,
    _fetch_scenario_data,
    _score_checklist,
)
from app.schemas import Candle, OnboardingSignal, OnboardingTradeIn
from app.services import onboarding_scenario as scenario


def _candle(i: int, close: float, open_: float | None = None, high=None, low=None) -> Candle:
    o = close if open_ is None else open_
    h = max(o, close) if high is None else high
    lo = min(o, close) if low is None else low
    return Candle(time=i, open=o, high=h, low=lo, close=close, volume=1.0)


def _candles(closes: list[float]) -> list[Candle]:
    return [_candle(i, c) for i, c in enumerate(closes)]


def _flat_ohlc(i: int, price: float) -> Candle:
    return Candle(time=i, open=price, high=price, low=price, close=price, volume=1.0)


def test_compute_signals_returns_empty_list_for_no_candles():
    assert _compute_signals([]) == []


def _breakout_pullback_line_break_candles() -> list[Candle]:
    """Setup 55 flat candles below 100 so 50 EMA settles near 100.
       Then: a breakout candle that closes above the EMA with its body bottom above it
       Two red pullback candles
       Candle that closes back above the pre-pullback swing high."""
    candles = [_flat_ohlc(i, 100.0) for i in range(55)]
    # breakout: opens at prior EMA level, closes well above it, body bottom above EMA
    candles.append(Candle(time=55, open=101.0, high=112.0, low=100.5, close=110.0, volume=1.0))
    # two red pullback candles, staying above the EMA
    candles.append(Candle(time=56, open=109.0, high=109.5, low=105.0, close=106.0, volume=1.0))
    candles.append(Candle(time=57, open=106.0, high=106.5, low=103.0, close=104.0, volume=1.0))
    # breaks back above the swing high (112.0) drawn before the pullback
    candles.append(Candle(time=58, open=105.0, high=115.0, low=104.5, close=113.0, volume=1.0))
    return candles


def test_compute_signals_fires_entry_on_horizontal_line_break_after_pullback():
    candles = _breakout_pullback_line_break_candles()
    signals = _compute_signals(candles)
    assert [s.kind for s in signals] == ["entry"]
    assert signals[0].index == 58


def test_compute_signals_no_entry_without_a_real_pullback():
    # same breakout, but only one red candle before the line break. fake pullack
    candles = [_flat_ohlc(i, 100.0) for i in range(55)]
    candles.append(Candle(time=55, open=101.0, high=112.0, low=100.5, close=110.0, volume=1.0))
    candles.append(Candle(time=56, open=109.0, high=109.5, low=105.0, close=106.0, volume=1.0))
    candles.append(Candle(time=57, open=106.0, high=115.0, low=105.5, close=113.0, volume=1.0))
    signals = _compute_signals(candles)
    assert signals == []


def test_compute_signals_invalidated_when_pullback_breaks_back_below_ema():
    candles = [_flat_ohlc(i, 100.0) for i in range(55)]
    candles.append(Candle(time=55, open=101.0, high=112.0, low=100.5, close=110.0, volume=1.0))
    # two red candles that fall back below the EMA (~100). SKIP
    candles.append(Candle(time=56, open=109.0, high=109.5, low=95.0, close=97.0, volume=1.0))
    candles.append(Candle(time=57, open=97.0, high=97.5, low=90.0, close=91.0, volume=1.0))
    candles.append(Candle(time=58, open=92.0, high=115.0, low=91.5, close=113.0, volume=1.0))
    signals = _compute_signals(candles)
    assert signals == []


def test_compute_signals_skips_oversized_breakout_candle():
    candles = [_flat_ohlc(i, 100.0) for i in range(55)]
    # breakout candle range is far bigger than the flat average range before it
    candles.append(Candle(time=55, open=101.0, high=140.0, low=100.5, close=138.0, volume=1.0))
    candles.append(Candle(time=56, open=137.0, high=137.5, low=133.0, close=134.0, volume=1.0))
    candles.append(Candle(time=57, open=134.0, high=134.5, low=131.0, close=132.0, volume=1.0))
    candles.append(Candle(time=58, open=133.0, high=141.0, low=132.5, close=139.0, volume=1.0))
    signals = _compute_signals(candles)
    assert signals == []


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
async def test_fetch_scenario_data_reports_trial_start_index_without_trimming(monkeypatch):
    # 10 daily candles, 2024-01-01 .. 2024-01-10; the played trial starts on day 5
    # (2024-01-06), but all 10 fetched candles are still returned (days 0-4 are
    # warmup context for the frontend's own indicator recompute, not trimmed away).
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

    monkeypatch.setattr(scenario, "DATA_START", day0)
    monkeypatch.setattr(scenario, "TRIAL_START", day0 + timedelta(days=5))
    monkeypatch.setattr(scenario, "WINDOW_END", day0 + timedelta(days=9))
    monkeypatch.setattr(onboarding.alpaca_client, "get_candles", lambda *a, **k: full_candles)

    candles, result, trial_start_index = await _fetch_scenario_data()

    # nothing trimmed — all 10 fetched candles come back
    assert len(candles) == 10
    assert trial_start_index == 5
    assert candles[trial_start_index].time == full_candles[5].time
    # too few candles for the 50-EMA to warm up, so no signals fire
    assert result.signals == []


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
    assert [r.status for r in results] == ["met", "met", "met", "met", "met"]


def test_score_checklist_entry_only_leaves_exit_missed():
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
    assert [r.status for r in results] == ["met", "met", "met", "met", "missed"]


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
