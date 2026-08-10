import hashlib
import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.db import get_db
from app.dependencies.rate_limit import rate_limit
from app.models import StrategyNote
from app.models import StrategyRuleSet as StrategyRuleSetModel
from app.schemas import (
    ArchetypeOut,
    PlaybookUpdate,
    StrategyCreate,
    StrategyNoteOut,
    StrategyNoteSummary,
    StrategyNoteUpdate,
    StrategyRename,
)
from app.schemas_strategy import StrategyRuleSet, StrategyRuleSetOut
from app.services.strategy import (
    archetypes_with_questions,
    create_strategy,
    delete_strategy,
    get_active_strategy,
    get_strategy_by_id,
    list_strategies,
    rename_strategy,
    render_playbook,
    set_active_strategy,
    update_strategy,
)
from app.services.strategy_agent import (
    acompile_rules,
    aextract_preferences,
    asummarize_strategy,
)

logger = logging.getLogger("erwix.strategy")

router = APIRouter(
    prefix="/api/strategy",
    tags=["strategy"],
    dependencies=[Depends(get_current_user_id)],
)

_llm_rate_limit = rate_limit("strategy-llm", limit=10, window_ms=60_000, fail_open=False)


async def _regenerate_summary(db: AsyncSession, note: StrategyNote) -> None:
    if not (note.body or "").strip():
        return  # nothing to summarize yet (e.g. archetype picked, no answers filled in)

    try:
        sections = await asummarize_strategy(note.archetype, note.body)
        note.structured_summary = json.dumps(sections)
        note.summary_model = "strategy_agent.asummarize_strategy"
        note.summarized_at = datetime.now(UTC)
        await db.commit()
    except Exception:
        logger.exception("strategy summarization failed for user %s", note.user_id)


async def _regenerate_rules(db: AsyncSession, note: StrategyNote) -> None:
    if not (note.body or "").strip():
        return

    source_text = note.body
    if note.structured_summary:
        try:
            rendered = render_playbook(json.loads(note.structured_summary))
        except (json.JSONDecodeError, TypeError):
            rendered = ""
        if rendered.strip():
            source_text = rendered

    row = await db.scalar(
        select(StrategyRuleSetModel).where(StrategyRuleSetModel.note_id == note.id)
    )
    if row is None:
        row = StrategyRuleSetModel(user_id=note.user_id, note_id=note.id)
        db.add(row)

    try:
        rule_set = await acompile_rules(note.archetype, source_text)
        row.rules = rule_set.model_dump()
        row.compiled_model = "strategy_agent.acompile_rules"
        row.compiled_at = datetime.now(UTC)
        row.source_body_hash = hashlib.sha256(note.body.encode()).hexdigest()
        if not rule_set.entry_rules and not rule_set.exit_rules:
            # Not an exception — the model returned a well-formed but empty ruleset.
            # Common with smaller local models that can't reliably fill the
            # comparison/pattern/gated discriminated schema for a complex strategy.
            row.compile_error = (
                "The model couldn't extract checkable rules from this strategy "
                "(returned an empty rule set). Try simplifying the description, or "
                "switch to a more capable LLM provider (see Settings.llm_provider)."
            )
        else:
            row.compile_error = None
    except Exception as exc:
        logger.exception("strategy rule compilation failed for note %s", note.id)
        row.compile_error = str(exc)[:500] or "rule compilation failed"
    await db.commit()


async def _regenerate_preferences(db: AsyncSession, note: StrategyNote) -> None:
    if not (note.body or "").strip():
        return

    try:
        prefs = await aextract_preferences(note.archetype, note.body)
        note.preferred_symbols = prefs.symbols
        note.context_timeframe = prefs.context_timeframe
        note.entry_timeframe = prefs.entry_timeframe
        await db.commit()
    except Exception:
        logger.exception("strategy preference extraction failed for user %s", note.user_id)


