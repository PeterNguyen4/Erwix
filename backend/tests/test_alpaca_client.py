from datetime import datetime, timezone
from types import SimpleNamespace

from app import alpaca_client


class _FakeBars:
    def __init__(self, data):
        self.data = data


def test_get_candles_maps_bars(monkeypatch):
    ts = datetime(2026, 1, 2, tzinfo=timezone.utc)
    bar = SimpleNamespace(
        timestamp=ts, open=1.0, high=2.0, low=0.5, close=1.5, volume=1000
    )

    class FakeClient:
        def get_stock_bars(self, req):
            return _FakeBars({"AAPL": [bar]})

    monkeypatch.setattr(alpaca_client, "_data_client", lambda: FakeClient())

    candles = alpaca_client.get_candles("AAPL", "1Day")
    assert len(candles) == 1
    c = candles[0]
    assert c.time == int(ts.timestamp())
    assert c.open == 1.0 and c.close == 1.5 and c.volume == 1000


def test_get_quote_computes_mid(monkeypatch):
    q = SimpleNamespace(
        bid_price=10.0, ask_price=12.0, timestamp=datetime.now(timezone.utc)
    )

    class FakeClient:
        def get_stock_latest_quote(self, req):
            return {"AAPL": q}

    monkeypatch.setattr(alpaca_client, "_data_client", lambda: FakeClient())

    quote = alpaca_client.get_quote("AAPL")
    assert quote.price == 11.0
    assert quote.bid == 10.0 and quote.ask == 12.0
