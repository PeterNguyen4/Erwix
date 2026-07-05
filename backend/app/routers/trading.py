import logging

from fastapi import APIRouter, Depends, Query

from app import alpaca_client
from app.auth import require_auth
from app.error_handling import alpaca_errors
from app.schemas import Account, OrderRequest, OrderResponse, PortfolioHistory, Position

logger = logging.getLogger("entro.trading")
router = APIRouter(prefix="/api/trading", tags=["trading"], dependencies=[Depends(require_auth)])


@router.post("/orders", response_model=OrderResponse)
@alpaca_errors(logger)
def create_order(order: OrderRequest, user_id: str = Depends(require_auth)) -> OrderResponse:
    return alpaca_client.submit_order(order, user_id)


@router.get("/positions", response_model=list[Position])
@alpaca_errors(logger)
def positions() -> list[Position]:
    return alpaca_client.get_positions()


@router.get("/account", response_model=Account)
@alpaca_errors(logger)
def account() -> Account:
    return alpaca_client.get_account()


@router.get("/portfolio/history", response_model=PortfolioHistory)
@alpaca_errors(logger)
def portfolio_history(
    period: str = Query("1M", description="1D, 1W, 1M, 3M, 1A, all"),
    timeframe: str | None = Query(None, description="1Min, 5Min, 15Min, 1H, 1D"),
) -> PortfolioHistory:
    return alpaca_client.get_portfolio_history(period, timeframe)
