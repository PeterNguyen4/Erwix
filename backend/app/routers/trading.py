import asyncio
import logging

from fastapi import APIRouter, Depends, Query

from app import alpaca_client
from app.auth import get_current_user_id
from app.dependencies.rate_limit import rate_limit
from app.error_handling import alpaca_errors
from app.schemas import Account, OrderRequest, OrderResponse, PortfolioHistory, Position
from app.services.execution_logger import log_order_intent

logger = logging.getLogger("entro.trading")
router = APIRouter(
    prefix="/api/trading", tags=["trading"], dependencies=[Depends(get_current_user_id)]
)


_order_rate_limit = rate_limit("orders", limit=10, window_ms=60_000, fail_open=False)
_read_rate_limit = rate_limit("trading-reads", limit=120, window_ms=60_000, fail_open=True)


@router.post("/orders", response_model=OrderResponse, dependencies=[Depends(_order_rate_limit)])
@alpaca_errors(logger)
async def create_order(
    order: OrderRequest, user_id: int = Depends(get_current_user_id)
) -> OrderResponse:
    response = await asyncio.to_thread(alpaca_client.submit_order, order, user_id)
    await log_order_intent(response, order, user_id)
    return response


@router.get(
    "/positions",
    response_model=list[Position],
    dependencies=[Depends(_read_rate_limit)],
)
@alpaca_errors(logger)
def positions() -> list[Position]:
    return alpaca_client.get_positions()


@router.get("/account", response_model=Account, dependencies=[Depends(_read_rate_limit)])
@alpaca_errors(logger)
def account() -> Account:
    return alpaca_client.get_account()


@router.get(
    "/portfolio/history",
    response_model=PortfolioHistory,
    dependencies=[Depends(_read_rate_limit)],
)
@alpaca_errors(logger)
def portfolio_history(
    period: str = Query("1M", description="1D, 1W, 1M, 3M, 1A, all"),
    timeframe: str | None = Query(None, description="1Min, 5Min, 15Min, 1H, 1D"),
) -> PortfolioHistory:
    return alpaca_client.get_portfolio_history(period, timeframe)
