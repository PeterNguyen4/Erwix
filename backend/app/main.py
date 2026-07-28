import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import engine
from app.routers import agent, alpaca_oauth, analysis, news, backtest, journal, market, strategy, trading, users
from app.routers.market import cancel_stream_task
from app.services.debrief_jobs import start_scheduler, stop_scheduler
from app.services.execution_logger import reconcile_recent_fills, run_execution_logger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("entro")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    task: asyncio.Task | None = None
    if settings.has_alpaca_creds:
        reconcile_recent_fills()
        task = asyncio.create_task(run_execution_logger())
        logger.info("Started execution logger background task")
    else:
        logger.warning(
            "Alpaca credentials not set. Execution logger disabled. "
            "Market/trading endpoints will return 503 until configured."
        )
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()
        cancel_stream_task()
        if task:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        engine.dispose()


app = FastAPI(lifespan=lifespan)

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


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "alpaca_configured": settings.has_alpaca_creds,
        "paper": settings.alpaca_paper,
    }
