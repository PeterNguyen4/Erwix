from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---- Market data ----
class Candle(BaseModel):
    time: int  # unix seconds (lightweight-charts UTCTimestamp)
    open: float
    high: float
    low: float
    close: float
    volume: float


class Quote(BaseModel):
    symbol: str
    bid: float | None = None
    ask: float | None = None
    price: float | None = None
    timestamp: datetime | None = None


# ---- Trading ----
class OrderRequest(BaseModel):
    symbol: str
    qty: float = Field(gt=0)
    side: Literal["buy", "sell"]
    type: Literal["market", "limit"] = "market"
    limit_price: float | None = None
    time_in_force: Literal["day", "gtc"] = "day"


class OrderResponse(BaseModel):
    id: str
    symbol: str
    qty: float
    side: str
    type: str
    status: str
    submitted_at: datetime | None = None


class Position(BaseModel):
    symbol: str
    qty: float
    avg_entry_price: float
    market_value: float
    unrealized_pl: float
    current_price: float | None = None


class Account(BaseModel):
    buying_power: float
    cash: float
    portfolio_value: float
    equity: float
    long_market_value: float = 0.0
    last_equity: float = 0.0


class PortfolioPoint(BaseModel):
    time: int  # unix seconds
    equity: float
    profit_loss: float


class PortfolioHistory(BaseModel):
    base_value: float
    points: list[PortfolioPoint]


# ---- Journal ----
class TradeOut(BaseModel):
    id: int
    symbol: str
    side: str
    order_type: str | None
    qty: float
    fill_price: float
    fees: float
    filled_at: datetime
    broker_order_id: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class TradeNoteUpdate(BaseModel):
    notes: str


# ---- Analyst Agent ----
class ChartAnnotation(BaseModel):
    type: Literal["arrow", "circle", "marker", "line"]
    time: int  # unix seconds
    price: float
    label: str | None = None
    color: str | None = None


class AgentReviewRequest(BaseModel):
    from_: datetime = Field(alias="from")
    to: datetime
    symbol: str | None = None
    query: str | None = None

    model_config = {"populate_by_name": True}


class AgentReviewResponse(BaseModel):
    narrative: str
    annotations: list[ChartAnnotation]


class DebriefStatus(BaseModel):
    has_new_trades: bool
    new_trade_count: int
    last_debrief_at: datetime | None


# ---- User Preferences ----
class UserPreferenceOut(BaseModel):
    last_symbol: str = "AAPL"
    last_symbol_name: str | None = "Apple Inc."
    last_timeframe: str = "1Day"

    model_config = {"from_attributes": True}


class UserPreferenceUpdate(BaseModel):
    last_symbol: str | None = None
    last_symbol_name: str | None = None
    last_timeframe: str | None = None
