def test_list_watchlist_empty_by_default(client):
    resp = client.get("/api/watchlist")
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_watchlist_item_uppercases_symbol(client):
    resp = client.post("/api/watchlist/aapl")
    assert resp.status_code == 200
    assert resp.json()["symbol"] == "AAPL"

    listing = client.get("/api/watchlist")
    assert [i["symbol"] for i in listing.json()] == ["AAPL"]


def test_add_duplicate_watchlist_item_conflicts(client):
    client.post("/api/watchlist/aapl")
    resp = client.post("/api/watchlist/AAPL")
    assert resp.status_code == 409


def test_remove_watchlist_item(client):
    client.post("/api/watchlist/aapl")
    resp = client.delete("/api/watchlist/aapl")
    assert resp.status_code == 204

    listing = client.get("/api/watchlist")
    assert listing.json() == []


def test_remove_nonexistent_watchlist_item_404s(client):
    resp = client.delete("/api/watchlist/tsla")
    assert resp.status_code == 404
