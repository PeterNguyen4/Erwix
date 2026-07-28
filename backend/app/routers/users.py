from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.auth import (
    COOKIE_NAME,
    create_access_token,
    get_current_user_id,
    hash_password,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.models import UserPreference
from app.schemas import (
    UserCreate,
    UserPreferenceOut,
    UserPreferenceUpdate,
    UserPrivate,
    UserUpdate,
)

settings = get_settings()

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/register", response_model=UserPrivate, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)) -> models.User:
    existing = db.execute(
        select(models.User).where(
            (func.lower(models.User.username) == user.username.lower())
            | (func.lower(models.User.email) == user.email.lower())
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
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/token", response_model=UserPrivate)
def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> models.User:
    user = db.execute(
        select(models.User).where(func.lower(models.User.email) == form_data.username.lower())
    ).scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(data={"sub": str(user.id)}, expires_delta=expires_delta)
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        max_age=int(expires_delta.total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    return user


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(key=COOKIE_NAME)
    return {"success": True}


@router.get("/me", response_model=UserPrivate)
def get_me(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> models.User:
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user


@router.patch("/me", response_model=UserPrivate)
def update_me(
    user_update: UserUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> models.User:
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_update.username is not None and user_update.username.lower() != user.username.lower():
        existing = db.execute(
            select(models.User).where(func.lower(models.User.username) == user_update.username.lower())
        ).scalars().first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")
        user.username = user_update.username

    if user_update.email is not None and user_update.email.lower() != user.email.lower():
        existing = db.execute(
            select(models.User).where(func.lower(models.User.email) == user_update.email.lower())
        ).scalars().first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        user.email = user_update.email.lower()

    db.commit()
    db.refresh(user)
    return user


def _get_or_create_preferences(db: Session, user_id: int) -> UserPreference:
    pref = db.execute(
        select(UserPreference).where(UserPreference.user_id == user_id)
    ).scalars().first()
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


@router.get("/preferences", response_model=UserPreferenceOut)
def get_preferences(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> UserPreference:
    return _get_or_create_preferences(db, user_id)


@router.patch("/preferences", response_model=UserPreferenceOut)
def update_preferences(
    body: UserPreferenceUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> UserPreference:
    pref = _get_or_create_preferences(db, user_id)
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
    db.commit()
    return pref
