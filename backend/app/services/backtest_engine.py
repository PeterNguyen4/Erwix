"""Bar-by-bar backtest replay engine.

Pure/no I/O: given a candle series and a BacktestConfig, simulates fills
locally (no real Alpaca orders) and produces a trade log + equity curve.
Indicator math mirrors frontend/components/chart/indicators.tsx (sma/ema/rsi/macd)
so hint-options snippets map 1:1 onto what the chart already draws.
"""

from app.schemas import Candle
from app.schemas_backtest import BacktestConfig, BacktestResult, BacktestRule, BacktestTrade
from app.services.indicators import indicator_series as _indicator_series

_INITIAL_EQUITY = 100_000.0


def _resolve_series(value: str, series_by_indicator: dict[str, list[float | None]], n: int) -> list[float | None]:
    try:
        constant = float(value)
    except ValueError:
        return series_by_indicator[value]
    return [constant] * n


def _rule_holds(rule: BacktestRule, series_by_indicator: dict[str, list[float | None]], n: int, i: int) -> bool:
    left = series_by_indicator[rule.indicator]
    right = _resolve_series(rule.value, series_by_indicator, n)
    lv, rv = left[i], right[i]
    if lv is None or rv is None:
        return False
    if rule.comparator == "<":
        return lv < rv
    if rule.comparator == "<=":
        return lv <= rv
    if rule.comparator == ">":
        return lv > rv
    if rule.comparator == ">=":
        return lv >= rv
    if rule.comparator == "==":
        return lv == rv
    lprev = left[i - 1] if i > 0 else None
    rprev = right[i - 1] if i > 0 else None
    if lprev is None or rprev is None:
        return False
    if rule.comparator == "crosses_above":
        return lprev <= rprev and lv > rv
    if rule.comparator == "crosses_below":
        return lprev >= rprev and lv < rv
    raise ValueError(f"Unknown comparator: {rule.comparator!r}")


def _rules_hold(rules: list[BacktestRule], series_by_indicator: dict[str, list[float | None]], n: int, i: int) -> bool:
    if not rules:
        return False
    return all(_rule_holds(r, series_by_indicator, n, i) for r in rules)


def _needed_indicators(rules: list[BacktestRule]) -> set[str]:
    names: set[str] = set()
    for r in rules:
        names.add(r.indicator)
        try:
            float(r.value)
        except ValueError:
            names.add(r.value)
    return names


def _position_qty(config: BacktestConfig, equity: float, price: float) -> float:
    sizing = config.position_sizing
    if sizing.mode == "fixed_qty":
        return sizing.value
    if sizing.mode == "pct_equity":
        return (equity * sizing.value / 100) / price
    if sizing.mode == "pct_risk":
        return (equity * sizing.value / 100) / price
    raise ValueError(f"Unknown sizing mode: {sizing.mode!r}")


def run_backtest(candles: list[Candle], config: BacktestConfig) -> BacktestResult:
    if not candles:
        return BacktestResult(trades=[], equity_curve=[], stats={})

    needed = _needed_indicators(config.entry_rules) | _needed_indicators(config.exit_rules)
    series_by_indicator = {name: _indicator_series(candles, name) for name in needed}
    n = len(candles)

    equity = _INITIAL_EQUITY
    equity_curve: list[dict] = []
    trades: list[BacktestTrade] = []

    open_trade: BacktestTrade | None = None
    open_side: str | None = None
    open_qty = 0.0

    for i, candle in enumerate(candles):
        price = candle.close

        if open_trade is None:
            can_long = config.direction in ("long", "both") and _rules_hold(
                config.entry_rules, series_by_indicator, n, i
            )
            can_short = config.direction in ("short", "both") and _rules_hold(
                config.entry_rules, series_by_indicator, n, i
            )
            side = "long" if can_long else ("short" if can_short else None)
            if side is not None:
                qty = _position_qty(config, equity, price)
                open_side = side
                open_qty = qty
                open_trade = BacktestTrade(
                    entry_time=candle.time,
                    exit_time=None,
                    side=side,
                    qty=qty,
                    entry_price=price,
                    exit_price=None,
                    profit_loss=None,
                )
        else:
            hit_stop = False
            hit_target = False
            if config.stop_loss is not None:
                offset = config.stop_loss.value
                if open_side == "long":
                    hit_stop = price <= open_trade.entry_price * (1 - offset / 100)
                else:
                    hit_stop = price >= open_trade.entry_price * (1 + offset / 100)
            if config.take_profit is not None:
                offset = config.take_profit.value
                if open_side == "long":
                    hit_target = price >= open_trade.entry_price * (1 + offset / 100)
                else:
                    hit_target = price <= open_trade.entry_price * (1 - offset / 100)

            should_exit = (
                hit_stop
                or hit_target
                or _rules_hold(config.exit_rules, series_by_indicator, n, i)
            )
            if should_exit:
                direction_mult = 1 if open_side == "long" else -1
                pnl = direction_mult * (price - open_trade.entry_price) * open_qty
                open_trade.exit_time = candle.time
                open_trade.exit_price = price
                open_trade.profit_loss = pnl
                equity += pnl
                trades.append(open_trade)
                open_trade = None
                open_side = None
                open_qty = 0.0

        unrealized = 0.0
        if open_trade is not None:
            direction_mult = 1 if open_side == "long" else -1
            unrealized = direction_mult * (price - open_trade.entry_price) * open_qty
        equity_curve.append(
            {"time": candle.time, "equity": equity + unrealized, "profit_loss": equity + unrealized - _INITIAL_EQUITY}
        )

    if open_trade is not None:
        trades.append(open_trade)

    closed = [t for t in trades if t.profit_loss is not None]
    wins = [t for t in closed if t.profit_loss > 0]
    losses = [t for t in closed if t.profit_loss <= 0]
    stats = {
        "total_trades": float(len(closed)),
        "win_count": float(len(wins)),
        "loss_count": float(len(losses)),
        "win_rate": (len(wins) / len(closed) * 100) if closed else 0.0,
        "total_pnl": sum(t.profit_loss for t in closed),
        "final_equity": equity,
    }

    return BacktestResult(trades=trades, equity_curve=equity_curve, stats=stats)
