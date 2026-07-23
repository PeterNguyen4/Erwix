"""Live rule-watch support: load a user's compiled rules for the WS poll loop
in app.routers.agent (WS /api/agent/watch/{symbol}).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StrategyRuleSet as StrategyRuleSetModel
from app.schemas_strategy import StrategyRuleSet

ENTRY_COLOR = "#26a69a"
EXIT_COLOR = "#ef5350"


def load_rule_set(db: Session, user_id: str) -> StrategyRuleSet | None:
    row = db.scalar(select(StrategyRuleSetModel).where(StrategyRuleSetModel.user_id == user_id))
    return StrategyRuleSet(**row.rules) if row else None
