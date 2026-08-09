import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture()
async def db_session():
    from app.db import Base

    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    TestingSession = async_sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        await session.close()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


TEST_USER_ID = 1


@pytest.fixture()
def client(db_session, monkeypatch):
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

    async def override_get_db():
        yield db_session

    async def override_get_current_user_id():
        return TEST_USER_ID

    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides[get_current_user_id] = override_get_current_user_id
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()
