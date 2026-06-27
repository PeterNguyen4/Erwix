import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app import alpaca_client
from app.schemas import Candle, Quote

logger = logging.getLogger("entro.market")
router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/candles", response_model=list[Candle])
def candles(
    symbol: str = Query(..., min_length=1),
    timeframe: str = Query("1Day"),
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[Candle]:
    try:
        return alpaca_client.get_candles(symbol, timeframe, start, end)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("candles failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/quote", response_model=Quote)
def quote(symbol: str = Query(..., min_length=1)) -> Quote:
    try:
        return alpaca_client.get_quote(symbol)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("quote failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.websocket("/stream/{symbol}")
async def stream(websocket: WebSocket, symbol: str) -> None:
    """Relay live bar updates for `symbol` from Alpaca to the browser.

    Uses a per-connection StockDataStream. The Alpaca SDK stream runs its own
    asyncio loop method; we bridge bar callbacks into the websocket via a queue.
    """
    await websocket.accept()
    symbol = symbol.upper()
    queue: asyncio.Queue = asyncio.Queue()

    try:
        data_stream = alpaca_client.make_data_stream()
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

    data_stream.subscribe_bars(on_bar, symbol)
    stream_task = asyncio.create_task(data_stream._run_forever())

    try:
        while True:
            msg = await queue.get()
            await websocket.send_json(msg)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("stream error for %s", symbol)
    finally:
        stream_task.cancel()
        try:
            await data_stream.stop_ws()
        except Exception:  # noqa: BLE001
            pass
