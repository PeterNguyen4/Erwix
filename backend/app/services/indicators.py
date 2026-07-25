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
        for f, s in zip(fast, slow)
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
        out.append(Candle(time=c.time, open=ha_open, high=ha_high, low=ha_low, close=ha_close, volume=c.volume))
        prev_open, prev_close = ha_open, ha_close
    return out


def indicator_series(candles: list[Candle], name: str) -> list[float | None]:
    if name.startswith("ha_"):
        return _series(heikin_ashi(candles), name[len("ha_"):])
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
    raise ValueError(f"Unknown indicator: {name!r}")
