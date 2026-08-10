"""Background weekly debrief job.

No task-queue infra exists in this app (single-instance, one shared Alpaca
paper account) so this uses an in-process APScheduler poll: every
`debrief_poll_interval_minutes`, check_and_schedule_debriefs() looks for users
whose configured day/time slot just passed, and if they have new fills since
their last debrief, creates a `DebriefReport` row and runs it to completion.

Generation itself reuses agent_graph.agenerate_steps (the non-streaming,
per-trade counterpart to the live WS's astream_review), appending one step to
DebriefReport.steps per trade so progress/ETA are queryable mid-run.
"""

import logging
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import SessionLocal
from app.models import DebriefReport, UserPreference
from app.services.agent_graph import agenerate_steps, summarize_report
from app.services.trade_retrieval import (
    count_trades_since,
    get_trades_window,
    primary_symbol,
)

logger = logging.getLogger("entro.debrief_jobs")

DEFAULT_WINDOW = timedelta(days=30)


async def run_debrief_job(db: AsyncSession, report: DebriefReport) -> None:
    """Runs a pending DebriefReport to completion, persisting steps as they finish."""
    report.status = "running"
    report.started_at = datetime.now(UTC)
    trades = await get_trades_window(db, report.user_id, report.window_start, report.window_end)
    if report.symbol:
        trades = [t for t in trades if t.symbol == report.symbol.upper()]
    else:
        report.symbol = primary_symbol(trades)  # so the report viewer knows what chart to load
    report.total_steps = len(trades)
    await db.commit()

    try:
        async for step in agenerate_steps(
            db,
            report.user_id,
            report.window_start,
            report.window_end,
            symbol=report.symbol,
            query=report.query,
        ):
            report.steps = [*report.steps, step]
            report.current_step += 1
            await db.commit()

        try:
            report.summary = await summarize_report([s["narrative"] for s in report.steps])
        except Exception:
            logger.exception("debrief summary generation failed for report %s", report.id)

        report.status = "ready"
        report.completed_at = datetime.now(UTC)
        pref = await db.scalar(
            select(UserPreference).where(UserPreference.user_id == report.user_id)
        )
        if pref is None:
            pref = UserPreference(user_id=report.user_id)
            db.add(pref)
        pref.last_debrief_at = report.completed_at
        await db.commit()
    except Exception as exc:
        logger.exception("debrief job failed for user %s report %s", report.user_id, report.id)
        await db.rollback()
        report.status = "error"
        report.error_detail = str(exc)
        await db.commit()


async def create_pending_report(db: AsyncSession, user_id: int) -> DebriefReport:
    """Dev/manual trigger support: creates a pending DebriefReport for the
    current window (or returns the one already in flight, so double-clicking
    "generate now" doesn't spawn duplicates), bypassing the day/time schedule."""
    existing = await db.scalar(
        select(DebriefReport).where(
            DebriefReport.user_id == user_id,
            DebriefReport.status.in_(["pending", "running"]),
        )
    )
    if existing:
        return existing
    now = datetime.now(UTC)
    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    window_start = (pref.last_debrief_at if pref else None) or (now - DEFAULT_WINDOW)
    report = DebriefReport(
        user_id=user_id,
        window_start=window_start,
        window_end=now,
        scheduled_for=now,
        status="pending",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


async def fail_orphaned_reports() -> None:
    """Startup recovery: any report left in pending/running belonged to a
    background asyncio.create_task from a previous process — there's no
    persistent queue, so that task is gone and the report would otherwise
    stay stuck forever, permanently shadowing create_pending_report's
    "reuse the in-flight report" check."""
    async with SessionLocal() as db:
        stuck = (
            await db.scalars(
                select(DebriefReport).where(DebriefReport.status.in_(["pending", "running"]))
            )
        ).all()
        for report in stuck:
            report.status = "error"
            report.error_detail = "Interrupted by a server restart"
        if stuck:
            await db.commit()
            logger.warning("Marked %d orphaned debrief report(s) as errored on startup", len(stuck))


async def run_debrief_job_by_id(report_id: int) -> None:
    """Runs a report job under its own DB session — used when generation is
    kicked off from a request handler via asyncio.create_task, since the
    request's own session closes as soon as the response is sent."""
    async with SessionLocal() as db:
        report = await db.get(DebriefReport, report_id)
        if report is not None:
            await run_debrief_job(db, report)


def _slot_due(pref: UserPreference, now: datetime, interval: timedelta) -> bool:
    """True if `now` falls within `interval` after this week's occurrence of the
    user's configured day/time slot (so a poll tick doesn't miss or double-fire)."""
    if pref.debrief_day_of_week is None or pref.debrief_time is None:
        return False
    candidate = now.replace(
        hour=pref.debrief_time.hour,
        minute=pref.debrief_time.minute,
        second=0,
        microsecond=0,
    )
    candidate -= timedelta(days=(candidate.weekday() - pref.debrief_day_of_week) % 7)
    if candidate > now:
        candidate -= timedelta(days=7)
    return now - candidate < interval


async def check_and_schedule_debriefs() -> None:
    """Poll tick: create + run a DebriefReport for any user whose scheduled slot
    just passed and who has new fills since their last debrief."""
    settings = get_settings()
    interval = timedelta(minutes=settings.debrief_poll_interval_minutes)
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        prefs = (
            await db.scalars(select(UserPreference).where(UserPreference.debrief_enabled.is_(True)))
        ).all()
        for pref in prefs:
            if not _slot_due(pref, now, interval):
                continue
            window_start = pref.last_debrief_at or (now - DEFAULT_WINDOW)
            if await count_trades_since(db, pref.user_id, window_start) == 0:
                continue
            existing = await db.scalar(
                select(DebriefReport).where(
                    DebriefReport.user_id == pref.user_id,
                    DebriefReport.window_start == window_start,
                    DebriefReport.status.in_(["pending", "running", "ready"]),
                )
            )
            if existing:
                continue
            report = DebriefReport(
                user_id=pref.user_id,
                window_start=window_start,
                window_end=now,
                scheduled_for=now,
                status="pending",
            )
            db.add(report)
            await db.commit()
            await run_debrief_job(db, report)


_scheduler: AsyncIOScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    settings = get_settings()
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        check_and_schedule_debriefs,
        "interval",
        minutes=settings.debrief_poll_interval_minutes,
        id="check_and_schedule_debriefs",
    )
    _scheduler.start()
    logger.info(
        "Started debrief scheduler (poll every %s min)",
        settings.debrief_poll_interval_minutes,
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
