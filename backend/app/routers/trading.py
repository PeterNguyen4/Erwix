import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import alpaca_client
from app.auth import get_current_user_id
from app.db import get_db
from app.dependencies.rate_limit import rate_limit
from app.error_handling import alpaca_errors
from app.models import AlpacaAccount
from app.schemas import (
    Account,
    OptionContractOut,
    OptionOrderRequest,
    OptionOrderResponse,
    OrderRequest,
    OrderResponse,
    PortfolioHistory,
    Position,
)
from app.services.execution_logger import log_order_intent
from app.services.token_crypto import decrypt_token

logger = logging.getLogger("erwix.trading")
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


async def _linked_client(db: AsyncSession, user_id: int):
    """The trading client for Alpaca account, or None if unlinked."""
    account = await db.scalar(select(AlpacaAccount).where(AlpacaAccount.user_id == user_id))
    if account is None:
        return None
    token = decrypt_token(account.access_token)
    return alpaca_client.trading_client_for_token(token, account.env)


@router.get(
    "/positions",
    response_model=list[Position],
    dependencies=[Depends(_read_rate_limit)],
)
@alpaca_errors(logger)
async def positions(
    db: AsyncSession = Depends(get_db), user_id: int = Depends(get_current_user_id)
) -> list[Position]:
    client = await _linked_client(db, user_id)
    if client is None:
        raise HTTPException(status_code=404, detail="No Alpaca account linked")
    return await asyncio.to_thread(alpaca_client.get_positions, client)


@router.get("/account", response_model=Account, dependencies=[Depends(_read_rate_limit)])
@alpaca_errors(logger)
async def account(
    db: AsyncSession = Depends(get_db), user_id: int = Depends(get_current_user_id)
) -> Account:
    client = await _linked_client(db, user_id)
    if client is None:
        raise HTTPException(status_code=404, detail="No Alpaca account linked")
    return await asyncio.to_thread(alpaca_client.get_account, client)


@router.get(
    "/portfolio/history",
    response_model=PortfolioHistory,
    dependencies=[Depends(_read_rate_limit)],
)
@alpaca_errors(logger)
async def portfolio_history(
    period: str = Query("1M", description="1D, 1W, 1M, 3M, 1A, all"),
    timeframe: str | None = Query(None, description="1Min, 5Min, 15Min, 1H, 1D"),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> PortfolioHistory:
    client = await _linked_client(db, user_id)
    if client is None:
        raise HTTPException(status_code=404, detail="No Alpaca account linked")
    return await asyncio.to_thread(alpaca_client.get_portfolio_history, period, timeframe, client)


@router.get(
    "/options/chain",
    response_model=list[OptionContractOut],
    dependencies=[Depends(_read_rate_limit)],
)
@alpaca_errors(logger)
def options_chain(
    underlying_symbol: str = Query(...),
    expiration_date: str | None = Query(None, description="YYYY-MM-DD"),
    option_type: str | None = Query(None, description="call or put"),
) -> list[OptionContractOut]:
    return alpaca_client.get_option_chain(underlying_symbol, expiration_date, option_type)


@router.post(
    "/options/orders",
    response_model=OptionOrderResponse,
    dependencies=[Depends(_order_rate_limit)],
)
@alpaca_errors(logger)
async def create_option_order(
    order: OptionOrderRequest, user_id: int = Depends(get_current_user_id)
) -> OptionOrderResponse:
    return await asyncio.to_thread(alpaca_client.submit_option_order, order, user_id)
