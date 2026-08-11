from app.routers.onboarding import _classify, _compute_signals
from app.schemas import Candle, OnboardingTradeIn


def _candle(i: int, close: float) -> Candle:
    return Candle(time=i, open=close, high=close, low=close, close=close, volume=1.0)


def _candles(closes: list[float]) -> list[Candle]:
    return [_candle(i, c) for i, c in enumerate(closes)]


def test_compute_signals_returns_empty_list_for_no_candles():
    assert _compute_signals([]) == []


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
