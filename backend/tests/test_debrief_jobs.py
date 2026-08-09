from datetime import datetime, time, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import DebriefReport, UserPreference
from app.services import debrief_jobs
from tests.conftest import make_user


@pytest.fixture()
def _use_test_db(monkeypatch, _pg_engine):
    TestSessionLocal = async_sessionmaker(bind=_pg_engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(debrief_jobs, "SessionLocal", TestSessionLocal)


async def _fake_steps(*_args, **_kwargs):
    for i in range(2):
        yield {"trade_id": i, "narrative": f"narrative {i}"}


@pytest.mark.asyncio
async def test_run_debrief_job_completes_successfully(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    report = DebriefReport(
        user_id=1, report_type="scheduled",
        window_start=datetime.now(timezone.utc) - timedelta(days=7),
        window_end=datetime.now(timezone.utc),
        scheduled_for=datetime.now(timezone.utc), status="pending", steps=[], current_step=0,
    )
    db_session.add(report)
    await db_session.commit()

    with (
        patch.object(debrief_jobs, "agenerate_steps", side_effect=_fake_steps),
        patch.object(debrief_jobs, "summarize_report", new=AsyncMock(return_value="summary text")),
    ):
        await debrief_jobs.run_debrief_job(db_session, report)

    assert report.status == "ready"
    assert report.current_step == 2
    assert len(report.steps) == 2
    assert report.summary == "summary text"
    assert report.completed_at is not None

    pref = await db_session.scalar(select(UserPreference).where(UserPreference.user_id == 1))
    assert pref is not None
    assert pref.last_debrief_at == report.completed_at


@pytest.mark.asyncio
async def test_run_debrief_job_marks_error_status_on_failure(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    report = DebriefReport(
        user_id=1, report_type="scheduled",
        window_start=datetime.now(timezone.utc) - timedelta(days=7),
        window_end=datetime.now(timezone.utc),
        scheduled_for=datetime.now(timezone.utc), status="pending", steps=[], current_step=0,
    )
    db_session.add(report)
    await db_session.commit()

    async def _raise(*_args, **_kwargs):
        raise RuntimeError("llm unavailable")
        yield  # pragma: no cover - makes this an async generator

    with patch.object(debrief_jobs, "agenerate_steps", side_effect=_raise):
        await debrief_jobs.run_debrief_job(db_session, report)

    assert report.status == "error"
    assert "llm unavailable" in report.error_detail


@pytest.mark.asyncio
async def test_run_debrief_job_filters_trades_by_symbol(db_session):
    from app.models import Trade

    db_session.add(make_user(1))
    await db_session.commit()
    now = datetime.now(timezone.utc)
    db_session.add_all([
        Trade(user_id=1, symbol="AAPL", side="buy", order_type="market", qty=1, fill_price=1, fees=0, filled_at=now - timedelta(days=1)),
        Trade(user_id=1, symbol="MSFT", side="buy", order_type="market", qty=1, fill_price=1, fees=0, filled_at=now - timedelta(days=1)),
    ])
    await db_session.commit()

    report = DebriefReport(
        user_id=1, report_type="scheduled", window_start=now - timedelta(days=7), window_end=now,
        symbol="AAPL", scheduled_for=now, status="pending", steps=[], current_step=0,
    )
    db_session.add(report)
    await db_session.commit()

    with (
        patch.object(debrief_jobs, "agenerate_steps", side_effect=_fake_steps),
        patch.object(debrief_jobs, "summarize_report", new=AsyncMock(return_value="")),
    ):
        await debrief_jobs.run_debrief_job(db_session, report)

    assert report.total_steps == 1


@pytest.mark.asyncio
async def test_create_pending_report_reuses_existing_in_flight_report(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    existing = DebriefReport(
        user_id=1, report_type="scheduled",
        window_start=datetime.now(timezone.utc) - timedelta(days=1),
        window_end=datetime.now(timezone.utc), scheduled_for=datetime.now(timezone.utc),
        status="running", steps=[], current_step=0,
    )
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    report = await debrief_jobs.create_pending_report(db_session, 1)
    assert report.id == existing.id


@pytest.mark.asyncio
async def test_create_pending_report_uses_last_debrief_at_as_window_start(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    last_debrief = datetime.now(timezone.utc) - timedelta(days=3)
    db_session.add(UserPreference(user_id=1, last_debrief_at=last_debrief))
    await db_session.commit()

    report = await debrief_jobs.create_pending_report(db_session, 1)
    assert abs((report.window_start - last_debrief).total_seconds()) < 0.01
    assert report.status == "pending"


@pytest.mark.asyncio
async def test_create_pending_report_defaults_window_when_never_debriefed(db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    report = await debrief_jobs.create_pending_report(db_session, 1)
    expected_start = report.window_end - debrief_jobs.DEFAULT_WINDOW
    assert abs((report.window_start - expected_start).total_seconds()) < 5


@pytest.mark.asyncio
async def test_fail_orphaned_reports_marks_stuck_reports_errored(_use_test_db, db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    now = datetime.now(timezone.utc)
    db_session.add_all([
        DebriefReport(user_id=1, report_type="scheduled", window_start=now, window_end=now, scheduled_for=now, status="pending", steps=[], current_step=0),
        DebriefReport(user_id=1, report_type="scheduled", window_start=now, window_end=now, scheduled_for=now, status="running", steps=[], current_step=0),
        DebriefReport(user_id=1, report_type="scheduled", window_start=now, window_end=now, scheduled_for=now, status="ready", steps=[], current_step=0),
    ])
    await db_session.commit()

    await debrief_jobs.fail_orphaned_reports()

    reports = (await db_session.execute(select(DebriefReport).where(DebriefReport.user_id == 1))).scalars().all()
    statuses = {r.status for r in reports}
    assert statuses == {"error", "ready"}


@pytest.mark.asyncio
async def test_run_debrief_job_by_id_runs_the_matching_report(_use_test_db, db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    now = datetime.now(timezone.utc)
    report = DebriefReport(
        user_id=1, report_type="scheduled", window_start=now - timedelta(days=1), window_end=now,
        scheduled_for=now, status="pending", steps=[], current_step=0,
    )
    db_session.add(report)
    await db_session.commit()
    await db_session.refresh(report)

    with (
        patch.object(debrief_jobs, "agenerate_steps", side_effect=_fake_steps),
        patch.object(debrief_jobs, "summarize_report", new=AsyncMock(return_value="")),
    ):
        await debrief_jobs.run_debrief_job_by_id(report.id)

    refreshed = await db_session.get(DebriefReport, report.id)
    await db_session.refresh(refreshed)
    assert refreshed.status == "ready"


@pytest.mark.asyncio
async def test_run_debrief_job_by_id_noop_for_missing_report(_use_test_db):
    await debrief_jobs.run_debrief_job_by_id(99999)  # must not raise


def _pref(day_of_week: int, hour: int, minute: int = 0) -> UserPreference:
    return UserPreference(user_id=1, debrief_day_of_week=day_of_week, debrief_time=time(hour, minute))


def test_slot_due_false_when_no_schedule_configured():
    pref = UserPreference(user_id=1)
    assert debrief_jobs._slot_due(pref, datetime.now(timezone.utc), timedelta(minutes=15)) is False


def test_slot_due_true_just_after_scheduled_slot():
    now = datetime(2026, 1, 8, 9, 5, tzinfo=timezone.utc)  # Thursday
    pref = _pref(day_of_week=now.weekday(), hour=9, minute=0)
    assert debrief_jobs._slot_due(pref, now, timedelta(minutes=15)) is True


def test_slot_due_false_long_after_scheduled_slot():
    now = datetime(2026, 1, 8, 12, 0, tzinfo=timezone.utc)
    pref = _pref(day_of_week=now.weekday(), hour=9, minute=0)
    assert debrief_jobs._slot_due(pref, now, timedelta(minutes=15)) is False


def test_slot_due_false_before_scheduled_slot_this_week():
    now = datetime(2026, 1, 8, 8, 0, tzinfo=timezone.utc)
    pref = _pref(day_of_week=now.weekday(), hour=9, minute=0)
    assert debrief_jobs._slot_due(pref, now, timedelta(minutes=15)) is False
