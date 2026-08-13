"""Shared indicator math — used by both backtest_engine.py and rule_engine.py
so the two rule systems agree on numbers. Mirrors frontend/components/chart/indicators.tsx.
"""

from app.schemas import Candle


def sma(closes: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    running = 0.0
    for i, c in enumerate(closes):
        running += c
        if i >= period:
            running -= closes[i - period]
        if i >= period - 1:
            out[i] = running / period
    return out


def ema(closes: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) < period:
        return out
    k = 2 / (period + 1)
    seed = sum(closes[:period]) / period
    out[period - 1] = seed
    prev = seed
    for i in range(period, len(closes)):
        prev = closes[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(closes: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) <= period:
        return out
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        gains += max(delta, 0.0)
        losses += max(-delta, 0.0)
    avg_gain = gains / period
    avg_loss = losses / period
    out[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gain = max(delta, 0.0)
        loss = max(-delta, 0.0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        out[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    return out


def macd_line(closes: list[float]) -> list[float | None]:
    fast = ema(closes, 12)
    slow = ema(closes, 26)
    return [
        (f - s) if f is not None and s is not None else None
        for f, s in zip(fast, slow, strict=True)
    ]


def macd_signal(closes: list[float]) -> list[float | None]:
    macd = macd_line(closes)
    seed_values = [v for v in macd if v is not None]
    if len(seed_values) < 9:
        return [None] * len(closes)
    first_idx = next(i for i, v in enumerate(macd) if v is not None)
    out: list[float | None] = [None] * len(closes)
    k = 2 / (9 + 1)
    seed = sum(seed_values[:9]) / 9
    seed_idx = first_idx + 8
    out[seed_idx] = seed
    prev = seed
    for i in range(seed_idx + 1, len(closes)):
        prev = macd[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def stochastic_k(candles: list[Candle], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(candles)
    for i in range(period - 1, len(candles)):
        window = candles[i - period + 1 : i + 1]
        lowest_low = min(c.low for c in window)
        highest_high = max(c.high for c in window)
        rng = highest_high - lowest_low
        out[i] = 0.0 if rng == 0 else (candles[i].close - lowest_low) / rng * 100
    return out


def stochastic_d(
    candles: list[Candle], k_period: int = 14, d_period: int = 3
) -> list[float | None]:
    k = stochastic_k(candles, k_period)
    return _rolling_avg_optional(k, d_period)


def _rolling_avg_optional(values: list[float | None], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    window: list[float] = []
    for i, v in enumerate(values):
        if v is None:
            window = []
            continue
        window.append(v)
        if len(window) > period:
            window.pop(0)
        if len(window) == period:
            out[i] = sum(window) / period
    return out


def _wilder_smooth(values: list[float], period: int) -> list[float | None]:
    """values[0] is an unused placeholder (first real bar has no prior bar to diff against)."""
    out: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return out
    seed = sum(values[1 : period + 1])
    out[period] = seed
    prev = seed
    for i in range(period + 1, len(values)):
        prev = prev - prev / period + values[i]
        out[i] = prev
    return out


def adx(candles: list[Candle], period: int = 14) -> list[float | None]:
    """Wilder's ADX — average directional index, a 0-100 trend-strength measure
    (direction-agnostic; use alongside HA candle color for direction)."""
    n = len(candles)
    tr = [0.0] * n
    plus_dm = [0.0] * n
    minus_dm = [0.0] * n
    for i in range(1, n):
        high, low = candles[i].high, candles[i].low
        prev_high, prev_low, prev_close = (
            candles[i - 1].high,
            candles[i - 1].low,
            candles[i - 1].close,
        )
        tr[i] = max(high - low, abs(high - prev_close), abs(low - prev_close))
        up_move = high - prev_high
        down_move = prev_low - low
        plus_dm[i] = up_move if (up_move > down_move and up_move > 0) else 0.0
        minus_dm[i] = down_move if (down_move > up_move and down_move > 0) else 0.0

    tr_smooth = _wilder_smooth(tr, period)
    plus_dm_smooth = _wilder_smooth(plus_dm, period)
    minus_dm_smooth = _wilder_smooth(minus_dm, period)

    dx: list[float | None] = [None] * n
    for i in range(n):
        t, p, m = tr_smooth[i], plus_dm_smooth[i], minus_dm_smooth[i]
        if t is None or p is None or m is None or t == 0:
            continue
        plus_di = 100 * p / t
        minus_di = 100 * m / t
        denom = plus_di + minus_di
        dx[i] = 0.0 if denom == 0 else 100 * abs(plus_di - minus_di) / denom

    return _rolling_avg_optional(dx, period)


def trend_strength(candles: list[Candle], period: int = 14) -> list[float | None]:
    """Categorical: 1.0 = strong trend (ADX >= 25), 0.0 = weak/no trend."""
    return [None if v is None else (1.0 if v >= 25 else 0.0) for v in adx(candles, period)]


def candle_color(candles: list[Candle]) -> list[float | None]:
    """Categorical: 1.0 = green (close >= open), 0.0 = red."""
    return [1.0 if c.close >= c.open else 0.0 for c in candles]


def candle_body_ratio(candles: list[Candle]) -> list[float | None]:
    return [abs(c.close - c.open) / (c.high - c.low) if c.high > c.low else 0.0 for c in candles]


def candle_upper_wick_ratio(candles: list[Candle]) -> list[float | None]:
    return [
        (c.high - max(c.open, c.close)) / (c.high - c.low) if c.high > c.low else 0.0
        for c in candles
    ]


def candle_lower_wick_ratio(candles: list[Candle]) -> list[float | None]:
    return [
        (min(c.open, c.close) - c.low) / (c.high - c.low) if c.high > c.low else 0.0
        for c in candles
    ]


def heikin_ashi(candles: list[Candle]) -> list[Candle]:
    """HA_close=(O+H+L+C)/4; HA_open seeded by the first real open, then averages
    the prior HA candle's open/close; HA_high/low fold in the real high/low."""
    out: list[Candle] = []
    prev_open: float | None = None
    prev_close: float | None = None
    for c in candles:
        ha_close = (c.open + c.high + c.low + c.close) / 4
        ha_open = c.open if prev_open is None else (prev_open + prev_close) / 2
        ha_high = max(c.high, ha_open, ha_close)
        ha_low = min(c.low, ha_open, ha_close)
        out.append(
            Candle(
                time=c.time,
                open=ha_open,
                high=ha_high,
                low=ha_low,
                close=ha_close,
                volume=c.volume,
            )
        )
        prev_open, prev_close = ha_open, ha_close
    return out


def true_range(candles: list[Candle], i: int) -> float:
    c = candles[i]
    if i == 0:
        return c.high - c.low
    prev_close = candles[i - 1].close
    return max(c.high - c.low, abs(c.high - prev_close), abs(c.low - prev_close))


def atr(candles: list[Candle], period: int) -> list[float | None]:
    n = len(candles)
    out: list[float | None] = [None] * n
    if n < period:
        return out
    running = sum(true_range(candles, i) for i in range(period))
    value = running / period
    out[period - 1] = value
    for i in range(period, n):
        value = (value * (period - 1) + true_range(candles, i)) / period
        out[i] = value
    return out


def chandelier_stop(
    candles: list[Candle], length: int = 22, atr_period: int = 22, mult: float = 3.0
) -> list[float | None]:
    """Mirrors frontend Chandelier."""
    n = len(candles)
    out: list[float | None] = [None] * n
    start = max(length, atr_period) - 1
    if start < 0 or start >= n:
        return out

    atr_series = atr(candles, atr_period)
    shortvs_prev: float | None = None
    longvs_prev: float | None = None
    direction = 0

    for i in range(start, n):
        a = atr_series[i]
        if a is None:
            continue
        window = candles[max(0, i - length + 1) : i + 1]
        highest_high = max(c.high for c in window)
        lowest_low = min(c.low for c in window)
        long_stop = highest_high - mult * a
        short_stop = lowest_low + mult * a
        close = candles[i].close
        prev_close = candles[i - 1].close if i > 0 else close

        shortvs = (
            short_stop
            if shortvs_prev is None
            else (short_stop if close > shortvs_prev else min(short_stop, shortvs_prev))
        )
        longvs = (
            long_stop
            if longvs_prev is None
            else (long_stop if close < longvs_prev else max(long_stop, longvs_prev))
        )

        long_switch = shortvs_prev is not None and close >= shortvs_prev and prev_close < shortvs_prev
        short_switch = longvs_prev is not None and close <= longvs_prev and prev_close > longvs_prev
        if direction <= 0 and long_switch:
            direction = 1
        elif direction >= 0 and short_switch:
            direction = -1

        out[i] = longvs if direction > 0 else shortvs
        shortvs_prev, longvs_prev = shortvs, longvs

    return out


def indicator_series(candles: list[Candle], name: str) -> list[float | None]:
    if name.startswith("ha_"):
        return _series(heikin_ashi(candles), name[len("ha_") :])
    return _series(candles, name)


def _series(candles: list[Candle], name: str) -> list[float | None]:
    if name == "close":
        return [c.close for c in candles]
    if name == "open":
        return [c.open for c in candles]
    if name == "high":
        return [c.high for c in candles]
    if name == "low":
        return [c.low for c in candles]
    closes = [c.close for c in candles]
    if name.startswith("sma_"):
        return sma(closes, int(name.split("_")[1]))
    if name.startswith("ema_"):
        return ema(closes, int(name.split("_")[1]))
    if name.startswith("rsi_"):
        return rsi(closes, int(name.split("_")[1]))
    if name == "macd":
        return macd_line(closes)
    if name == "macd_signal":
        return macd_signal(closes)
    if name.startswith("stoch_k_"):
        return stochastic_k(candles, int(name.split("_")[2]))
    if name.startswith("stoch_d_"):
        return stochastic_d(candles, int(name.split("_")[2]))
    if name.startswith("trend_strength_"):
        return trend_strength(candles, int(name.split("_")[2]))
    if name == "color":
        return candle_color(candles)
    if name == "body_ratio":
        return candle_body_ratio(candles)
    if name == "upper_wick_ratio":
        return candle_upper_wick_ratio(candles)
    if name == "lower_wick_ratio":
        return candle_lower_wick_ratio(candles)
    raise ValueError(f"Unknown indicator: {name!r}")
