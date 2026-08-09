from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from app.schemas import Candle, Quote


def test_search_returns_alpaca_results(client):
    with patch(
        "app.routers.market.alpaca_client.search_assets",
        new=AsyncMock(return_value=[{"symbol": "AAPL"}]),
    ):
        resp = client.get("/api/market/search?q=apple")
    assert resp.status_code == 200
    assert resp.json() == [{"symbol": "AAPL"}]


def test_candles_returns_alpaca_candles(client):
    candle = Candle(time=1, open=1, high=2, low=0.5, close=1.5, volume=100)
    with patch("app.routers.market.alpaca_client.get_candles", return_value=[candle]):
        resp = client.get("/api/market/candles?symbol=AAPL")
    assert resp.status_code == 200
    assert resp.json()[0]["close"] == 1.5


def test_candles_maps_runtime_error_to_503(client):
    with patch(
        "app.routers.market.alpaca_client.get_candles",
        side_effect=RuntimeError("no creds"),
    ):
        resp = client.get("/api/market/candles?symbol=AAPL")
    assert resp.status_code == 503


def test_candles_maps_value_error_to_400(client):
    with patch(
        "app.routers.market.alpaca_client.get_candles",
        side_effect=ValueError("bad timeframe"),
    ):
        resp = client.get("/api/market/candles?symbol=AAPL&timeframe=bogus")
    assert resp.status_code == 400


def test_candles_maps_unexpected_error_to_502(client):
    with patch(
        "app.routers.market.alpaca_client.get_candles", side_effect=Exception("boom")
    ):
        resp = client.get("/api/market/candles?symbol=AAPL")
    assert resp.status_code == 502


def test_quote_returns_alpaca_quote(client):
    quote = Quote(
        symbol="AAPL", bid=100.0, ask=100.5, price=100.25, timestamp=datetime.now(UTC)
    )
    with patch("app.routers.market.alpaca_client.get_quote", return_value=quote):
        resp = client.get("/api/market/quote?symbol=AAPL")
    assert resp.status_code == 200
    assert resp.json()["symbol"] == "AAPL"


def test_market_routes_require_auth(db_session):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as unauthenticated_client:
        resp = unauthenticated_client.get("/api/market/quote?symbol=AAPL")
    assert resp.status_code == 401
