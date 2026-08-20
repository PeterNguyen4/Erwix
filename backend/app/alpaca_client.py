"""
Wrapper around alpaca-py for data, paper trading, and live streaming.
"""

import logging
from datetime import UTC, datetime

from alpaca.common.enums import Sort
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.live import StockDataStream
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import (
    ContractType,
    OrderClass,
    OrderSide,
    PositionIntent,
    TimeInForce,
)
from alpaca.trading.requests import (
    GetOptionContractsRequest,
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
    OptionContractOut,
    OptionOrderRequest,
    OptionOrderResponse,
    OrderLegOut,
    OrderRequest,
    OrderResponse,
    PortfolioHistory,
    PortfolioPoint,
    Position,
    Quote,
)

logging.getLogger("alpaca.data.live.websocket").setLevel(logging.CRITICAL)

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
            "Alpaca credentials missing. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in backend/.env"
        )


def _data_client() -> StockHistoricalDataClient:
    _require_creds()
    return StockHistoricalDataClient(_settings.alpaca_api_key, _settings.alpaca_secret_key)


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

    data = await yahoo_search(
        {"q": q, "quotesCount": limit, "newsCount": 0, "enableFuzzyQuery": "true"}
    )
    results = []
    for item in data.get("quotes", [])[:limit]:
        symbol = item.get("symbol", "")
        name = item.get("shortname") or item.get("longname") or ""
        if symbol:
            results.append({"symbol": symbol, "name": name})
    return results


BARS_LOOKBACK_LIMIT = 3000

_EARLIEST_POSSIBLE_START = datetime(2000, 1, 1, tzinfo=UTC)


def get_candles(
    symbol: str,
    timeframe: str = "1Day",
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[Candle]:
    tf = _TIMEFRAMES.get(timeframe, _TIMEFRAMES["1Day"])
    if start is None:
        req = StockBarsRequest(
            symbol_or_symbols=symbol.upper(),
            timeframe=tf,
            start=_EARLIEST_POSSIBLE_START,
            end=end,
            limit=BARS_LOOKBACK_LIMIT,
            sort=Sort.DESC,
        )
        bars = _data_client().get_stock_bars(req)
        rows = list(bars.data.get(symbol.upper(), []))
        rows.reverse()
    else:
        req = StockBarsRequest(
            symbol_or_symbols=symbol.upper(),
            timeframe=tf,
            start=start,
            end=end,
        )
        bars = _data_client().get_stock_bars(req)
        rows = bars.data.get(symbol.upper(), [])
    out: list[Candle] = []
    for bar in rows:
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


def sanitized_mid_price(bid: float | None, ask: float | None) -> float | None:
    """Ignore placeholder bids"""
    if bid and ask and bid > 0 and ask > 0 and bid / ask > 0.5:
        return (bid + ask) / 2
    return ask or bid or None


def get_quote(symbol: str) -> Quote:
    req = StockLatestQuoteRequest(symbol_or_symbols=symbol.upper())
    res = _data_client().get_stock_latest_quote(req)
    q = res.get(symbol.upper())
    if q is None:
        return Quote(symbol=symbol.upper())
    mid = sanitized_mid_price(q.bid_price, q.ask_price)
    return Quote(
        symbol=symbol.upper(),
        bid=q.bid_price,
        ask=q.ask_price,
        price=mid,
        timestamp=q.timestamp,
    )


# `client_order_id` is how we attribute an Alpaca fill back to the Erwix user
# who placed it, since all users currently share one Alpaca account. Format:
# "<user_id>:<uuid4>" — parsed by `user_id_from_client_order_id` below.
_CLIENT_ORDER_ID_SEP = ":"


def user_id_from_client_order_id(client_order_id: str | None) -> int | None:
    if not client_order_id or _CLIENT_ORDER_ID_SEP not in client_order_id:
        return None
    raw = client_order_id.split(_CLIENT_ORDER_ID_SEP, 1)[0]
    try:
        return int(raw)
    except ValueError:
        return None


def submit_order(order: OrderRequest, user_id: int) -> OrderResponse:
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
                asset_class=(
                    p.asset_class.value if hasattr(p.asset_class, "value") else str(p.asset_class)
                ),
            )
        )
    return out


