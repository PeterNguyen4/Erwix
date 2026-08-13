from app.schemas import Candle
from app.schemas_strategy import GatedRule, PatternRule, StrategyRule
from app.services.indicators import (
    candle_body_ratio,
    candle_color,
    candle_lower_wick_ratio,
    candle_upper_wick_ratio,
    heikin_ashi,
    indicator_series,
)

AnyRule = StrategyRule | PatternRule | GatedRule


def _resolve_series(candles: list[Candle], key: str) -> list[float | None]:
    try:
        constant = float(key)
    except ValueError:
        return indicator_series(candles, key)
    return [constant] * len(candles)


def _cmp_keys(rule) -> tuple[str, str]:
    if hasattr(rule, "left"):
        return rule.left, rule.right
    return rule.indicator, rule.value


def rule_holds(rule, candles: list[Candle], i: int) -> bool:
    left_key, right_key = _cmp_keys(rule)
    left = _resolve_series(candles, left_key)
    right = _resolve_series(candles, right_key)
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


def pattern_holds(rule: PatternRule, candles: list[Candle], i: int) -> bool:
    n = len(rule.steps)
    if i < n - 1:
        return False
    source = heikin_ashi(candles) if rule.source == "ha" else candles
    colors = candle_color(source)
    bodies = candle_body_ratio(source)
    upper_wicks = candle_upper_wick_ratio(source)
    lower_wicks = candle_lower_wick_ratio(source)

    for offset, step in enumerate(rule.steps):
        idx = i - (n - 1) + offset
        color = colors[idx]
        if color is None:
            return False
        if (step.color == "green") != (color == 1.0):
            return False
        if step.min_body_ratio is not None and (bodies[idx] or 0) < step.min_body_ratio:
            return False
        if (
            step.max_upper_wick_ratio is not None
            and (upper_wicks[idx] or 0) > step.max_upper_wick_ratio
        ):
            return False
        if (
            step.max_lower_wick_ratio is not None
            and (lower_wicks[idx] or 0) > step.max_lower_wick_ratio
        ):
            return False
    return True


def gated_holds(rule: GatedRule, candles: list[Candle], i: int) -> bool:
    return evaluate_rule(rule.condition, candles, i) and evaluate_rule(rule.gate, candles, i)


def evaluate_rule(rule, candles: list[Candle], i: int) -> bool:
    rule_type = getattr(rule, "type", "comparison")
    if rule_type == "pattern":
        return pattern_holds(rule, candles, i)
    if rule_type == "gated":
        return gated_holds(rule, candles, i)
    return rule_holds(rule, candles, i)


def evaluate_rules(candles: list[Candle], rules: list) -> list[bool]:
    if not candles:
        return [False] * len(rules)
    i = len(candles) - 1
    return [evaluate_rule(rule, candles, i) for rule in rules]


def evaluate_rules_at(candles: list[Candle], rules: list, i: int) -> list[bool]:
    if not candles or i < 0 or i >= len(candles):
        return [False] * len(rules)
    return [evaluate_rule(rule, candles, i) for rule in rules]


def rules_just_fired(prev: list[bool], curr: list[bool]) -> list[int]:
    return [i for i, (p, c) in enumerate(zip(prev, curr, strict=True)) if not p and c]


def signal_price_level(
    price: float,
    entry_price: float | None,
    stop_loss_price: float | None,
    take_profit_price: float | None,
) -> str | None:
    if entry_price is None:
        return None

    if stop_loss_price is not None:
        breached = (
            price <= stop_loss_price if stop_loss_price <= entry_price else price >= stop_loss_price
        )
        if breached:
            return "stop_loss"
    if take_profit_price is not None:
        breached = (
            price >= take_profit_price
            if take_profit_price >= entry_price
            else price <= take_profit_price
        )
        if breached:
            return "take_profit"
    return None