async def _owned_note(db: AsyncSession, user_id: int, note_id: int) -> StrategyNote:
    note = await get_strategy_by_id(db, user_id, note_id)
    if note is None:
        raise HTTPException(404, "strategy not found")
    return note


@router.get("/archetypes", response_model=list[ArchetypeOut])
def list_archetypes() -> list[dict]:
    return archetypes_with_questions()


@router.get("", response_model=list[StrategyNoteSummary])
async def get_strategies(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[StrategyNote]:
    return await list_strategies(db, user_id)


@router.post("", response_model=StrategyNoteOut)
async def create_strategy_route(
    body: StrategyCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote:
    return await create_strategy(db, user_id, body.name, body.archetype)


@router.get("/active", response_model=StrategyNoteOut | None)
async def get_active_strategy_route(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote | None:
    return await get_active_strategy(db, user_id)


@router.get("/{note_id}", response_model=StrategyNoteOut)
async def get_strategy(
    note_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote:
    return await _owned_note(db, user_id, note_id)


@router.put(
    "/{note_id}",
    response_model=StrategyNoteOut,
    dependencies=[Depends(_llm_rate_limit)],
)
async def save_strategy(
    note_id: int,
    body: StrategyNoteUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote:
    note = await _owned_note(db, user_id, note_id)
    note = await update_strategy(db, note, body.archetype, body.body, body.answers)
    await _regenerate_summary(db, note)
    await _regenerate_rules(db, note)
    await _regenerate_preferences(db, note)
    return note


@router.post(
    "/{note_id}/regenerate",
    response_model=StrategyNoteOut,
    dependencies=[Depends(_llm_rate_limit)],
)
async def regenerate_strategy(
    note_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote:
    note = await _owned_note(db, user_id, note_id)
    await _regenerate_summary(db, note)
    await _regenerate_rules(db, note)
    await _regenerate_preferences(db, note)
    return note


@router.put("/{note_id}/name", response_model=StrategyNoteOut)
async def rename_strategy_route(
    note_id: int,
    body: StrategyRename,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote:
    note = await _owned_note(db, user_id, note_id)
    return await rename_strategy(db, note, body.name)


@router.post("/{note_id}/activate", response_model=StrategyNoteOut)
async def activate_strategy(
    note_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote:
    note = await set_active_strategy(db, user_id, note_id)
    if note is None:
        raise HTTPException(404, "strategy not found")
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_strategy_route(
    note_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    deleted = await delete_strategy(db, user_id, note_id)
    if not deleted:
        raise HTTPException(404, "strategy not found")


@router.get("/{note_id}/rules", response_model=StrategyRuleSetOut)
async def get_rules(
    note_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyRuleSetOut:
    note = await _owned_note(db, user_id, note_id)
    row = await db.scalar(
        select(StrategyRuleSetModel).where(StrategyRuleSetModel.note_id == note_id)
    )
    if row is None:
        return StrategyRuleSetOut(rules=None, compiled_model=None, compiled_at=None, is_stale=False)

    current_hash = hashlib.sha256((note.body or "").encode()).hexdigest()
    is_stale = current_hash != row.source_body_hash

    return StrategyRuleSetOut(
        rules=StrategyRuleSet(**row.rules) if row.rules is not None else None,
        compiled_model=row.compiled_model,
        compiled_at=row.compiled_at,
        is_stale=is_stale,
        compile_error=row.compile_error,
    )


@router.put("/{note_id}/playbook", response_model=StrategyNoteOut)
async def update_playbook(
    note_id: int,
    body: PlaybookUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StrategyNote:
    """Manual pencil-icon edit of the generated playbook, bypassing the strategist
    agent — overwrites structured_summary directly with the user's own wording."""
    note = await _owned_note(db, user_id, note_id)
    note.structured_summary = json.dumps(body.sections)
    note.summary_model = "user-edited"
    note.summarized_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(note)
    return note
