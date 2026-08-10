from app.schemas import Candle
from app.schemas_strategy import CandleStep, GatedRule, PatternRule, StrategyRule
from app.services.rule_engine import (
    evaluate_rules,
    rules_just_fired,
    signal_price_level,
)


def _candle(
    i: int,
    close: float,
    open_: float | None = None,
    high: float | None = None,
    low: float | None = None,
) -> Candle:
    o = open_ if open_ is not None else close
    return Candle(
        time=i,
        open=o,
        high=high or max(o, close),
        low=low or min(o, close),
        close=close,
        volume=1.0,
    )


def _candles(closes: list[float]) -> list[Candle]:
    return [_candle(i, c) for i, c in enumerate(closes)]


def test_comparison_rule_holds_on__valid_latest_candle_condition():
    rule = StrategyRule(left="close", comparator=">", right="100", description="close > 100")
    candles = _candles([90, 95, 105])
    assert evaluate_rules(candles, [rule]) == [True]


def test_comparison_rule_rejects_on_invalid_latest_candle_condition():
    rule = StrategyRule(left="close", comparator=">", right="100", description="close > 100")
    candles = _candles([90, 95, 99])
    assert evaluate_rules(candles, [rule]) == [False]


def test_crosses_above_rule_requires_prior_candle_below_threshold():
    rule = StrategyRule(
        left="close",
        comparator="crosses_above",
        right="100",
        description="crosses above 100",
    )
    # prior close (95) <= 100, current close (105) > 100 -> True
    candles = _candles([90, 95, 105])
    assert evaluate_rules(candles, [rule]) == [True]


def test_crosses_above_rule_rejects_when_already_above_threshold():
    rule = StrategyRule(
        left="close",
        comparator="crosses_above",
        right="100",
        description="crosses above 100",
    )
    # prior close (105) already above 100 -> not a fresh cross
    candles = _candles([90, 105, 110])
    assert evaluate_rules(candles, [rule]) == [False]


def test_crosses_above_rule_rejects_on_first_candle():
    rule = StrategyRule(
        left="close",
        comparator="crosses_above",
        right="100",
        description="crosses above 100",
    )
    candles = _candles([105])
    assert evaluate_rules(candles, [rule]) == [False]


def test_crosses_below_rule():
    rule = StrategyRule(
        left="close",
        comparator="crosses_below",
        right="100",
        description="crosses below 100",
    )
    candles = _candles([110, 105, 95])
    assert evaluate_rules(candles, [rule]) == [True]


def test_gated_rule_requires_both_condition_and_gate():
    condition = StrategyRule(left="close", comparator=">", right="100", description="close > 100")
    gate = StrategyRule(left="close", comparator="<", right="200", description="close < 200")
    rule = GatedRule(condition=condition, gate=gate, description="gated")

    holds = _candles([90, 95, 150])
    assert evaluate_rules(holds, [rule]) == [True]

    gate_fails = _candles([90, 95, 250])
    assert evaluate_rules(gate_fails, [rule]) == [False]


def test_pattern_rule_matches_two_green_candles():
    rule = PatternRule(
        source="candle",
        steps=[CandleStep(color="green"), CandleStep(color="green")],
        description="two green candles",
    )
    candles = [
        _candle(0, close=101, open_=100),
        _candle(1, close=103, open_=102),
    ]
    assert evaluate_rules(candles, [rule]) == [True]


def test_pattern_rule_fails_when_last_candle_wrong_color():
    rule = PatternRule(
        source="candle",
        steps=[CandleStep(color="green"), CandleStep(color="green")],
        description="two green candles",
    )
    candles = [
        _candle(0, close=101, open_=100),
        _candle(1, close=99, open_=102),
    ]
    assert evaluate_rules(candles, [rule]) == [False]


def test_pattern_rule_false_when_not_enough_history():
    rule = PatternRule(
        source="candle",
        steps=[CandleStep(color="green"), CandleStep(color="green")],
        description="two green candles",
    )
    candles = [_candle(0, close=101, open_=100)]
    assert evaluate_rules(candles, [rule]) == [False]


def test_evaluate_rules_empty_candles_returns_all_false():
    rule = StrategyRule(left="close", comparator=">", right="100", description="close > 100")
    assert evaluate_rules([], [rule, rule]) == [False, False]


def test_rules_just_fired_only_edge_triggers_false_to_true():
    prev = [False, True, False]
    curr = [True, True, True]
    # index 0: False->True fires, index 1: already True (no fire), index 2: False->True fires
    assert rules_just_fired(prev, curr) == [0, 2]


def test_rules_just_fired_no_fires_when_nothing_changes():
    assert rules_just_fired([True, False], [True, False]) == []


def test_signal_price_level_long_stop_loss_breach():
    # long position: stop below entry, breached when price drops to/through it
    assert (
        signal_price_level(price=94, entry_price=100, stop_loss_price=95, take_profit_price=110)
        == "stop_loss"
    )


def test_signal_price_level_long_take_profit_breach():
    assert (
        signal_price_level(price=111, entry_price=100, stop_loss_price=95, take_profit_price=110)
        == "take_profit"
    )


def test_signal_price_level_long_no_breach():
    assert (
        signal_price_level(price=105, entry_price=100, stop_loss_price=95, take_profit_price=110)
        is None
    )


def test_signal_price_level_short_stop_loss_breach():
    # short position: stop above entry, breached when price rises to/through it
    assert (
        signal_price_level(price=106, entry_price=100, stop_loss_price=105, take_profit_price=90)
        == "stop_loss"
    )


def test_signal_price_level_short_take_profit_breach():
    # short position: target below entry, breached when price falls to/through it
    assert (
        signal_price_level(price=89, entry_price=100, stop_loss_price=105, take_profit_price=90)
        == "take_profit"
    )


def test_signal_price_level_none_when_no_entry_price():
    assert (
        signal_price_level(price=100, entry_price=None, stop_loss_price=95, take_profit_price=110)
        is None
    )


def test_signal_price_level_none_when_levels_unset():
    assert (
        signal_price_level(price=100, entry_price=100, stop_loss_price=None, take_profit_price=None)
        is None
    )
