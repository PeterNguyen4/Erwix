import pytest

from app.schemas import Candle
from app.services.indicators import (
    adx,
    candle_body_ratio,
    candle_color,
    candle_lower_wick_ratio,
    candle_upper_wick_ratio,
    ema,
    heikin_ashi,
    indicator_series,
    macd_line,
    macd_signal,
    rsi,
    sma,
    stochastic_d,
    stochastic_k,
    trend_strength,
)


def _candle(i: int, open_: float, high: float, low: float, close: float) -> Candle:
    return Candle(time=i, open=open_, high=high, low=low, close=close, volume=1.0)


def _flat_candles(closes: list[float]) -> list[Candle]:
    # open == close, high/low pad slightly so body/wick ratios aren't degenerate unless intended
    return [_candle(i, c, c + 1, c - 1, c) for i, c in enumerate(closes)]


def test_sma_basic_window():
    assert sma([1, 2, 3, 4, 5], period=3) == [None, None, 2.0, 3.0, 4.0]


def test_sma_period_longer_than_series_returns_all_none():
    assert sma([1, 2], period=3) == [None, None]


def test_ema_seeds_with_sma_then_smooths():
    # period 3, k = 0.5: seed at index2 = mean(1,2,3)=2; idx3 = 4*0.5+2*0.5=3; idx4 = 5*0.5+3*0.5=4
    assert ema([1, 2, 3, 4, 5], period=3) == [None, None, 2.0, 3.0, 4.0]


def test_ema_returns_all_none_when_too_short():
    assert ema([1, 2], period=3) == [None, None]


def test_rsi_pure_uptrend_is_100():
    closes = [1, 2, 3, 4, 5, 6]
    result = rsi(closes, period=3)
    assert result[:3] == [None, None, None]
    assert all(v == pytest.approx(100.0) for v in result[3:])


def test_rsi_pure_downtrend_is_0():
    closes = [6, 5, 4, 3, 2, 1]
    result = rsi(closes, period=3)
    assert all(v == pytest.approx(0.0) for v in result[3:])


def test_rsi_returns_all_none_when_too_short():
    assert rsi([1, 2, 3], period=14) == [None, None, None]


def test_macd_line_is_zero_for_constant_series():
    closes = [100.0] * 30
    result = macd_line(closes)
    # both emas seed at the same constant value once defined, so macd collapses to 0
    defined = [v for v in result if v is not None]
    assert defined
    assert all(v == pytest.approx(0.0) for v in defined)


def test_macd_line_none_before_slow_ema_is_defined():
    closes = [100.0] * 30
    result = macd_line(closes)
    assert result[:25] == [None] * 25


def test_macd_signal_none_when_too_few_macd_points():
    closes = [100.0] * 20  # slow ema(26) never seeds -> macd all None -> signal all None
    assert macd_signal(closes) == [None] * 20


def test_macd_signal_converges_to_zero_for_constant_series():
    closes = [100.0] * 40
    result = macd_signal(closes)
    defined = [v for v in result if v is not None]
    assert defined
    assert all(v == pytest.approx(0.0) for v in defined)


def test_stochastic_k_100_when_close_at_period_high():
    candles = [_candle(i, 10, 10 + i, 10 - i, 10) for i in range(3)]
    # last candle's close (10) equals the window's highest high only if high==10 for last bar too
    candles[-1] = _candle(2, 10, 20, 5, 20)  # close at the high
    result = stochastic_k(candles, period=3)
    assert result[2] == pytest.approx(100.0)


def test_stochastic_k_0_when_close_at_period_low():
    candles = [_candle(0, 10, 15, 5, 10), _candle(1, 10, 15, 5, 10), _candle(2, 10, 15, 5, 5)]
    result = stochastic_k(candles, period=3)
    assert result[2] == pytest.approx(0.0)


def test_stochastic_k_zero_when_range_is_flat():
    candles = [_candle(i, 10, 10, 10, 10) for i in range(3)]
    result = stochastic_k(candles, period=3)
    assert result[2] == pytest.approx(0.0)


def test_stochastic_k_none_before_period():
    candles = [_candle(i, 10, 11, 9, 10) for i in range(2)]
    result = stochastic_k(candles, period=3)
    assert result == [None, None]


