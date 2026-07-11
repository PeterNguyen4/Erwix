from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# Must match app.services.embeddings.EMBEDDING_DIMENSIONS
TRADE_EMBEDDING_DIM = 512


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    last_symbol: Mapped[str] = mapped_column(String(16), default="AAPL")
    last_symbol_name: Mapped[str | None] = mapped_column(String(128), default="Apple Inc.")
    last_timeframe: Mapped[str] = mapped_column(String(16), default="1Day")

    # Last Agent analysis
    last_debrief_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Trade(Base):
    """
    An auto-logged fill. Written by the execution_logger whenever Alpaca
    reports a fill.
    """

    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Alpaca identifiers
    broker_order_id: Mapped[str | None] = mapped_column(String(64), index=True)
    client_order_id: Mapped[str | None] = mapped_column(String(128), index=True)

    # Clerk user_id
    user_id: Mapped[str | None] = mapped_column(String(128), index=True)

    symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(String(8))  # buy | sell
    order_type: Mapped[str | None] = mapped_column(String(16))  # market | limit
    qty: Mapped[float] = mapped_column(Float)
    fill_price: Mapped[float] = mapped_column(Float)
    fees: Mapped[float] = mapped_column(Float, default=0.0)

    # User's reflection on this trade
    notes: Mapped[str | None] = mapped_column(Text, default=None)

    # Entry time
    filled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    raw: Mapped[str | None] = mapped_column(Text)  # original broker payload (JSON)

    # Embedding for semantic search
    embedding: Mapped[list[float] | None] = mapped_column(Vector(TRADE_EMBEDDING_DIM))
    embedding_model: Mapped[str | None] = mapped_column(String(64))
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StrategyNote(Base):
    """
    The user's stated strategy / rules. Analyst Agent compares logged
    trades in a window against the active note.
    """

    __tablename__ = "strategy_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(128))
    body: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
