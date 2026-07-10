import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import engine
from app.routers import analysis, journal, market, trading, user
from app.routers.market import cancel_stream_task
from app.services.execution_logger import reconcile_recent_fills, run_execution_logger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("entro")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    '''Alembic-managed schema — run `alembic upgrade head` to resolve migrations'''
    task: asyncio.Task | None = None
    if settings.has_alpaca_creds:
        reconcile_recent_fills()
        task = asyncio.create_task(run_execution_logger())
        logger.info("Started execution logger background task")
    else:
        logger.warning(
            "Alpaca credentials not set — execution logger disabled. "
            "Market/trading endpoints will return 503 until configured."
        )
    try:
        yield
    finally:
        cancel_stream_task()
        if task:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        engine.dispose()


app = FastAPI(title="Entro API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router)
app.include_router(trading.router)
app.include_router(journal.router)
app.include_router(user.router)
app.include_router(analysis.router)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "alpaca_configured": settings.has_alpaca_creds,
        "paper": settings.alpaca_paper,
    }
