import asyncio
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from testcontainers.community.postgres import PostgresContainer

TEST_USER_ID = 1

if sys.platform == "win32":
    # psycopg's async driver refuses to run under the default ProactorEventLoop.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest.fixture(scope="session")
def _pg_engine():
    """Real Postgres (matching prod's pgvector/pgvector:pg16 image), not SQLite —
    tests exercise pgvector columns/queries and Postgres-specific datetime handling
    that SQLite can't reproduce. Session-scoped: one container for the whole run,
    tables truncated between tests instead of recreated per test.
    """
    from app.db import Base

    with PostgresContainer("pgvector/pgvector:pg16", driver="psycopg") as pg:
        engine = create_async_engine(pg.get_connection_url(), pool_pre_ping=True)

        async def _setup():
            async with engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                await conn.run_sync(Base.metadata.create_all)
            # Drop pooled connections tied to this setup loop; the engine lazily
            # reconnects against whatever event loop each test's fixture runs on.
            await engine.dispose()

        asyncio.run(_setup())
        yield engine
        asyncio.run(engine.dispose())


@pytest_asyncio.fixture()
async def db_session(_pg_engine):
    from app.db import Base

    TestingSession = async_sessionmaker(bind=_pg_engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        await session.close()
        async with _pg_engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                await conn.execute(table.delete())


def make_user(user_id: int, username: str | None = None):
    from app.models import User

    return User(
        id=user_id,
        username=username or f"user{user_id}",
        email=f"user{user_id}@example.com",
        hashed_password="not-a-real-hash",
    )


@pytest_asyncio.fixture()
async def client(db_session, monkeypatch):
    from fastapi.testclient import TestClient

    from app import main
    from app.auth import get_current_user_id
    from app.db import get_db

    async def _noop(*args, **kwargs):
        return None

    # Mock background jobs
    monkeypatch.setattr(main, "reconcile_recent_fills", _noop)
    monkeypatch.setattr(main, "run_execution_logger", _noop)
    monkeypatch.setattr(main, "fail_orphaned_reports", _noop)

    # get_current_user_id is overridden below (skips the real DB lookup), but
    # tests still write rows with a real FK to users.id, so that row must exist.
    db_session.add(make_user(TEST_USER_ID))
    await db_session.commit()

    async def override_get_db():
        yield db_session

    async def override_get_current_user_id():
        return TEST_USER_ID

    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides[get_current_user_id] = override_get_current_user_id
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()
