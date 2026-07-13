"""Strategy tab: archetype selection + either a free-form description (archetype
"freeform") or answers to that archetype's tailored follow-up questions, distilled
by agent_graph.asummarize_strategy into a structured playbook that the Analyst
agent (agent_graph._retrieve) reads as context."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StrategyNote

ARCHETYPES = [
    {"id": "trend_rider", "name": "Trend Rider", "tagline": "Rides momentum until it breaks"},
    {"id": "swing_sniper", "name": "Swing Sniper", "tagline": "Multi-day setups, patient entries"},
    {"id": "scalper", "name": "Scalper", "tagline": "Fast in, fast out, tight risk"},
    {"id": "breakout", "name": "Breakout Hunter", "tagline": "Buys strength through key levels"},
    {"id": "value", "name": "Value Investor", "tagline": "Buys quality when it's cheap, holds"},
    {"id": "guardian", "name": "Risk Guardian", "tagline": "Capital preservation above all"},
    {"id": "freeform", "name": "Freeform", "tagline": "Describe it your own way"},
]

_ARCHETYPE_NAMES = {a["id"]: a["name"] for a in ARCHETYPES}

# Tailored follow-up questions per archetype, shown instead of a generic textarea.
# "freeform" has none — it uses StrategyNote.body directly.
QUESTIONS: dict[str, list[dict]] = {
    "trend_rider": [
        {"id": "signal", "prompt": "What tells you a trend is starting (and still intact)?"},
        {"id": "exit", "prompt": "What makes you exit — trend weakening, or a hard stop?"},
        {"id": "timeframe", "prompt": "What timeframe do you typically ride a trend on?"},
    ],
    "swing_sniper": [
        {"id": "setup", "prompt": "What setup are you waiting for before you enter?"},
        {"id": "hold", "prompt": "How many days do you typically hold a position?"},
        {"id": "exit", "prompt": "What's your rule for taking profit vs. cutting a loser?"},
    ],
    "scalper": [
        {"id": "hold", "prompt": "What's your typical holding time per trade?"},
        {"id": "trigger", "prompt": "What triggers an entry for you?"},
        {"id": "risk", "prompt": "What's your max risk per trade?"},
    ],
    "breakout": [
        {"id": "level", "prompt": "What level or pattern are you waiting to break?"},
        {"id": "confirm", "prompt": "How do you confirm it's a real breakout vs. a fakeout?"},
        {"id": "stop", "prompt": "Where do you place your stop relative to the breakout level?"},
    ],
    "value": [
        {"id": "cheap", "prompt": "What makes a company or asset 'cheap' to you?"},
        {"id": "hold", "prompt": "What's your typical holding period?"},
        {"id": "sell", "prompt": "What would make you sell a position?"},
    ],
    "guardian": [
        {"id": "risk", "prompt": "What's the max % of your account you'll risk on a single trade?"},
        {"id": "cash", "prompt": "What market conditions make you sit in cash?"},
        {"id": "cut", "prompt": "What's your rule for cutting losses?"},
    ],
}


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


def get_active_strategy(db: Session, user_id: str) -> StrategyNote | None:
    """The user's saved strategy note, if any — used by the Analyst agent to
    ground its review in the trader's own stated rules."""
    return db.scalar(select(StrategyNote).where(StrategyNote.user_id == user_id))


def upsert_strategy(
    db: Session,
    user_id: str,
    archetype: str | None,
    body: str | None,
    answers: dict[str, str] | None,
) -> StrategyNote:
    composed_body = compose_body(archetype, body, answers)
    note = get_active_strategy(db, user_id)
    if note is None:
        note = StrategyNote(user_id=user_id, archetype=archetype, body=composed_body, answers=answers)
        db.add(note)
    else:
        note.archetype = archetype
        note.body = composed_body
        note.answers = answers
        note.structured_summary = None  # stale until regenerated below
    db.commit()
    db.refresh(note)
    return note
