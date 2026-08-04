from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.schemas_strategy import GatedRule, PatternRule


class BacktestRule(BaseModel):
    type: Literal["comparison"] = "comparison"
    indicator: str 
    comparator: Literal["<", "<=", ">", ">=", "==", "crosses_above", "crosses_below"]
    value: str


AnyBacktestRule = Annotated[Union[BacktestRule, PatternRule, GatedRule], Field(discriminator="type")]


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
    entry_rules: list[AnyBacktestRule] = Field(default_factory=list)
    exit_rules: list[AnyBacktestRule] = Field(default_factory=list)
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
    equity_curve: list[dict]  # [{time, equity, profit_loss}, ...]
    stats: dict[str, float]