def get_option_chain(
    underlying_symbol: str,
    expiration_date: str | None = None,
    option_type: str | None = None,
) -> list[OptionContractOut]:
    client = _trading_client()
    req = GetOptionContractsRequest(
        underlying_symbols=[underlying_symbol.upper()],
        expiration_date=expiration_date,
        type=ContractType(option_type) if option_type else None,
        status=None,
        limit=1000,
    )
    res = client.get_option_contracts(req)
    contracts = (
        res.option_contracts
        if hasattr(res, "option_contracts")
        else res.get("option_contracts", [])
    )
    return [
        OptionContractOut(
            symbol=c.symbol,
            underlying_symbol=c.underlying_symbol,
            expiration_date=c.expiration_date,
            strike_price=float(c.strike_price),
            type=c.type.value if hasattr(c.type, "value") else str(c.type),
            style=c.style.value if hasattr(c.style, "value") else str(c.style),
            open_interest=int(c.open_interest) if c.open_interest is not None else None,
            close_price=float(c.close_price) if c.close_price is not None else None,
            tradable=bool(c.tradable),
        )
        for c in contracts
    ]


def submit_option_order(order: OptionOrderRequest, user_id: int) -> OptionOrderResponse:
    import uuid

    client = _trading_client()
    side = OrderSide.BUY if order.position_intent.startswith("buy") else OrderSide.SELL
    intent = PositionIntent(order.position_intent)
    tif = TimeInForce.DAY if order.time_in_force == "day" else TimeInForce.GTC
    client_order_id = f"{user_id}{_CLIENT_ORDER_ID_SEP}{uuid.uuid4()}"

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
            position_intent=intent,
        )
    else:
        req = MarketOrderRequest(
            symbol=order.symbol.upper(),
            qty=order.qty,
            side=side,
            time_in_force=tif,
            client_order_id=client_order_id,
            position_intent=intent,
        )
    o = client.submit_order(req)
    return OptionOrderResponse(
        id=str(o.id),
        client_order_id=o.client_order_id,
        symbol=o.symbol,
        qty=float(o.qty),
        side=o.side.value if hasattr(o.side, "value") else str(o.side),
        position_intent=order.position_intent,
        type=o.order_type.value if hasattr(o.order_type, "value") else str(o.order_type),
        status=o.status.value if hasattr(o.status, "value") else str(o.status),
        submitted_at=o.submitted_at,
    )


def get_open_bracket_levels(symbol: str, user_id: int) -> dict[str, float | None] | None:
    """Entry price from the user's open position. None if no open position."""
    from alpaca.trading.enums import QueryOrderStatus
    from alpaca.trading.requests import GetOrdersRequest

    client = _trading_client()
    symbol = symbol.upper()

    position = next((p for p in client.get_all_positions() if p.symbol == symbol), None)
    if position is None:
        return None

    req = GetOrdersRequest(status=QueryOrderStatus.OPEN, symbols=[symbol], nested=True, limit=500)
    stop_loss_price: float | None = None
    take_profit_price: float | None = None
    for o in client.get_orders(req):
        if user_id_from_client_order_id(o.client_order_id) != user_id:
            continue
        for leg in getattr(o, "legs", None) or []:
            if leg.stop_price is not None:
                stop_loss_price = float(leg.stop_price)
            elif leg.limit_price is not None:
                take_profit_price = float(leg.limit_price)

    return {
        "entry_price": float(position.avg_entry_price),
        "stop_loss_price": stop_loss_price,
        "take_profit_price": take_profit_price,
    }


def get_recent_filled_orders(after: datetime) -> list:
    """Raw Alpaca orders with a fill, submitted after `after` (UTC). Used to
    reconcile the trades table against fills the live stream may have missed."""
    from alpaca.trading.enums import QueryOrderStatus
    from alpaca.trading.requests import GetOrdersRequest

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
                logging.getLogger("erwix.market").warning(
                    "Alpaca stream auth failed (%s) — live bars unavailable for this session",
                    e,
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
