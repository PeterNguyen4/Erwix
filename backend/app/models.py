from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    last_symbol: Mapped[str] = mapped_column(String(16), default="AAPL")
    last_symbol_name: Mapped[str | None] = mapped_column(String(128), default="Apple Inc.")
    last_timeframe: Mapped[str] = mapped_column(String(16), default="1Day")


class Trade(Base):
    """
    An auto-logged execution (fill). Written by the execution_logger whenever
    Alpaca reports a fill. This is the substrate the Phase-2 analyst agent
    reviews over a time window against the user's strategy.
    """

    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Alpaca identifiers (nullable so we can also insert manual/synthetic rows)
    broker_order_id: Mapped[str | None] = mapped_column(String(64), index=True)
    client_order_id: Mapped[str | None] = mapped_column(String(64), index=True)

    # Clerk user_id of whoever submitted the order. Resolved from the
    # `client_order_id` prefix (see trading.py/execution_logger.py) since all
    # users currently share one Alpaca account — Alpaca itself has no concept
    # of our users. Nullable: fills we can't attribute (e.g. orders placed
    # directly in the Alpaca dashboard) still get logged, just unowned.
    user_id: Mapped[str | None] = mapped_column(String(128), index=True)

    symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(String(8))  # buy | sell
    order_type: Mapped[str | None] = mapped_column(String(16))  # market | limit
    qty: Mapped[float] = mapped_column(Float)
    fill_price: Mapped[float] = mapped_column(Float)
    fees: Mapped[float] = mapped_column(Float, default=0.0)

    # When the fill happened (from broker) and when we recorded it
    filled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    raw: Mapped[str | None] = mapped_column(Text)  # original broker payload (JSON)


class StrategyNote(Base):
    """
    The user's stated strategy / rules. The Phase-2 analyst compares logged
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
