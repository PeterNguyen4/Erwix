import hashlib
import json
import logging
from datetime import UTC, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.db import get_db
from app.models import StrategyRuleSet as StrategyRuleSetModel
from app.schemas import ArchetypeOut, PlaybookUpdate, StrategyNoteOut, StrategyNoteUpdate
from app.schemas_strategy import StrategyRuleSet, StrategyRuleSetOut
from app.services.strategy_agent import acompile_rules, asummarize_strategy
from app.services.strategy import archetypes_with_questions, get_active_strategy, upsert_strategy

logger = logging.getLogger("entro.strategy")

router = APIRouter(prefix="/api/strategy", tags=["strategy"], dependencies=[Depends(get_current_user_id)])

_EMPTY = StrategyNoteOut(archetype=None, body=None, answers=None, structured_summary=None, summarized_at=None)


async def _regenerate_summary(db: AsyncSession, note) -> None:
    """Best-effort strategist-agent call — never blocks the save it's attached to,
    matching execution_logger.py's embed_trade_best_effort pattern."""
    if not (note.body or "").strip():
        return  # nothing to summarize yet (e.g. archetype picked, no answers filled in)

    try:
        sections = await asummarize_strategy(note.archetype, note.body)
        note.structured_summary = json.dumps(sections)
        note.summary_model = "strategy_agent.asummarize_strategy"
        note.summarized_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        logger.exception("strategy summarization failed for user %s", note.user_id)


async def _regenerate_rules(db: AsyncSession, note) -> None:
    """Best-effort rule-compile call, independent of _regenerate_summary so a
    failure here never blocks the strategy save."""
    if not (note.body or "").strip():
        return

    try:
        rule_set = await acompile_rules(note.archetype, note.body)
        body_hash = hashlib.sha256(note.body.encode()).hexdigest()
        row = await db.scalar(select(StrategyRuleSetModel).where(StrategyRuleSetModel.user_id == note.user_id))
        if row is None:
            row = StrategyRuleSetModel(user_id=note.user_id, note_id=note.id)
            db.add(row)
        row.note_id = note.id
        row.rules = rule_set.model_dump()
        row.compiled_model = "strategy_agent.acompile_rules"
        row.compiled_at = datetime.now(timezone.utc)
        row.source_body_hash = body_hash
        await db.commit()
    except Exception:
        logger.exception("strategy rule compilation failed for user %s", note.user_id)


@router.get("/archetypes", response_model=list[ArchetypeOut])
def list_archetypes() -> list[dict]:
    return archetypes_with_questions()


@router.get("", response_model=StrategyNoteOut)
async def get_strategy(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNoteOut:
    note = await get_active_strategy(db, user_id)
    return note if note is not None else _EMPTY


@router.put("", response_model=StrategyNoteOut)
async def save_strategy(
    body: StrategyNoteUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNoteOut:
    note = await upsert_strategy(db, user_id, body.archetype, body.body, body.answers)
    await _regenerate_summary(db, note)
    await _regenerate_rules(db, note)
    return note


@router.post("/regenerate", response_model=StrategyNoteOut)
async def regenerate_strategy(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNoteOut:
    note = await get_active_strategy(db, user_id)
    if note is None:
        return _EMPTY
    await _regenerate_summary(db, note)
    await _regenerate_rules(db, note)
    return note


@router.get("/rules", response_model=StrategyRuleSetOut)
async def get_rules(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyRuleSetOut:
    row = await db.scalar(select(StrategyRuleSetModel).where(StrategyRuleSetModel.user_id == user_id))
    if row is None:
        return StrategyRuleSetOut(rules=None, compiled_model=None, compiled_at=None, is_stale=False)

    note = await get_active_strategy(db, user_id)
    current_hash = hashlib.sha256((note.body or "").encode()).hexdigest() if note else None
    is_stale = current_hash != row.source_body_hash

    return StrategyRuleSetOut(
        rules=StrategyRuleSet(**row.rules),
        compiled_model=row.compiled_model,
        compiled_at=row.compiled_at,
        is_stale=is_stale,
    )


@router.put("/playbook", response_model=StrategyNoteOut)
async def update_playbook(
    body: PlaybookUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNoteOut:
    """Manual pencil-icon edit of the generated playbook, bypassing the strategist
    agent — overwrites structured_summary directly with the user's own wording."""
    note = await get_active_strategy(db, user_id)
    if note is None:
        raise HTTPException(404, "no strategy saved yet")
    note.structured_summary = json.dumps(body.sections)
    note.summary_model = "user-edited"
    note.summarized_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(note)
    return note
