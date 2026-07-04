import logging

from fastapi import APIRouter, Depends

from app import alpaca_client
from app.auth import require_auth
from app.error_handling import alpaca_errors
from app.schemas import Account, OrderRequest, OrderResponse, Position

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
