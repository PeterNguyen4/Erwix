"""Deterministic evaluation of compiled StrategyRules against candle data.

Mirrors backtest_engine.py's _rule_holds, generalized so `right` can be
another indicator series instead of only a fixed constant.
"""

from app.schemas import Candle
from app.schemas_strategy import StrategyRule
from app.services.indicators import indicator_series


def _resolve_series(candles: list[Candle], key: str) -> list[float | None]:
    try:
        constant = float(key)
    except ValueError:
        return indicator_series(candles, key)
    return [constant] * len(candles)


def rule_holds(rule: StrategyRule, candles: list[Candle], i: int) -> bool:
    left = _resolve_series(candles, rule.left)
    right = _resolve_series(candles, rule.right)
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
    if i == 0:
        return False
    lprev, rprev = left[i - 1], right[i - 1]
    if lprev is None or rprev is None:
        return False
    if rule.comparator == "crosses_above":
        return lprev <= rprev and lv > rv
    if rule.comparator == "crosses_below":
        return lprev >= rprev and lv < rv
    raise ValueError(f"Unknown comparator: {rule.comparator!r}")


def evaluate_rules(candles: list[Candle], rules: list[StrategyRule]) -> list[bool]:
    """Whether each rule holds at the latest candle."""
    if not candles:
        return [False] * len(rules)
    i = len(candles) - 1
    return [rule_holds(rule, candles, i) for rule in rules]


def rules_just_fired(prev: list[bool], curr: list[bool]) -> list[int]:
    """Indices that transitioned false->true — edge-triggered so a live watch
    loop signals once per transition instead of on every poll while still true."""
    return [i for i, (p, c) in enumerate(zip(prev, curr)) if not p and c]


def price_level_signal(
    price: float,
    entry_price: float | None,
    stop_loss_price: float | None,
    take_profit_price: float | None,
) -> str | None:
    """Whether `price` has breached the stop-loss or take-profit level of a
    bracket, inferring long/short from which side of entry the take-profit
    (or failing that, the stop-loss) sits. Returns "stop_loss", "take_profit",
    or None — callers should edge-trigger on this (only act when it changes
    from the previous poll) rather than re-firing every poll while breached."""
    if entry_price is None:
        return None
    if take_profit_price is not None:
        is_long = take_profit_price >= entry_price
    elif stop_loss_price is not None:
        is_long = stop_loss_price <= entry_price
    else:
        return None

    if stop_loss_price is not None:
        breached = price <= stop_loss_price if is_long else price >= stop_loss_price
        if breached:
            return "stop_loss"
    if take_profit_price is not None:
        breached = price >= take_profit_price if is_long else price <= take_profit_price
        if breached:
            return "take_profit"
    return None
