import pytest

from app.schemas import Candle
from app.schemas_backtest import BacktestConfig, BacktestRisk, BacktestRule, BacktestSizing
from app.services.backtest_engine import run_backtest


def _candle(time: int, close: float) -> Candle:
    return Candle(time=time, open=close, high=close, low=close, close=close, volume=100)


def test_run_backtest_long_entry_and_take_profit():
    # Price dips below 10 (entry trigger), then rallies to +10% (take-profit trigger).
    closes = [20, 15, 9, 9.5, 10, 11]
    candles = [_candle(i, c) for i, c in enumerate(closes)]

    config = BacktestConfig(
        symbol="TEST",
        direction="long",
        entry_rules=[BacktestRule(indicator="close", comparator="<", value="10")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
        take_profit=BacktestRisk(value=10),
    )

    result = run_backtest(candles, config)

    assert len(result.trades) == 1
    trade = result.trades[0]
    assert trade.side == "long"
    assert trade.entry_price == 9
    assert trade.exit_price == 10 * 1.1 or trade.exit_price >= 9 * 1.10
    assert trade.profit_loss > 0
    assert result.stats["total_trades"] == 1
    assert result.stats["win_count"] == 1
    assert len(result.equity_curve) == len(candles)


def test_run_backtest_no_entry_signal_yields_no_trades():
    candles = [_candle(i, 100 + i) for i in range(5)]
    config = BacktestConfig(
        symbol="TEST",
        direction="long",
        entry_rules=[BacktestRule(indicator="close", comparator="<", value="0")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
    )

    result = run_backtest(candles, config)

    assert result.trades == []
    assert result.stats["total_trades"] == 0
    assert result.equity_curve[-1]["equity"] == 100_000.0


def test_run_backtest_stop_loss_triggers_exit():
    closes = [10, 10, 8.5]
    candles = [_candle(i, c) for i, c in enumerate(closes)]
    config = BacktestConfig(
        symbol="TEST",
        direction="long",
        entry_rules=[BacktestRule(indicator="close", comparator="<=", value="10")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
        stop_loss=BacktestRisk(value=10),
    )

    result = run_backtest(candles, config)

    assert len(result.trades) == 1
    trade = result.trades[0]
    assert trade.profit_loss < 0


def test_run_backtest_short_entry_and_take_profit():
    # Price rallies above 10 (short entry trigger), then drops -10% (take-profit for a short).
    closes = [5, 8, 11, 10.5, 10, 9]
    candles = [_candle(i, c) for i, c in enumerate(closes)]

    config = BacktestConfig(
        symbol="TEST",
        direction="short",
        entry_rules=[BacktestRule(indicator="close", comparator=">", value="10")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
        take_profit=BacktestRisk(value=10),
    )

    result = run_backtest(candles, config)

    assert len(result.trades) == 1
    trade = result.trades[0]
    assert trade.side == "short"
    assert trade.entry_price == 11
    assert trade.profit_loss > 0


def test_run_backtest_short_stop_loss_triggers_exit():
    closes = [10, 10, 11.5]
    candles = [_candle(i, c) for i, c in enumerate(closes)]
    config = BacktestConfig(
        symbol="TEST",
        direction="short",
        entry_rules=[BacktestRule(indicator="close", comparator="<=", value="10")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
        stop_loss=BacktestRisk(value=10),
    )

    result = run_backtest(candles, config)

    assert len(result.trades) == 1
    assert result.trades[0].profit_loss < 0


def test_run_backtest_exit_rule_closes_position_without_stop_or_target():
    closes = [10, 10, 20]
    candles = [_candle(i, c) for i, c in enumerate(closes)]
    config = BacktestConfig(
        symbol="TEST",
        direction="long",
        entry_rules=[BacktestRule(indicator="close", comparator="<=", value="10")],
        exit_rules=[BacktestRule(indicator="close", comparator=">=", value="20")],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
    )

    result = run_backtest(candles, config)

    assert len(result.trades) == 1
    assert result.trades[0].exit_price == 20
    assert result.trades[0].profit_loss == pytest.approx(10)


def test_run_backtest_leaves_final_open_trade_in_trades_but_excludes_from_stats():
    closes = [10, 9, 8]  # entry triggers, never exits
    candles = [_candle(i, c) for i, c in enumerate(closes)]
    config = BacktestConfig(
        symbol="TEST",
        direction="long",
        entry_rules=[BacktestRule(indicator="close", comparator="<=", value="10")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
    )

    result = run_backtest(candles, config)

    assert len(result.trades) == 1
    assert result.trades[0].profit_loss is None
    assert result.trades[0].exit_time is None
    assert result.stats["total_trades"] == 0  # open trades aren't "closed"


def test_run_backtest_pct_equity_sizing_scales_with_equity():
    closes = [10, 10]
    candles = [_candle(i, c) for i, c in enumerate(closes)]
    config = BacktestConfig(
        symbol="TEST",
        direction="long",
        entry_rules=[BacktestRule(indicator="close", comparator="<=", value="10")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="pct_equity", value=10),  # 10% of 100k @ $10 = 1000 shares
    )

    result = run_backtest(candles, config)

    assert result.trades[0].qty == pytest.approx(1000.0)


def test_run_backtest_empty_candles_returns_empty_result():
    config = BacktestConfig(
        symbol="TEST", direction="long",
        entry_rules=[], exit_rules=[], position_sizing=BacktestSizing(mode="fixed_qty", value=1),
    )
    result = run_backtest([], config)
    assert result.trades == []
    assert result.equity_curve == []
    assert result.stats == {}


def test_run_backtest_equity_curve_reflects_unrealized_pnl_mid_trade():
    closes = [10, 15]  # entry at 10, still open at 15 -> unrealized +5/share
    candles = [_candle(i, c) for i, c in enumerate(closes)]
    config = BacktestConfig(
        symbol="TEST",
        direction="long",
        entry_rules=[BacktestRule(indicator="close", comparator="<=", value="10")],
        exit_rules=[],
        position_sizing=BacktestSizing(mode="fixed_qty", value=1),
    )

    result = run_backtest(candles, config)

    assert result.equity_curve[1]["equity"] == pytest.approx(100_000.0 + 5.0)
