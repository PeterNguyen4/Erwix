"""Strategy tab: archetype selection + either a free-form description (archetype
"freeform") or answers to that archetype's tailored follow-up questions, distilled
by strategy_agent.asummarize_strategy into a structured playbook that the Analyst
agent (agent_graph._retrieve) reads as context."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StrategyNote
from app.models import StrategyRuleSet as StrategyRuleSetModel

ARCHETYPES = [
    {
        "id": "trend_rider",
        "name": "Trend Rider",
        "tagline": "Rides momentum until it breaks",
    },
    {
        "id": "swing_sniper",
        "name": "Swing Sniper",
        "tagline": "Multi-day setups, patient entries",
    },
    {"id": "scalper", "name": "Scalper", "tagline": "Fast in, fast out, tight risk"},
    {
        "id": "breakout",
        "name": "Breakout Hunter",
        "tagline": "Buys strength through key levels",
    },
    {
        "id": "value",
        "name": "Value Investor",
        "tagline": "Buys quality when it's cheap, holds",
    },
    {
        "id": "guardian",
        "name": "Risk Guardian",
        "tagline": "Capital preservation above all",
    },
    {"id": "freeform", "name": "Freeform", "tagline": "Describe it your own way"},
]

_ARCHETYPE_NAMES = {a["id"]: a["name"] for a in ARCHETYPES}

# Tailored follow-up questions per archetype, shown instead of a generic textarea.
# "freeform" has none — it uses StrategyNote.body directly.
QUESTIONS: dict[str, list[dict]] = {
    "trend_rider": [
        {
            "id": "signal",
            "prompt": "What tells you a trend is starting (and still intact)?",
        },
        {
            "id": "exit",
            "prompt": "What makes you exit — trend weakening, or a hard stop?",
        },
        {
            "id": "timeframe",
            "prompt": "What timeframe do you typically ride a trend on?",
        },
    ],
    "swing_sniper": [
        {"id": "setup", "prompt": "What setup are you waiting for before you enter?"},
        {"id": "hold", "prompt": "How many days do you typically hold a position?"},
        {
            "id": "exit",
            "prompt": "What's your rule for taking profit vs. cutting a loser?",
        },
    ],
    "scalper": [
        {"id": "hold", "prompt": "What's your typical holding time per trade?"},
        {"id": "trigger", "prompt": "What triggers an entry for you?"},
        {"id": "risk", "prompt": "What's your max risk per trade?"},
    ],
    "breakout": [
        {"id": "level", "prompt": "What level or pattern are you waiting to break?"},
        {
            "id": "confirm",
            "prompt": "How do you confirm it's a real breakout vs. a fakeout?",
        },
        {
            "id": "stop",
            "prompt": "Where do you place your stop relative to the breakout level?",
        },
    ],
    "value": [
        {"id": "cheap", "prompt": "What makes a company or asset 'cheap' to you?"},
        {"id": "hold", "prompt": "What's your typical holding period?"},
        {"id": "sell", "prompt": "What would make you sell a position?"},
    ],
    "guardian": [
        {
            "id": "risk",
            "prompt": "What's the max % of your account you'll risk on a single trade?",
        },
        {"id": "cash", "prompt": "What market conditions make you sit in cash?"},
        {"id": "cut", "prompt": "What's your rule for cutting losses?"},
    ],
}


# Mandatory sections of a StrategyPlaybook (strategy_agent.py), in display order.
SECTION_LABELS: dict[str, str] = {
    "goal": "Goal",
    "entry_rules": "Entry Rules",
    "risk_rules": "Risk Rules",
    "timeframe": "Timeframe",
    "avoid": "Avoid",
}


def render_playbook(sections: dict) -> str:
    """Renders a StrategyPlaybook dict into plain text for the Analyst's prompt
    context (agent_graph._system_prompt) — the Strategy tab UI renders the same
    dict directly instead of parsing this text back out."""
    lines = []
    for key, label in SECTION_LABELS.items():
        bullets = sections.get(key) or []
        if not bullets:
            continue
        lines.append(f"{label}:")
        lines.extend(f"- {b}" for b in bullets)
    return "\n".join(lines)


def archetype_name(archetype_id: str | None) -> str | None:
    return _ARCHETYPE_NAMES.get(archetype_id) if archetype_id else None


def archetypes_with_questions() -> list[dict]:
    return [{**a, "questions": QUESTIONS.get(a["id"], [])} for a in ARCHETYPES]


def compose_body(archetype: str | None, body: str | None, answers: dict[str, str] | None) -> str:
    """Renders either the freeform text or a question-driven archetype's answers
    into the plain-text description the strategist agent (asummarize_strategy)
    is given — keeps agent_graph unaware of the Q&A shape."""
    questions = QUESTIONS.get(archetype or "")
    if not questions:
        return (body or "").strip()
    answers = answers or {}
    lines = []
    for q in questions:
        answer = (answers.get(q["id"]) or "").strip()
        if answer:
            lines.append(f"Q: {q['prompt']}\nA: {answer}")
    return "\n\n".join(lines)


async def get_active_strategy(db: AsyncSession, user_id: int) -> StrategyNote | None:
    return await db.scalar(
        select(StrategyNote).where(
            StrategyNote.user_id == user_id, StrategyNote.is_active.is_(True)
        )
    )


async def list_strategies(db: AsyncSession, user_id: int) -> list[StrategyNote]:
    result = await db.scalars(
        select(StrategyNote)
        .where(StrategyNote.user_id == user_id)
        .order_by(StrategyNote.updated_at.desc())
    )
    return list(result)


async def get_strategy_by_id(db: AsyncSession, user_id: int, note_id: int) -> StrategyNote | None:
    return await db.scalar(
        select(StrategyNote).where(StrategyNote.id == note_id, StrategyNote.user_id == user_id)
    )


async def create_strategy(
    db: AsyncSession, user_id: int, name: str, archetype: str | None
) -> StrategyNote:
    is_first = (await list_strategies(db, user_id)) == []
    note = StrategyNote(user_id=user_id, name=name, archetype=archetype, is_active=is_first)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


async def update_strategy(
    db: AsyncSession,
    note: StrategyNote,
    archetype: str | None,
    body: str | None,
    answers: dict[str, str] | None,
) -> StrategyNote:
    note.archetype = archetype
    note.body = compose_body(archetype, body, answers)
    note.answers = answers
    note.structured_summary = None  # stale until regenerated by the caller
    await db.commit()
    await db.refresh(note)
    return note


async def rename_strategy(db: AsyncSession, note: StrategyNote, name: str) -> StrategyNote:
    note.name = name.strip() or "Untitled Strategy"
    await db.commit()
    await db.refresh(note)
    return note


async def set_active_strategy(db: AsyncSession, user_id: int, note_id: int) -> StrategyNote | None:
    """Only one strategy is ever active per user — matches the library's
    select-and-use-one-at-a-time model."""
    note = await get_strategy_by_id(db, user_id, note_id)
    if note is None:
        return None
    await db.execute(
        StrategyNote.__table__.update()
        .where(StrategyNote.user_id == user_id)
        .values(is_active=False)
    )
    note.is_active = True
    await db.commit()
    await db.refresh(note)
    return note


async def delete_strategy(db: AsyncSession, user_id: int, note_id: int) -> bool:
    note = await get_strategy_by_id(db, user_id, note_id)
    if note is None:
        return False
    await db.execute(delete(StrategyRuleSetModel).where(StrategyRuleSetModel.note_id == note_id))
    await db.delete(note)
    await db.commit()
    return True
