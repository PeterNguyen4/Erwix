"""Resolves a user's linked Alpaca account into a trading client."""

from alpaca.trading.client import TradingClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import alpaca_client
from app.models import AlpacaAccount
from app.services.token_crypto import decrypt_token


async def get_linked_account(db: AsyncSession, user_id: int) -> AlpacaAccount | None:
    return await db.scalar(select(AlpacaAccount).where(AlpacaAccount.user_id == user_id))


async def get_linked_client(db: AsyncSession, user_id: int) -> TradingClient | None:
    """The trading client for the user's own linked Alpaca account, or None if unlinked."""
    account = await get_linked_account(db, user_id)
    if account is None:
        return None
    token = decrypt_token(account.access_token)
    return alpaca_client.trading_client_for_token(token, account.env)