def test_stochastic_d_is_rolling_average_of_k():
    candles = [_candle(i, 10, 10 + i, 10 - i, 10 + i) for i in range(10)]
    k = stochastic_k(candles, period=3)
    d = stochastic_d(candles, k_period=3, d_period=3)
    defined_idx = [i for i, v in enumerate(d) if v is not None]
    assert defined_idx
    for i in defined_idx:
        window = [x for x in k[i - 2 : i + 1]]
        assert d[i] == pytest.approx(sum(window) / 3)


def test_adx_returns_none_when_series_too_short():
    candles = [_candle(i, 10, 11, 9, 10) for i in range(5)]
    assert adx(candles, period=14) == [None] * 5


def test_adx_defined_and_bounded_for_trending_series():
    candles = [_candle(i, 10 + i, 11 + i, 9 + i, 10.5 + i) for i in range(30)]
    result = adx(candles, period=14)
    defined = [v for v in result if v is not None]
    assert defined
    assert all(0.0 <= v <= 100.0 for v in defined)


def test_trend_strength_is_categorical():
    candles = [_candle(i, 10 + i, 11 + i, 9 + i, 10.5 + i) for i in range(30)]
    result = trend_strength(candles, period=14)
    for v in result:
        assert v is None or v in (0.0, 1.0)


def test_candle_color_green_when_close_gte_open():
    candles = [_candle(0, 10, 11, 9, 11), _candle(1, 10, 11, 9, 9), _candle(2, 10, 11, 9, 10)]
    assert candle_color(candles) == [1.0, 0.0, 1.0]


def test_candle_body_ratio_full_body_candle():
    # open==low, close==high -> body spans the entire range
    candles = [_candle(0, 10, 20, 10, 20)]
    assert candle_body_ratio(candles) == [1.0]


def test_candle_body_ratio_doji_is_zero():
    candles = [_candle(0, 10, 20, 5, 10)]
    assert candle_body_ratio(candles) == [0.0]


def test_candle_body_ratio_flat_high_low_is_zero():
    candles = [_candle(0, 10, 10, 10, 10)]
    assert candle_body_ratio(candles) == [0.0]


def test_candle_upper_wick_ratio():
    # open=10, close=12, high=20, low=10 -> upper wick = 20-12=8, range=10 -> 0.8
    candles = [_candle(0, 10, 20, 10, 12)]
    assert candle_upper_wick_ratio(candles) == [pytest.approx(0.8)]


def test_candle_lower_wick_ratio():
    # open=12, close=10, high=12, low=0 -> lower wick = min(12,10)-0=10, range=12 -> 0.8333
    candles = [_candle(0, 12, 12, 0, 10)]
    assert candle_lower_wick_ratio(candles) == [pytest.approx(10 / 12)]


def test_heikin_ashi_first_candle_open_equals_real_open():
    candles = [_candle(0, 10, 12, 8, 11)]
    ha = heikin_ashi(candles)
    assert ha[0].open == pytest.approx(10)
    assert ha[0].close == pytest.approx((10 + 12 + 8 + 11) / 4)


def test_heikin_ashi_second_candle_open_averages_prior_ha():
    candles = [_candle(0, 10, 12, 8, 11), _candle(1, 11, 14, 10, 13)]
    ha = heikin_ashi(candles)
    expected_open = (ha[0].open + ha[0].close) / 2
    assert ha[1].open == pytest.approx(expected_open)


def test_heikin_ashi_high_low_fold_in_real_extremes():
    candles = [_candle(0, 10, 12, 8, 11)]
    ha = heikin_ashi(candles)
    assert ha[0].high == max(12, ha[0].open, ha[0].close)
    assert ha[0].low == min(8, ha[0].open, ha[0].close)


def test_indicator_series_close():
    candles = [_candle(0, 10, 11, 9, 10.5)]
    assert indicator_series(candles, "close") == [10.5]


def test_indicator_series_ha_prefix_uses_heikin_ashi_close():
    candles = [_candle(0, 10, 12, 8, 11)]
    result = indicator_series(candles, "ha_close")
    assert result == [pytest.approx((10 + 12 + 8 + 11) / 4)]


def test_indicator_series_sma_dispatch():
    candles = [_candle(i, c, c, c, c) for i, c in enumerate([1, 2, 3])]
    assert indicator_series(candles, "sma_3") == [None, None, 2.0]


def test_indicator_series_unknown_raises():
    candles = [_candle(0, 10, 11, 9, 10)]
    with pytest.raises(ValueError):
        indicator_series(candles, "not_a_real_indicator")
