"""
Wrapper around alpaca-py for data, paper trading, and live streaming.
"""

import logging
from datetime import datetime, timedelta, timezone

# Suppress all Alpaca websocket noise — auth failures and retries are handled by
# _guarded_start_ws and surfaced once through entro.market instead.
logging.getLogger("alpaca.data.live.websocket").setLevel(logging.CRITICAL)

from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.live import StockDataStream
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderClass, OrderSide, TimeInForce
from alpaca.trading.requests import (
    LimitOrderRequest,
    MarketOrderRequest,
    StopLossRequest,
    TakeProfitRequest,
)
from alpaca.trading.stream import TradingStream

from app.config import get_settings
from app.schemas import (
    Account,
    Candle,
    OrderLegOut,
    OrderRequest,
    OrderResponse,
    PortfolioHistory,
    PortfolioPoint,
    Position,
    Quote,
)

_settings = get_settings()

# Map UI timeframe strings -> Alpaca TimeFrame
_TIMEFRAMES: dict[str, TimeFrame] = {
    "1Min": TimeFrame(1, TimeFrameUnit.Minute),
    "5Min": TimeFrame(5, TimeFrameUnit.Minute),
    "15Min": TimeFrame(15, TimeFrameUnit.Minute),
    "1Hour": TimeFrame(1, TimeFrameUnit.Hour),
    "1Day": TimeFrame(1, TimeFrameUnit.Day),
    "1Week": TimeFrame(1, TimeFrameUnit.Week),
    "1Month": TimeFrame(1, TimeFrameUnit.Month),
}


def _require_creds() -> None:
    if not _settings.has_alpaca_creds:
        raise RuntimeError(
            "Alpaca credentials missing. Set ALPACA_API_KEY and "
            "ALPACA_SECRET_KEY in backend/.env"
        )


def _data_client() -> StockHistoricalDataClient:
    _require_creds()
    return StockHistoricalDataClient(
        _settings.alpaca_api_key, _settings.alpaca_secret_key
    )


def _trading_client() -> TradingClient:
    _require_creds()
    return TradingClient(
        _settings.alpaca_api_key,
        _settings.alpaca_secret_key,
        paper=_settings.alpaca_paper,
    )


async def search_assets(q: str, limit: int = 10) -> list[dict]:
    """Search tickers via Yahoo Finance's public suggest API — no API key required."""
    from app.services.yahoo_finance import yahoo_search

    data = await yahoo_search({"q": q, "quotesCount": limit, "newsCount": 0, "enableFuzzyQuery": "true"})
    results = []
    for item in data.get("quotes", [])[:limit]:
        symbol = item.get("symbol", "")
        name = item.get("shortname") or item.get("longname") or ""
        if symbol:
            results.append({"symbol": symbol, "name": name})
    return results


