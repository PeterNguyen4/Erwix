from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.schemas import (
    Account,
    OrderResponse,
    PortfolioHistory,
    PortfolioPoint,
    Position,
)

_FAKE_CLIENT = object()


@pytest.fixture()
def _linked(monkeypatch):
    """Sample alpaca linked-account."""
    mock = AsyncMock(return_value=_FAKE_CLIENT)
    monkeypatch.setattr("app.routers.trading.get_linked_client", mock)
    return mock


@pytest.fixture()
def _unlinked(monkeypatch):
    mock = AsyncMock(return_value=None)
    monkeypatch.setattr("app.routers.trading.get_linked_client", mock)
    return mock


def _order_response() -> OrderResponse:
    return OrderResponse(
        id="order-1",
        client_order_id="client-1",
        symbol="AAPL",
        qty=10,
        side="buy",
        type="market",
        status="accepted",
        submitted_at=datetime.now(UTC),
    )


def test_create_order_submits_and_logs_intent(client, _linked):
    with (
        patch(
            "app.routers.trading.alpaca_client.submit_order",
            return_value=_order_response(),
        ) as mock_submit,
        patch("app.routers.trading.log_order_intent", new=AsyncMock()) as mock_log,
    ):
        resp = client.post(
            "/api/trading/orders",
            json={"symbol": "AAPL", "qty": 10, "side": "buy", "type": "market"},
        )
    assert resp.status_code == 200
    assert resp.json()["id"] == "order-1"
    mock_submit.assert_called_once()
    mock_log.assert_awaited_once()


def test_create_order_requires_linked_account(client, _unlinked):
    resp = client.post(
        "/api/trading/orders",
        json={"symbol": "AAPL", "qty": 10, "side": "buy", "type": "market"},
    )
    assert resp.status_code == 404


def test_create_order_maps_runtime_error_to_503(client, _linked):
    with patch(
        "app.routers.trading.alpaca_client.submit_order",
        side_effect=RuntimeError("no creds"),
    ):
        resp = client.post(
            "/api/trading/orders",
            json={"symbol": "AAPL", "qty": 10, "side": "buy", "type": "market"},
        )
    assert resp.status_code == 503


def test_create_order_maps_value_error_to_400(client, _linked):
    with patch(
        "app.routers.trading.alpaca_client.submit_order",
        side_effect=ValueError("bad order"),
    ):
        resp = client.post(
            "/api/trading/orders",
            json={"symbol": "AAPL", "qty": 10, "side": "buy", "type": "market"},
        )
    assert resp.status_code == 400


def test_create_order_rejects_non_positive_qty(client, _linked):
    resp = client.post(
        "/api/trading/orders",
        json={"symbol": "AAPL", "qty": 0, "side": "buy", "type": "market"},
    )
    assert resp.status_code == 422


def test_positions_returns_alpaca_positions(client, _linked):
    position = Position(
        symbol="AAPL",
        qty=10,
        avg_entry_price=100.0,
        market_value=1050.0,
        unrealized_pl=50.0,
    )
    with patch("app.routers.trading.alpaca_client.get_positions", return_value=[position]):
        resp = client.get("/api/trading/positions")
    assert resp.status_code == 200
    assert resp.json()[0]["symbol"] == "AAPL"


def test_positions_requires_linked_account(client, _unlinked):
    resp = client.get("/api/trading/positions")
    assert resp.status_code == 404


def test_account_returns_alpaca_account(client, _linked):
    account = Account(buying_power=1000.0, cash=1000.0, portfolio_value=5000.0, equity=5000.0)
    with patch("app.routers.trading.alpaca_client.get_account", return_value=account):
        resp = client.get("/api/trading/account")
    assert resp.status_code == 200
    assert resp.json()["equity"] == 5000.0


def test_account_requires_linked_account(client, _unlinked):
    resp = client.get("/api/trading/account")
    assert resp.status_code == 404


def test_account_maps_runtime_error_to_503(client, _linked):
    with patch(
        "app.routers.trading.alpaca_client.get_account",
        side_effect=RuntimeError("no creds"),
    ):
        resp = client.get("/api/trading/account")
    assert resp.status_code == 503


def test_portfolio_history_returns_points(client, _linked):
    history = PortfolioHistory(
        base_value=100_000.0,
        points=[PortfolioPoint(time=1, equity=101_000.0, profit_loss=1000.0)],
    )
    with patch("app.routers.trading.alpaca_client.get_portfolio_history", return_value=history):
        resp = client.get("/api/trading/portfolio/history?period=1M")
    assert resp.status_code == 200
    assert resp.json()["points"][0]["equity"] == 101_000.0


def test_trading_routes_require_auth(unauthenticated_client):
    resp = unauthenticated_client.get("/api/trading/account")
    assert resp.status_code == 401
