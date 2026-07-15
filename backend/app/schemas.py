from datetime import datetime, time
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
    order_class: Literal["simple", "bracket"] = "simple"
    # Required together when order_class="bracket" (Alpaca requires both legs).
    take_profit_price: float | None = None
    stop_loss_price: float | None = None
    # Optional: makes the stop-loss leg a stop-limit instead of a plain stop.
    stop_loss_limit_price: float | None = None


class OrderLegOut(BaseModel):
    id: str
    client_order_id: str
    side: str
    type: str
    limit_price: float | None = None
    stop_price: float | None = None


class OrderResponse(BaseModel):
    id: str
    client_order_id: str
    symbol: str
    qty: float
    side: str
    type: str
    order_class: str = "simple"
    status: str
    submitted_at: datetime | None = None
    legs: list[OrderLegOut] = []


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
    fill_price: float | None
    fees: float
    status: str
    order_class: str
    leg: str | None
    parent_client_order_id: str | None
    limit_price: float | None
    stop_price: float | None
    take_profit_price: float | None
    stop_loss_price: float | None
    filled_at: datetime | None
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


class DebriefStep(BaseModel):
    trade_id: int
    narrative: str
    annotations: list[ChartAnnotation] = []
    spotlight: dict | None = None
    zoom: dict | None = None
    note_quote: dict | None = None


class DebriefReportOut(BaseModel):
    id: int
    status: Literal["pending", "running", "ready", "error"]
    window_start: datetime
    window_end: datetime
    symbol: str | None
    scheduled_for: datetime
    started_at: datetime | None
    completed_at: datetime | None
    total_steps: int | None
    current_step: int
    eta_seconds: int | None = None
    steps: list[DebriefStep] = []
    error_detail: str | None = None

    model_config = {"from_attributes": True}


class DebriefMessageIn(BaseModel):
    message: str


class DebriefMessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---- User Preferences ----
class UserPreferenceOut(BaseModel):
    last_symbol: str = "AAPL"
    last_symbol_name: str | None = "Apple Inc."
    last_timeframe: str = "1Day"
    debrief_enabled: bool = True
    debrief_day_of_week: int | None = None
    debrief_time: time | None = None

    model_config = {"from_attributes": True}


class UserPreferenceUpdate(BaseModel):
    last_symbol: str | None = None
    last_symbol_name: str | None = None
    last_timeframe: str | None = None
    debrief_enabled: bool | None = None
    debrief_day_of_week: int | None = None
    debrief_time: time | None = None


# ---- News agent ----
class NewsArticleOut(BaseModel):
    symbol: str
    title: str
    publisher: str
    url: str
    published_at: datetime


class MarketInsightOut(BaseModel):
    sentiment: Literal["bullish", "bearish", "neutral"]
    advice: str
    rationale: list[str]
    highlighted_urls: list[str]


# ---- Strategy tab ----
class StrategyQuestionOut(BaseModel):
    id: str
    prompt: str


class ArchetypeOut(BaseModel):
    id: str
    name: str
    tagline: str
    questions: list[StrategyQuestionOut] = []


class StrategyNoteOut(BaseModel):
    archetype: str | None
    body: str | None
    answers: dict[str, str] | None
    structured_summary: str | None
    summarized_at: datetime | None

    model_config = {"from_attributes": True}


class StrategyNoteUpdate(BaseModel):
    archetype: str | None = None
    body: str | None = None
    answers: dict[str, str] | None = None


class PlaybookUpdate(BaseModel):
    sections: dict[str, list[str]]
