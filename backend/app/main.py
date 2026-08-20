import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import get_settings
from app.db import engine
from app.routers import (
    agent,
    alpaca_oauth,
    analysis,
    backtest,
    journal,
    market,
    news,
    notifications,
    onboarding,
    strategy,
    trading,
    users,
    watchlist,
)
from app.routers.market import cancel_stream_task
from app.services.debrief_jobs import (
    fail_orphaned_reports,
    start_scheduler,
    stop_scheduler,
)
from app.services.execution_logger import (
    reconcile_recent_fills,
    start_all_user_streams,
    stop_all_user_streams,
)
from app.services.rate_limiter import close_rate_limiter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("erwix")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.has_alpaca_creds:
        logger.warning(
            "Alpaca credentials not set. Market data endpoints will return 503 until configured."
        )
    await reconcile_recent_fills()
    await start_all_user_streams()
    logger.info("Started per-user execution logger streams")
    await fail_orphaned_reports()
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()
        cancel_stream_task()
        await stop_all_user_streams()
        await close_rate_limiter()
        await engine.dispose()


app = FastAPI(lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)

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
app.include_router(users.router)
app.include_router(analysis.router)
app.include_router(agent.router)
app.include_router(strategy.router)
app.include_router(news.router)
app.include_router(backtest.router)
app.include_router(alpaca_oauth.router)
app.include_router(notifications.router)
app.include_router(watchlist.router)
app.include_router(onboarding.router)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "alpaca_configured": settings.has_alpaca_creds,
        "paper": settings.alpaca_paper,
    }
