import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app import alpaca_client
from app.auth import require_auth, require_ws_auth
from app.error_handling import alpaca_errors
from app.schemas import Candle, Quote
from app.services import live_feed

logger = logging.getLogger("entro.market")
router = APIRouter(prefix="/api/market", tags=["market"])

# Module-level reference so the lifespan can cancel the stream on shutdown.
_stream_task: asyncio.Task | None = None


def cancel_stream_task() -> None:
    global _stream_task
    alpaca_client.stop_data_stream()  # unblocks any waiting recv()
    if _stream_task and not _stream_task.done():
        _stream_task.cancel()
    _stream_task = None


@router.get("/search")
@alpaca_errors(logger)
async def search(q: str = Query(..., min_length=1), _uid: str = Depends(require_auth)) -> list[dict]:
    return await alpaca_client.search_assets(q)


@router.get("/candles", response_model=list[Candle])
@alpaca_errors(logger)
def candles(
    symbol: str = Query(..., min_length=1),
    timeframe: str = Query("1Day"),
    start: datetime | None = None,
    end: datetime | None = None,
    _uid: str = Depends(require_auth),
) -> list[Candle]:
    return alpaca_client.get_candles(symbol, timeframe, start, end)


@router.get("/quote", response_model=Quote)
@alpaca_errors(logger)
def quote(symbol: str = Query(..., min_length=1), _uid: str = Depends(require_auth)) -> Quote:
    return alpaca_client.get_quote(symbol)


@router.websocket("/stream/{symbol}")
async def stream(websocket: WebSocket, symbol: str, _uid: str = Depends(require_ws_auth)) -> None:
    """Relay live bar updates for `symbol` from Alpaca to the browser."""
    await websocket.accept()
    symbol = symbol.upper()
    queue: asyncio.Queue = asyncio.Queue()

    if not alpaca_client.is_stream_available():
        await websocket.send_json({"type": "error", "detail": "live stream unavailable"})
        await websocket.close()
        return

    try:
        data_stream = alpaca_client.get_data_stream()
    except RuntimeError as e:
        await websocket.send_json({"type": "error", "detail": str(e)})
        await websocket.close()
        return

    async def on_bar(bar) -> None:
        await queue.put(
            {
                "type": "bar",
                "candle": {
                    "time": int(bar.timestamp.timestamp()),
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume,
                },
            }
        )

    async def on_quote(q) -> None:
        mid = None
        if q.bid_price and q.ask_price:
            mid = (q.bid_price + q.ask_price) / 2
        await queue.put(
            {
                "type": "quote",
                "quote": {
                    "symbol": symbol,
                    "bid": q.bid_price,
                    "ask": q.ask_price,
                    "price": mid,
                    "timestamp": q.timestamp.isoformat() if q.timestamp else None,
                },
            }
        )

    async def run_stream() -> None:
        try:
            await data_stream._run_forever()
        except asyncio.CancelledError:
            raise  # propagate so the task actually terminates on shutdown
        except Exception as e:
            await queue.put({"type": "error", "detail": str(e)})
        finally:
            alpaca_client.reset_data_stream()

    live_feed.subscribe_bars(symbol, on_bar)
    live_feed.subscribe_quotes(symbol, on_quote)
    global _stream_task
    if not data_stream._running:
        _stream_task = asyncio.create_task(run_stream())
        stream_task = _stream_task
    else:
        stream_task = None

    try:
        while True:
            msg = await queue.get()
            await websocket.send_json(msg)
            if msg.get("type") == "error":
                break
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("stream error for %s", symbol)
    finally:
        live_feed.unsubscribe_bars(symbol, on_bar)
        live_feed.unsubscribe_quotes(symbol, on_quote)
        if stream_task:
            stream_task.cancel()
