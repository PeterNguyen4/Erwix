from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class StrategyRule(BaseModel):
    type: Literal["comparison"] = "comparison"
    left: str  # indicator, e.g. "ha_close"
    comparator: Literal["<", "<=", ">", ">=", "==", "crosses_above", "crosses_below"]
    right: str  # numeric ("100") or indicator ("ema_100")
    description: str  # plain-English label, e.g. "Heikin Ashi close above EMA 100"


class CandleStep(BaseModel):
    color: Literal["green", "red"]
    min_body_ratio: float | None = None
    max_upper_wick_ratio: float | None = None
    max_lower_wick_ratio: float | None = None


class PatternRule(BaseModel):
    type: Literal["pattern"] = "pattern"
    source: Literal["ha", "candle"] = "ha"
    steps: list[CandleStep]
    description: str



Condition = Annotated[Union[StrategyRule, PatternRule], Field(discriminator="type")]


class GatedRule(BaseModel):
    type: Literal["gated"] = "gated"
    condition: Condition
    gate: StrategyRule
    description: str


AnyRule = Annotated[Union[StrategyRule, PatternRule, GatedRule], Field(discriminator="type")]


class StrategyRuleSet(BaseModel):
    entry_rules: list[AnyRule] = Field(default_factory=list)
    exit_rules: list[AnyRule] = Field(default_factory=list)


class StrategyRuleSetOut(BaseModel):
    rules: StrategyRuleSet | None
    compiled_model: str | None
    compiled_at: datetime | None
    is_stale: bool
    compile_error: str | None = None
