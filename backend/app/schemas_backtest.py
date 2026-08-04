"""Structured backtest rule config — the "script" is this JSON shape, not a DSL.

Shared between backend validation (router/engine) and the config-chat agent's
`with_structured_output` call, so the LLM and the engine always agree on shape.
"""

from typing import Literal

from pydantic import BaseModel, Field


class BacktestRule(BaseModel):
    indicator: str  # e.g. "rsi_14", "sma_50", "close", "sma_200"
    comparator: Literal["<", "<=", ">", ">=", "==", "crosses_above", "crosses_below"]
    value: str  # numeric literal (e.g. "30") or another indicator key (e.g. "sma_50")


class BacktestSizing(BaseModel):
    mode: Literal["fixed_qty", "pct_equity", "pct_risk"] = "fixed_qty"
    value: float = 1.0


class BacktestRisk(BaseModel):
    value: float  # percent for pct-based, absolute price offset otherwise


class BacktestConfig(BaseModel):
    id: int | None = None
    name: str = "Plan"
    symbol: str
    timeframe: str = "1Day"
    direction: Literal["long", "short", "both"] = "long"
    entry_rules: list[BacktestRule] = Field(default_factory=list)
    exit_rules: list[BacktestRule] = Field(default_factory=list)
    position_sizing: BacktestSizing = Field(default_factory=BacktestSizing)
    stop_loss: BacktestRisk | None = None
    take_profit: BacktestRisk | None = None
    max_concurrent_positions: int = 1


class BacktestTrade(BaseModel):
    entry_time: int
    exit_time: int | None
    side: Literal["long", "short"]
    qty: float
    entry_price: float
    exit_price: float | None
    profit_loss: float | None


class BacktestResult(BaseModel):
    trades: list[BacktestTrade]
    equity_curve: list[dict]  # [{time, equity, profit_loss}, ...] — matches PortfolioPoint
    stats: dict[str, float]
