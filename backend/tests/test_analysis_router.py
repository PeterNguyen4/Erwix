from unittest.mock import AsyncMock, patch


def test_trigger_backfill_returns_embedded_count(client):
    with patch("app.routers.analysis.backfill_embeddings", new=AsyncMock(return_value=3)):
        resp = client.post("/api/analysis/backfill-embeddings")
    assert resp.status_code == 200
    assert resp.json() == {"embedded": 3}


def test_trigger_backfill_maps_runtime_error_to_503(client):
    with patch(
        "app.routers.analysis.backfill_embeddings", new=AsyncMock(side_effect=RuntimeError("no voyage creds"))
    ):
        resp = client.post("/api/analysis/backfill-embeddings")
    assert resp.status_code == 503


def test_search_trades_returns_results(client):
    with patch("app.routers.analysis.semantic_search", new=AsyncMock(return_value=[])):
        resp = client.get("/api/analysis/search?query=panicked")
    assert resp.status_code == 200
    assert resp.json() == []


def test_search_trades_maps_runtime_error_to_503(client):
    with patch(
        "app.routers.analysis.semantic_search", new=AsyncMock(side_effect=RuntimeError("no voyage creds"))
    ):
        resp = client.get("/api/analysis/search?query=panicked")
    assert resp.status_code == 503


def test_search_trades_requires_query_param(client):
    resp = client.get("/api/analysis/search")
    assert resp.status_code == 422
