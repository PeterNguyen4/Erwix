from datetime import date, datetime, time
from pgvector.sqlalchemy import Vector
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

# Must match app.services.embeddings.EMBEDDING_DIMENSIONS
TRADE_EMBEDDING_DIM = 512


class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16), default="user", server_default="user")  # user | admin
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AlpacaAccount(Base):
    __tablename__ = "alpaca_accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, index=True)
    access_token: Mapped[str] = mapped_column(Text)
    env: Mapped[str] = mapped_column(String(16))  # "paper" | "live"
    alpaca_account_id: Mapped[str | None] = mapped_column(String(64))
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserPreference(Base):
    __tablename__ = "user_preferences"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    last_symbol: Mapped[str] = mapped_column(String(16), default="AAPL")
    last_symbol_name: Mapped[str | None] = mapped_column(String(128), default="Apple Inc.")
    last_timeframe: Mapped[str] = mapped_column(String(16), default="1Day")

    # Last Agent analysis
    last_debrief_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Scheduled background debrief (see app.services.debrief_jobs)
    debrief_enabled: Mapped[bool] = mapped_column(default=True)
    debrief_day_of_week: Mapped[int | None] = mapped_column(Integer)  # 0=Mon -> 6=Sun
    debrief_time: Mapped[time | None] = mapped_column(Time)


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("user_id", "symbol", name="uq_watchlist_item"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class NotificationDismissal(Base):
    __tablename__ = "notification_dismissals"
    __table_args__ = (UniqueConstraint("user_id", "notification_key", name="uq_notification_dismissal"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    notification_key: Mapped[str] = mapped_column(String(160), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    # Alpaca identifiers
    broker_order_id: Mapped[str | None] = mapped_column(String(64), index=True)
    client_order_id: Mapped[str | None] = mapped_column(String(128), index=True)
    # Set on bracket child legs (take_profit/stop_loss) to link back to the entry order's
    # client_order_id. Null for simple orders and for the entry leg itself.
    parent_client_order_id: Mapped[str | None] = mapped_column(String(128), index=True)

    symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(String(8))  # buy | sell
    order_type: Mapped[str | None] = mapped_column(String(16))  # market | limit | stop | stop_limit
    qty: Mapped[float] = mapped_column(Float)
    fill_price: Mapped[float | None] = mapped_column(Float)
    fees: Mapped[float] = mapped_column(Float, default=0.0)

    # Alpaca order lifecycle status: new | partially_filled | filled | canceled |
    # expired | rejected | replaced | ...
    status: Mapped[str] = mapped_column(String(16), default="new", index=True)
    # simple | bracket | oco | oto
    order_class: Mapped[str] = mapped_column(String(16), default="simple")
    # For bracket child rows: which leg this is. Null for simple orders / the entry leg.
    leg: Mapped[str | None] = mapped_column(String(16))  # take_profit | stop_loss

    # Order-intent prices, captured at submission (not necessarily the fill price)
    limit_price: Mapped[float | None] = mapped_column(Float)
    stop_price: Mapped[float | None] = mapped_column(Float)
    # Denormalized onto the entry row so risk/reward is visible without joining legs
    take_profit_price: Mapped[float | None] = mapped_column(Float)
    stop_loss_price: Mapped[float | None] = mapped_column(Float)

    # User's reflection on this trade
    notes: Mapped[str | None] = mapped_column(Text, default=None)

    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    raw: Mapped[str | None] = mapped_column(Text)  # original broker payload (JSON)

    # Embedding for semantic search
    embedding: Mapped[list[float] | None] = mapped_column(Vector(TRADE_EMBEDDING_DIM))
    embedding_model: Mapped[str | None] = mapped_column(String(64))
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JournalEntry(Base):
    """
    A user-authored journal entry, independent of any auto-logged Trade fill
    (see execution_logger.py). Anchored to a calendar day; every field beyond
    that is optional so an entry can be as light as a note or as detailed as
    a full manual trade record. Rendered alongside Trade rows in the unified
    calendar/table journal view (Portfolio page).
    """

    __tablename__ = "journal_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    entry_date: Mapped[date] = mapped_column(Date, index=True)

    symbol: Mapped[str | None] = mapped_column(String(16))
    side: Mapped[str | None] = mapped_column(String(8))  # buy | sell
    timeframe: Mapped[str | None] = mapped_column(String(16))  # chart timeframe, e.g. "15Min", "1Day"
    entry_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entry_price: Mapped[float | None] = mapped_column(Float)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exit_price: Mapped[float | None] = mapped_column(Float)
    order_amount: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DebriefReport(Base):
    """
    A background analyst debrief broken into steps..
    """

    __tablename__ = "debrief_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    report_type: Mapped[str] = mapped_column(String(16), default="scheduled")
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    symbol: Mapped[str | None] = mapped_column(String(16))
    query: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|running|ready|error
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    total_steps: Mapped[int | None] = mapped_column(Integer)
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    # Ordered list of {trade_id, narrative, annotations, spotlight, zoom, note_quote} dicts,
    # one per trade, appended as generation progresses.
    steps: Mapped[list] = mapped_column(JSON, default=list)

    error_detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DebriefMessage(Base):
    """A persisted follow-up chat turn tied to a completed DebriefReport"""

    __tablename__ = "debrief_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("debrief_reports.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    tool_provenance: Mapped[list | None] = mapped_column(JSON)
    parts: Mapped[list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class StrategyNote(Base):
    """
    The user's stated strategy / rules based on archetype
    """

    __tablename__ = "strategy_notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(80), default="My Strategy")
    is_active: Mapped[bool] = mapped_column(default=False)
    archetype: Mapped[str | None] = mapped_column(String(32))
    # Freeform text (archetype="freeform"/None). For question-driven archetypes this
    # holds the composed "Q: ... A: ..." text sent to the strategist agent, derived
    # from `answers` — kept so agent_graph doesn't need to know about the Q&A shape.
    body: Mapped[str | None] = mapped_column(Text)
    # Raw per-question answers {question_id: answer}, so the editor can be repopulated.
    answers: Mapped[dict | None] = mapped_column(JSON)

    structured_summary: Mapped[str | None] = mapped_column(Text)
    summary_model: Mapped[str | None] = mapped_column(String(64))
    summarized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    preferred_symbols: Mapped[list | None] = mapped_column(JSON)
    context_timeframe: Mapped[str | None] = mapped_column(String(16))
    entry_timeframe: Mapped[str | None] = mapped_column(String(16))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StrategyRuleSet(Base):
    """Compiled machine-checkable rules derived from a StrategyNote's body."""

    __tablename__ = "strategy_rule_sets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("strategy_notes.id"), index=True)

    rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    compiled_model: Mapped[str | None] = mapped_column(String(64))
    compiled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # sha256 of the StrategyNote.body used to compile — lets us flag staleness after an edit
    source_body_hash: Mapped[str | None] = mapped_column(String(64))
    # set on a failed acompile_rules call, cleared on the next successful compile
    compile_error: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MarketInsightCache(Base):
    __tablename__ = "market_insight_cache"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, index=True)

    # sha256 of the sorted article URLs used to generate this insight
    articles_hash: Mapped[str] = mapped_column(String(64))

    sentiment: Mapped[str] = mapped_column(String(16))
    advice: Mapped[str] = mapped_column(Text)
    rationale: Mapped[list] = mapped_column(JSON)
    highlighted_urls: Mapped[list] = mapped_column(JSON)

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BacktestConfig(Base):
    """A saved backtest rule config"""

    __tablename__ = "backtest_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    symbol: Mapped[str] = mapped_column(String(16))
    timeframe: Mapped[str] = mapped_column(String(16), default="1Day")
    config: Mapped[dict] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BacktestRun(Base):
    """A single execution of a BacktestConfig over a historical window"""

    __tablename__ = "backtest_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    config_id: Mapped[int] = mapped_column(ForeignKey("backtest_configs.id"), index=True)

    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|running|ready|error
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    result: Mapped[dict | None] = mapped_column(JSON)
    error_detail: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
