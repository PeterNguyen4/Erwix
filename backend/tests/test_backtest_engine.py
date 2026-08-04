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
