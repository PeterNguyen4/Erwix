import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_auth
from app.db import get_db
from app.schemas import ArchetypeOut, StrategyNoteOut, StrategyNoteUpdate
from app.services.agent_graph import asummarize_strategy
from app.services.strategy import archetypes_with_questions, get_active_strategy, upsert_strategy

logger = logging.getLogger("entro.strategy")

router = APIRouter(prefix="/api/strategy", tags=["strategy"], dependencies=[Depends(require_auth)])

_EMPTY = StrategyNoteOut(archetype=None, body=None, answers=None, structured_summary=None, summarized_at=None)


async def _regenerate_summary(db: Session, note) -> None:
    """Best-effort strategist-agent call — never blocks the save it's attached to,
    matching execution_logger.py's embed_trade pattern."""
    from datetime import datetime, timezone

    if not (note.body or "").strip():
        return  # nothing to summarize yet (e.g. archetype picked, no answers filled in)

    try:
        summary = await asummarize_strategy(note.archetype, note.body)
        note.structured_summary = summary
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
