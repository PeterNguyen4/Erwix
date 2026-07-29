"""Live rule-watch support: load a user's compiled rules for the WS poll loop
in app.routers.agent (WS /api/agent/watch/{symbol}).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StrategyRuleSet as StrategyRuleSetModel
from app.schemas_strategy import StrategyRuleSet

ENTRY_COLOR = "#26a69a"
EXIT_COLOR = "#ef5350"


async def load_rule_set(db: AsyncSession, user_id: int) -> StrategyRuleSet | None:
    row = await db.scalar(select(StrategyRuleSetModel).where(StrategyRuleSetModel.user_id == user_id))
    return StrategyRuleSet(**row.rules) if row else None
