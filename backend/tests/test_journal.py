from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from app.models import Trade


def _make_trade(symbol: str, days_ago: int, side: str = "buy") -> Trade:
    return Trade(
        symbol=symbol,
        side=side,
        order_type="market",
        qty=10,
        fill_price=100.0,
        fees=0.0,
        filled_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )


def test_trades_window_filters_by_date(client, db_session):
    db_session.add_all(
        [_make_trade("AAPL", 1), _make_trade("AAPL", 10), _make_trade("MSFT", 2)]
    )
    db_session.commit()

    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    resp = client.get(f"/api/journal/trades?from={quote(since)}")
    assert resp.status_code == 200
    rows = resp.json()
    # Only the 1-day and 2-day-old trades fall in the 7-day window
    assert len(rows) == 2
    assert {r["symbol"] for r in rows} == {"AAPL", "MSFT"}


def test_trades_filter_by_symbol(client, db_session):
    db_session.add_all([_make_trade("AAPL", 1), _make_trade("MSFT", 1)])
    db_session.commit()

    resp = client.get("/api/journal/trades?symbol=aapl")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["symbol"] == "AAPL"


def test_get_trade_not_found(client):
    resp = client.get("/api/journal/trades/9999")
    assert resp.status_code == 404
