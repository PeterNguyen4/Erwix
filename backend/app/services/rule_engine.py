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
