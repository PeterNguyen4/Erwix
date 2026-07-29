from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.auth import (
    COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_PATH,
    create_access_token,
    generate_refresh_token,
    get_current_user_id,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.models import RefreshToken, UserPreference
from app.schemas import (
    UserCreate,
    UserPreferenceOut,
    UserPreferenceUpdate,
    UserPrivate,
    UserUpdate,
)

settings = get_settings()

router = APIRouter(prefix="/api/users", tags=["users"])


def _set_access_cookie(response: Response, user: models.User) -> None:
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "tv": user.token_version},
        expires_delta=expires_delta,
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        max_age=int(expires_delta.total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


async def _issue_refresh_token(response: Response, db: AsyncSession, user_id: int) -> None:
    raw_token, token_hash, expires_at = generate_refresh_token()
    db.add(RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at))
    await db.commit()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=int(timedelta(days=settings.refresh_token_expire_days).total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )


@router.post("/register", response_model=UserPrivate, status_code=status.HTTP_201_CREATED)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)) -> models.User:
    existing = (
        await db.execute(
            select(models.User).where(
                (func.lower(models.User.username) == user.username.lower())
                | (func.lower(models.User.email) == user.email.lower())
            )
        )
    ).scalars().first()
    if existing:
        detail = (
            "Username already exists"
            if existing.username.lower() == user.username.lower()
            else "Email already registered"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    new_user = models.User(
        username=user.username,
        email=user.email.lower(),
        hashed_password=hash_password(user.password),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/token", response_model=UserPrivate)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> models.User:
    user = (
        await db.execute(
            select(models.User).where(func.lower(models.User.email) == form_data.username.lower())
        )
    ).scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    _set_access_cookie(response, user)
    await _issue_refresh_token(response, db, user.id)
    return user


@router.post("/refresh", response_model=UserPrivate)
async def refresh_access_token(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> models.User:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    token_hash = hash_refresh_token(refresh_token)
    stored = (
        await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalars().first()

    if (
        not stored
        or stored.revoked_at is not None
        or stored.expires_at < datetime.now(UTC)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user = await db.get(models.User, stored.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    stored.revoked_at = datetime.now(UTC)
    await db.commit()

    _set_access_cookie(response, user)
    await _issue_refresh_token(response, db, user.id)
    return user


@router.post("/logout")
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> dict:
    if refresh_token:
        token_hash = hash_refresh_token(refresh_token)
        stored = (
            await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        ).scalars().first()
        if stored and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
            await db.commit()

    response.delete_cookie(key=COOKIE_NAME)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return {"success": True}


@router.post("/logout-all")
async def logout_all(
    response: Response,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Revoke refresh token"""
    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user.token_version += 1
    await db.execute(
        RefreshToken.__table__.update()
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await db.commit()

    response.delete_cookie(key=COOKIE_NAME)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return {"success": True}


@router.get("/me", response_model=UserPrivate)
async def get_me(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> models.User:
    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user


@router.patch("/me", response_model=UserPrivate)
async def update_me(
    user_update: UserUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> models.User:
    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_update.username is not None and user_update.username.lower() != user.username.lower():
        existing = (
            await db.execute(
                select(models.User).where(func.lower(models.User.username) == user_update.username.lower())
            )
        ).scalars().first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")
        user.username = user_update.username

    if user_update.email is not None and user_update.email.lower() != user.email.lower():
        existing = (
            await db.execute(
                select(models.User).where(func.lower(models.User.email) == user_update.email.lower())
            )
        ).scalars().first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user.email = user_update.email.lower()

    await db.commit()
    await db.refresh(user)
    return user


async def _get_or_create_preferences(db: AsyncSession, user_id: int) -> UserPreference:
    pref = (
        await db.execute(select(UserPreference).where(UserPreference.user_id == user_id))
    ).scalars().first()
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return pref


@router.get("/preferences", response_model=UserPreferenceOut)
async def get_preferences(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserPreference:
    return await _get_or_create_preferences(db, user_id)


@router.patch("/preferences", response_model=UserPreferenceOut)
async def update_preferences(
    body: UserPreferenceUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserPreference:
    pref = await _get_or_create_preferences(db, user_id)
    if body.last_symbol is not None:
        pref.last_symbol = body.last_symbol.upper()
    if body.last_symbol_name is not None:
        pref.last_symbol_name = body.last_symbol_name
    if body.last_timeframe is not None:
        pref.last_timeframe = body.last_timeframe
    if body.debrief_enabled is not None:
        pref.debrief_enabled = body.debrief_enabled
    if body.debrief_day_of_week is not None:
        pref.debrief_day_of_week = body.debrief_day_of_week
    if body.debrief_time is not None:
        pref.debrief_time = body.debrief_time
    await db.commit()
    return pref
