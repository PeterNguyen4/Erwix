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
    generate_password_reset_token,
    generate_refresh_token,
    get_current_user_id,
    hash_password,
    hash_password_reset_token,
    hash_refresh_token,
    require_admin,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.dependencies.rate_limit import rate_limit_by_ip
from app.models import PasswordResetToken, RefreshToken, UserPreference
from app.schemas import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UserCreate,
    UserPreferenceOut,
    UserPreferenceUpdate,
    UserPrivate,
    UserRoleUpdate,
    UserUpdate,
)
from app.services.email import send_password_reset_email

settings = get_settings()

router = APIRouter(prefix="/api/users", tags=["users"])

_auth_rate_limit = rate_limit_by_ip("auth", limit=10, window_ms=60_000, fail_open=False)
_password_reset_rate_limit = rate_limit_by_ip(
    "password-reset", limit=5, window_ms=60_000, fail_open=False
)


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


@router.post(
    "/register",
    response_model=UserPrivate,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_auth_rate_limit)],
)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)) -> models.User:
    existing = (
        (
            await db.execute(
                select(models.User).where(
                    (func.lower(models.User.username) == user.username.lower())
                    | (func.lower(models.User.email) == user.email.lower())
                )
            )
        )
        .scalars()
        .first()
    )
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


@router.post("/token", response_model=UserPrivate, dependencies=[Depends(_auth_rate_limit)])
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> models.User:
    user = (
        (
            await db.execute(
                select(models.User).where(
                    func.lower(models.User.email) == form_data.username.lower()
                )
            )
        )
        .scalars()
        .first()
    )

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    _set_access_cookie(response, user)
    await _issue_refresh_token(response, db, user.id)
    return user


@router.post("/refresh", response_model=UserPrivate, dependencies=[Depends(_auth_rate_limit)])
async def refresh_access_token(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> models.User:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )

    token_hash = hash_refresh_token(refresh_token)
    stored = (
        (await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash)))
        .scalars()
        .first()
    )

    if not stored or stored.revoked_at is not None or stored.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user = await db.get(models.User, stored.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

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
            (await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash)))
            .scalars()
            .first()
        )
        if stored and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
            await db.commit()

    response.delete_cookie(key=COOKIE_NAME)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return {"success": True}


async def _invalidate_all_sessions(db: AsyncSession, user: models.User) -> None:
    """Revoke refresh token."""
    user.token_version += 1
    await db.execute(
        RefreshToken.__table__.update()
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


@router.post("/logout-all")
async def logout_all(
    response: Response,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    await _invalidate_all_sessions(db, user)
    await db.commit()

    response.delete_cookie(key=COOKIE_NAME)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return {"success": True}


@router.post("/forgot-password", dependencies=[Depends(_password_reset_rate_limit)])
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = (
        (
            await db.execute(
                select(models.User).where(func.lower(models.User.email) == body.email.lower())
            )
        )
        .scalars()
        .first()
    )

    if user:
        raw_token, token_hash, expires_at = generate_password_reset_token()
        db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
        await db.commit()
        reset_url = f"{settings.frontend_base_url}/reset-password?token={raw_token}"
        await send_password_reset_email(user.email, reset_url)

    return {"success": True}


@router.post("/reset-password", dependencies=[Depends(_password_reset_rate_limit)])
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    token_hash = hash_password_reset_token(body.token)
    stored = (
        (
            await db.execute(
                select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
            )
        )
        .scalars()
        .first()
    )

    if not stored or stored.used_at is not None or stored.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user = await db.get(models.User, stored.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user.hashed_password = hash_password(body.new_password)
    stored.used_at = datetime.now(UTC)
    await _invalidate_all_sessions(db, user)
    await db.commit()

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
            (
                await db.execute(
                    select(models.User).where(
                        func.lower(models.User.username) == user_update.username.lower()
                    )
                )
            )
            .scalars()
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )
        user.username = user_update.username

    if user_update.email is not None and user_update.email.lower() != user.email.lower():
        existing = (
            (
                await db.execute(
                    select(models.User).where(
                        func.lower(models.User.email) == user_update.email.lower()
                    )
                )
            )
            .scalars()
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        user.email = user_update.email.lower()

    await db.commit()
    await db.refresh(user)
    return user


@router.get(
    "/admin/users",
    response_model=list[UserPrivate],
    dependencies=[Depends(require_admin)],
)
async def list_users(db: AsyncSession = Depends(get_db)) -> list[models.User]:
    return (await db.execute(select(models.User).order_by(models.User.username))).scalars().all()


@router.patch("/admin/users/{target_user_id}/role", response_model=UserPrivate)
async def update_user_role(
    target_user_id: int,
    payload: UserRoleUpdate,
    user_id: int = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> models.User:
    if target_user_id == user_id and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove your own admin access",
        )

    target = await db.get(models.User, target_user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    target.role = payload.role
    await db.commit()
    await db.refresh(target)
    return target


async def _get_or_create_preferences(db: AsyncSession, user_id: int) -> UserPreference:
    pref = (
        (await db.execute(select(UserPreference).where(UserPreference.user_id == user_id)))
        .scalars()
        .first()
    )
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    if pref.chart_indicators is None:
        pref.chart_indicators = []
    if pref.chart_indicator_colors is None:
        pref.chart_indicator_colors = {}
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
    if body.onboarding_completed_at is not None:
        pref.onboarding_completed_at = body.onboarding_completed_at
    if body.chart_indicators is not None:
        pref.chart_indicators = body.chart_indicators
    if body.chart_indicator_colors is not None:
        pref.chart_indicator_colors = body.chart_indicator_colors
    await db.commit()
    return pref
