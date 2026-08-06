from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr = Field(max_length=120)


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str


class UserPrivate(UserPublic):
    email: EmailStr = Field(max_length=120)
    role: Literal["user", "admin"] = "user"


class UserRoleUpdate(BaseModel):
    role: Literal["user", "admin"]


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=50)
    email: EmailStr | None = Field(default=None, max_length=120)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(max_length=120)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class AlpacaConnectUrlOut(BaseModel):
    url: str


class AlpacaStatusOut(BaseModel):
    connected: bool
    env: str | None = None


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


class JournalEntryOut(BaseModel):
    id: int
    entry_date: date
    symbol: str | None
    side: str | None
    entry_time: datetime | None
    entry_price: float | None
    exit_time: datetime | None
    exit_price: float | None
    order_amount: float | None
    notes: str | None

    model_config = {"from_attributes": True}


class JournalEntryCreate(BaseModel):
    entry_date: date
    symbol: str | None = None
    side: Literal["buy", "sell"] | None = None
    entry_time: datetime | None = None
    entry_price: float | None = None
    exit_time: datetime | None = None
    exit_price: float | None = None
    order_amount: float | None = None
    notes: str | None = None


class JournalEntryUpdate(BaseModel):
    entry_date: date | None = None
    symbol: str | None = None
    side: Literal["buy", "sell"] | None = None
    entry_time: datetime | None = None
    entry_price: float | None = None
    exit_time: datetime | None = None
    exit_price: float | None = None
    order_amount: float | None = None
    notes: str | None = None


class ClosedTradeOut(BaseModel):
    """One realized round-trip (FIFO-matched entry/exit), not a raw fill row."""

    symbol: str
    qty: float
    entry_price: float
    exit_price: float
    pnl: float
    opened_at: datetime
    closed_at: datetime

    model_config = {"from_attributes": True}


class PnLSummaryOut(BaseModel):
    total_pnl: float
    win_count: int
    loss_count: int
    breakeven_count: int
    win_rate: float | None  # None when there are no closed round-trips yet
    avg_win: float | None
    avg_loss: float | None
    largest_win: float | None
    largest_loss: float | None
    closed_trades: list[ClosedTradeOut]

    model_config = {"from_attributes": True}


class PnLWeeklyComparisonOut(BaseModel):
    current: PnLSummaryOut
    previous: PnLSummaryOut


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


class NotificationOut(BaseModel):
    id: str
    type: Literal["debrief_ready", "news_insight", "alpaca_disconnected", "strategy_missing"]
    title: str
    body: str
    href: str
    created_at: datetime
    unseen: bool


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    unseen_count: int


class NotificationKeyIn(BaseModel):
    key: str


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


class AttachedReferenceIn(BaseModel):
    type: Literal["trade", "journal_entry", "day", "symbol"]
    ref_id: str


class DebriefMessageIn(BaseModel):
    message: str
    references: list[AttachedReferenceIn] = []


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
    thumbnail_url: str | None = None
    related_tickers: list[str] = []


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
    id: int
    name: str
    is_active: bool
    archetype: str | None
    body: str | None
    answers: dict[str, str] | None
    structured_summary: str | None
    summarized_at: datetime | None

    model_config = {"from_attributes": True}


class StrategyNoteSummary(BaseModel):
    id: int
    name: str
    archetype: str | None
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class StrategyCreate(BaseModel):
    name: str
    archetype: str | None = None


class StrategyNoteUpdate(BaseModel):
    archetype: str | None = None
    body: str | None = None
    answers: dict[str, str] | None = None


class PlaybookUpdate(BaseModel):
    sections: dict[str, list[str]]


class StrategyRename(BaseModel):
    name: str