def get_candles(
    symbol: str,
    timeframe: str = "1Day",
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[Candle]:
    tf = _TIMEFRAMES.get(timeframe, _TIMEFRAMES["1Day"])
    if start is None:
        _lookback = {
            "1Min":  timedelta(days=3),
            "5Min":  timedelta(days=7),
            "15Min": timedelta(days=14),
            "1Hour": timedelta(days=30),
            "1Day":  timedelta(days=180),
            "1Week": timedelta(days=730),
            "1Month": timedelta(days=1825),
        }
        start = datetime.now(timezone.utc) - _lookback.get(timeframe, timedelta(days=180))
    req = StockBarsRequest(
        symbol_or_symbols=symbol.upper(),
        timeframe=tf,
        start=start,
        end=end,
    )
    bars = _data_client().get_stock_bars(req)
    out: list[Candle] = []
    for bar in bars.data.get(symbol.upper(), []):
        out.append(
            Candle(
                time=int(bar.timestamp.timestamp()),
                open=bar.open,
                high=bar.high,
                low=bar.low,
                close=bar.close,
                volume=bar.volume,
            )
        )
    return out


def get_quote(symbol: str) -> Quote:
    req = StockLatestQuoteRequest(symbol_or_symbols=symbol.upper())
    res = _data_client().get_stock_latest_quote(req)
    q = res.get(symbol.upper())
    if q is None:
        return Quote(symbol=symbol.upper())
    mid = None
    if q.bid_price and q.ask_price:
        mid = (q.bid_price + q.ask_price) / 2
    return Quote(
        symbol=symbol.upper(),
        bid=q.bid_price,
        ask=q.ask_price,
        price=mid,
        timestamp=q.timestamp,
    )


# `client_order_id` is how we attribute an Alpaca fill back to the Entro user
# who placed it, since all users currently share one Alpaca account. Format:
# "<user_id>:<uuid4>" — parsed by `user_id_from_client_order_id` below.
_CLIENT_ORDER_ID_SEP = ":"


def user_id_from_client_order_id(client_order_id: str | None) -> str | None:
    if not client_order_id or _CLIENT_ORDER_ID_SEP not in client_order_id:
        return None
    return client_order_id.split(_CLIENT_ORDER_ID_SEP, 1)[0]


def submit_order(order: OrderRequest, user_id: str) -> OrderResponse:
    import uuid

    client = _trading_client()
    side = OrderSide.BUY if order.side == "buy" else OrderSide.SELL
    tif = TimeInForce.DAY if order.time_in_force == "day" else TimeInForce.GTC
    client_order_id = f"{user_id}{_CLIENT_ORDER_ID_SEP}{uuid.uuid4()}"

    extra: dict = {}
    if order.order_class == "bracket":
        if order.take_profit_price is None or order.stop_loss_price is None:
            raise ValueError(
                "take_profit_price and stop_loss_price are both required for bracket orders"
            )
        extra["order_class"] = OrderClass.BRACKET
        extra["take_profit"] = TakeProfitRequest(limit_price=order.take_profit_price)
        extra["stop_loss"] = StopLossRequest(
            stop_price=order.stop_loss_price,
            limit_price=order.stop_loss_limit_price,
        )

    if order.type == "limit":
        if order.limit_price is None:
            raise ValueError("limit_price is required for limit orders")
        req = LimitOrderRequest(
            symbol=order.symbol.upper(),
            qty=order.qty,
            side=side,
            time_in_force=tif,
            limit_price=order.limit_price,
            client_order_id=client_order_id,
            **extra,
        )
    else:
        req = MarketOrderRequest(
            symbol=order.symbol.upper(),
            qty=order.qty,
            side=side,
            time_in_force=tif,
            client_order_id=client_order_id,
            **extra,
        )
    o = client.submit_order(req)
    legs = [
        OrderLegOut(
            id=str(leg.id),
            client_order_id=leg.client_order_id,
            side=leg.side.value if hasattr(leg.side, "value") else str(leg.side),
            type=leg.order_type.value if hasattr(leg.order_type, "value") else str(leg.order_type),
            limit_price=float(leg.limit_price) if leg.limit_price is not None else None,
            stop_price=float(leg.stop_price) if leg.stop_price is not None else None,
        )
        for leg in (getattr(o, "legs", None) or [])
    ]
    return OrderResponse(
        id=str(o.id),
        client_order_id=o.client_order_id,
        symbol=o.symbol,
        qty=float(o.qty),
        side=o.side.value if hasattr(o.side, "value") else str(o.side),
        type=o.order_type.value if hasattr(o.order_type, "value") else str(o.order_type),
        order_class=order.order_class,
        status=o.status.value if hasattr(o.status, "value") else str(o.status),
        submitted_at=o.submitted_at,
        legs=legs,
    )


def get_positions() -> list[Position]:
    client = _trading_client()
    out: list[Position] = []
    for p in client.get_all_positions():
        out.append(
            Position(
                symbol=p.symbol,
                qty=float(p.qty),
                avg_entry_price=float(p.avg_entry_price),
                market_value=float(p.market_value),
                unrealized_pl=float(p.unrealized_pl),
                current_price=float(p.current_price) if p.current_price else None,
            )
        )
    return out


def get_recent_filled_orders(after: datetime) -> list:
    """Raw Alpaca orders with a fill, submitted after `after` (UTC). Used to
    reconcile the trades table against fills the live stream may have missed."""
    from alpaca.trading.requests import GetOrdersRequest
    from alpaca.trading.enums import QueryOrderStatus

    client = _trading_client()
    req = GetOrdersRequest(status=QueryOrderStatus.CLOSED, after=after, limit=500, nested=False)
    return [o for o in client.get_orders(req) if o.filled_at is not None]


def get_account() -> Account:
    a = _trading_client().get_account()
    return Account(
        buying_power=float(a.buying_power),
        cash=float(a.cash),
        portfolio_value=float(a.portfolio_value),
        equity=float(a.equity),
        long_market_value=float(a.long_market_value or 0.0),
        last_equity=float(a.last_equity or 0.0),
    )


def get_portfolio_history(period: str = "1M", timeframe: str | None = None) -> PortfolioHistory:
    """Equity curve for the (shared paper) account over `period`.

    `timeframe` defaults to a resolution Alpaca picks for the period when None.
    """
    from alpaca.trading.requests import GetPortfolioHistoryRequest

    req = GetPortfolioHistoryRequest(period=period, timeframe=timeframe)
    h = _trading_client().get_portfolio_history(req)
    timestamps = h.timestamp or []
    equities = h.equity or []
    pls = h.profit_loss or []
    points: list[PortfolioPoint] = []
    for i, ts in enumerate(timestamps):
        eq = equities[i] if i < len(equities) else None
        if eq is None:
            continue  # Alpaca emits null equity for gaps (e.g. pre-market)
        points.append(
            PortfolioPoint(
                time=int(ts),
                equity=float(eq),
                profit_loss=float(pls[i]) if i < len(pls) and pls[i] is not None else 0.0,
            )
        )
    return PortfolioHistory(base_value=float(h.base_value or 0.0), points=points)


def make_trading_stream() -> TradingStream:
    """Live stream of order/trade updates (fills) for auto-logging."""
    _require_creds()
    return TradingStream(
        _settings.alpaca_api_key,
        _settings.alpaca_secret_key,
        paper=_settings.alpaca_paper,
    )


_data_stream: StockDataStream | None = None
_stream_permanently_failed: bool = False


def is_stream_available() -> bool:
    return not _stream_permanently_failed


def get_data_stream() -> StockDataStream:
    """Return a singleton StockDataStream, creating it on first call.

    Patches _start_ws so that unrecoverable auth errors set _should_run=False,
    breaking the SDK's internal retry loop, and mark the stream as permanently
    unavailable so future callers skip the attempt entirely.
    """
    global _data_stream, _stream_permanently_failed
    _require_creds()
    if _data_stream is None:
        stream = StockDataStream(_settings.alpaca_api_key, _settings.alpaca_secret_key)
        original_start_ws = stream._start_ws

        async def _guarded_start_ws() -> None:
            global _stream_permanently_failed
            try:
                await original_start_ws()
            except ValueError as e:
                stream._should_run = False
                _stream_permanently_failed = True
                logging.getLogger("entro.market").warning(
                    "Alpaca stream auth failed (%s) — live bars unavailable for this session", e
                )

        stream._start_ws = _guarded_start_ws
        _data_stream = stream
    return _data_stream


def reset_data_stream() -> None:
    """Discard the singleton so the next call to get_data_stream creates a fresh one."""
    global _data_stream
    _data_stream = None


def stop_data_stream() -> None:
    """Signal the stream to exit its loop and forcibly close the websocket."""
    global _data_stream
    if _data_stream is not None:
        _data_stream._should_run = False
        # Close the underlying websocket so any blocked recv() unblocks immediately.
        ws = getattr(_data_stream, "_ws", None)
        if ws is not None:
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(ws.close())
            except Exception:  # noqa: BLE001
                pass
    _data_stream = None
