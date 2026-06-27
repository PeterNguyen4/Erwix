"""Thin wrapper around alpaca-py for data, paper trading, and live streaming.

Credentials come from environment via Settings — never hardcode keys.
"""

from datetime import datetime, timedelta, timezone

from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.live import StockDataStream
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.trading.requests import (
    LimitOrderRequest,
    MarketOrderRequest,
)
from alpaca.trading.stream import TradingStream

from app.config import get_settings
from app.schemas import (
    Account,
    Candle,
    OrderRequest,
    OrderResponse,
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


def get_candles(
    symbol: str,
    timeframe: str = "1Day",
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[Candle]:
    tf = _TIMEFRAMES.get(timeframe, _TIMEFRAMES["1Day"])
    if start is None:
        start = datetime.now(timezone.utc) - timedelta(days=180)
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


def submit_order(order: OrderRequest) -> OrderResponse:
    client = _trading_client()
    side = OrderSide.BUY if order.side == "buy" else OrderSide.SELL
    tif = TimeInForce.DAY if order.time_in_force == "day" else TimeInForce.GTC

    if order.type == "limit":
        if order.limit_price is None:
            raise ValueError("limit_price is required for limit orders")
        req = LimitOrderRequest(
            symbol=order.symbol.upper(),
            qty=order.qty,
            side=side,
            time_in_force=tif,
            limit_price=order.limit_price,
        )
    else:
        req = MarketOrderRequest(
            symbol=order.symbol.upper(),
            qty=order.qty,
            side=side,
            time_in_force=tif,
        )
    o = client.submit_order(req)
    return OrderResponse(
        id=str(o.id),
        symbol=o.symbol,
        qty=float(o.qty),
        side=o.side.value if hasattr(o.side, "value") else str(o.side),
        type=o.order_type.value if hasattr(o.order_type, "value") else str(o.order_type),
        status=o.status.value if hasattr(o.status, "value") else str(o.status),
        submitted_at=o.submitted_at,
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


def get_account() -> Account:
    a = _trading_client().get_account()
    return Account(
        buying_power=float(a.buying_power),
        cash=float(a.cash),
        portfolio_value=float(a.portfolio_value),
        equity=float(a.equity),
    )


def make_trading_stream() -> TradingStream:
    """Live stream of order/trade updates (fills) for auto-logging."""
    _require_creds()
    return TradingStream(
        _settings.alpaca_api_key,
        _settings.alpaca_secret_key,
        paper=_settings.alpaca_paper,
    )


def make_data_stream() -> StockDataStream:
    """Live market-data stream (bars) relayed to the browser."""
    _require_creds()
    return StockDataStream(_settings.alpaca_api_key, _settings.alpaca_secret_key)
