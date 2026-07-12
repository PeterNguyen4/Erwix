from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_auth
from app.db import get_db
from app.models import UserPreference
from app.schemas import UserPreferenceOut, UserPreferenceUpdate

router = APIRouter(prefix="/api/user", tags=["user"], dependencies=[Depends(require_auth)])


def _get_or_create(db: Session, user_id: str) -> UserPreference:
    pref = db.get(UserPreference, user_id)
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
        db.commit()
    return pref


@router.get("/preferences", response_model=UserPreferenceOut)
def get_preferences(
    user_id: str = Depends(require_auth),
    db: Session = Depends(get_db),
) -> UserPreference:
    return _get_or_create(db, user_id)


@router.patch("/preferences", response_model=UserPreferenceOut)
def update_preferences(
    body: UserPreferenceUpdate,
    user_id: str = Depends(require_auth),
    db: Session = Depends(get_db),
) -> UserPreference:
    pref = _get_or_create(db, user_id)
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
