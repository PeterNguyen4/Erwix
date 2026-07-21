import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_auth
from app.db import get_db
from app.schemas import ArchetypeOut, PlaybookUpdate, StrategyNoteOut, StrategyNoteUpdate
from app.services.strategy_agent import asummarize_strategy
from app.services.strategy import archetypes_with_questions, get_active_strategy, upsert_strategy

logger = logging.getLogger("entro.strategy")

router = APIRouter(prefix="/api/strategy", tags=["strategy"], dependencies=[Depends(require_auth)])

_EMPTY = StrategyNoteOut(archetype=None, body=None, answers=None, structured_summary=None, summarized_at=None)


async def _regenerate_summary(db: Session, note) -> None:
    """Best-effort strategist-agent call — never blocks the save it's attached to,
    matching execution_logger.py's embed_trade_best_effort pattern."""
    if not (note.body or "").strip():
        return  # nothing to summarize yet (e.g. archetype picked, no answers filled in)

    try:
        sections = await asummarize_strategy(note.archetype, note.body)
        note.structured_summary = json.dumps(sections)
        note.summary_model = "agent_graph.asummarize_strategy"
        note.summarized_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        logger.exception("strategy summarization failed for user %s", note.user_id)


@router.get("/archetypes", response_model=list[ArchetypeOut])
def list_archetypes() -> list[dict]:
    return archetypes_with_questions()


@router.get("", response_model=StrategyNoteOut)
def get_strategy(
    user_id: str = Depends(require_auth),
    db: Session = Depends(get_db),
) -> StrategyNoteOut:
    note = get_active_strategy(db, user_id)
    return note if note is not None else _EMPTY


@router.put("", response_model=StrategyNoteOut)
async def save_strategy(
    body: StrategyNoteUpdate,
    user_id: str = Depends(require_auth),
    db: Session = Depends(get_db),
) -> StrategyNoteOut:
    note = upsert_strategy(db, user_id, body.archetype, body.body, body.answers)
    await _regenerate_summary(db, note)
    return note


@router.post("/regenerate", response_model=StrategyNoteOut)
async def regenerate_strategy(
    user_id: str = Depends(require_auth),
    db: Session = Depends(get_db),
) -> StrategyNoteOut:
    note = get_active_strategy(db, user_id)
    if note is None:
        return _EMPTY
    await _regenerate_summary(db, note)
    return note


@router.put("/playbook", response_model=StrategyNoteOut)
def update_playbook(
    body: PlaybookUpdate,
    user_id: str = Depends(require_auth),
    db: Session = Depends(get_db),
) -> StrategyNoteOut:
    """Manual pencil-icon edit of the generated playbook, bypassing the strategist
    agent — overwrites structured_summary directly with the user's own wording."""
    note = get_active_strategy(db, user_id)
    if note is None:
        raise HTTPException(404, "no strategy saved yet")
    note.structured_summary = json.dumps(body.sections)
    note.summary_model = "user-edited"
    note.summarized_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(note)
    return note
