import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_oauth_state, get_current_user_id, verify_oauth_state
from app.config import get_settings
from app.db import get_db
from app.models import AlpacaAccount
from app.schemas import AlpacaConnectUrlOut, AlpacaStatusOut
from app.services.token_crypto import encrypt_token

logger = logging.getLogger("entro.alpaca_oauth")
settings = get_settings()

router = APIRouter(prefix="/api/alpaca", tags=["alpaca"])

_AUTHORIZE_URL = "https://app.alpaca.markets/oauth/authorize"
_TOKEN_URL = "https://api.alpaca.markets/oauth/token"


@router.get("/connect", response_model=AlpacaConnectUrlOut)
def connect(
    env: str = Query("paper", pattern="^(paper|live)$"),
    user_id: int = Depends(get_current_user_id),
) -> AlpacaConnectUrlOut:
    """Builds the Alpaca Connect authorize URL for the frontend to navigate to.
    `env` scopes Alpaca's consent screen to a paper or live account."""
    if not settings.has_alpaca_oauth_creds:
        raise HTTPException(status_code=503, detail="Alpaca OAuth is not configured")

    state = create_oauth_state(user_id, env)
    params = {
        "response_type": "code",
        "client_id": settings.alpaca_oauth_client_id,
        "redirect_uri": settings.alpaca_oauth_redirect_uri,
        "state": state,
        "env": env,
    }
    return AlpacaConnectUrlOut(url=f"{_AUTHORIZE_URL}?{urlencode(params)}")


@router.get("/callback")
async def callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Alpaca redirects the user's browser here after they approve the
    connection. Identity comes from `state` (signed, short-lived), not the
    session cookie, since this is a top-level redirect from a third party."""
    settings_url = f"{settings.frontend_base_url}/settings"
    verified = verify_oauth_state(state)
    if verified is None:
        return RedirectResponse(f"{settings_url}?alpaca=error")
    user_id, env = verified

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                _TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": settings.alpaca_oauth_client_id,
                    "client_secret": settings.alpaca_oauth_client_secret,
                    "redirect_uri": settings.alpaca_oauth_redirect_uri,
                },
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            access_token = resp.json()["access_token"]
    except (httpx.HTTPError, KeyError):
        logger.exception("Alpaca OAuth token exchange failed for user %s", user_id)
        return RedirectResponse(f"{settings_url}?alpaca=error")

    encrypted = encrypt_token(access_token)
    account = await db.scalar(select(AlpacaAccount).where(AlpacaAccount.user_id == user_id))
    if account is None:
        account = AlpacaAccount(user_id=user_id, access_token=encrypted, env=env)
        db.add(account)
    else:
        account.access_token = encrypted
        account.env = env
    await db.commit()

    return RedirectResponse(f"{settings_url}?alpaca=connected")


@router.get("/status", response_model=AlpacaStatusOut)
async def status(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> AlpacaStatusOut:
    account = await db.scalar(select(AlpacaAccount).where(AlpacaAccount.user_id == user_id))
    if account is None:
        return AlpacaStatusOut(connected=False)
    return AlpacaStatusOut(connected=True, env=account.env)


@router.post("/disconnect")
async def disconnect(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    account = await db.scalar(select(AlpacaAccount).where(AlpacaAccount.user_id == user_id))
    if account is not None:
        await db.delete(account)
        await db.commit()
    return {"success": True}
