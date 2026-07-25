"""Compiled strategy rules — the machine-checkable side of a StrategyNote.

Separate from schemas_backtest.py's BacktestRule: that schema only compares
an indicator to a fixed number, but a strategy like "heikin ashi close above
EMA100" needs indicator-vs-indicator comparisons.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class StrategyRule(BaseModel):
    left: str  # indicator key, e.g. "ha_close"
    comparator: Literal["<", "<=", ">", ">=", "==", "crosses_above", "crosses_below"]
    right: str  # numeric literal ("100") or another indicator key ("ema_100"), resolved at eval time
    description: str  # plain-English label, e.g. "Heikin Ashi close above EMA 100"


class StrategyRuleSet(BaseModel):
    entry_rules: list[StrategyRule] = Field(default_factory=list)
    exit_rules: list[StrategyRule] = Field(default_factory=list)


class StrategyRuleSetOut(BaseModel):
    rules: StrategyRuleSet | None
    compiled_model: str | None
    compiled_at: datetime | None
    is_stale: bool
