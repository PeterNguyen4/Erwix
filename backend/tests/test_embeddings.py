from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models import Trade
from app.services import embeddings
from app.services.embeddings import build_trade_text, embed_documents, embed_query


def _trade(**overrides) -> Trade:
    defaults = dict(
        side="buy", qty=10, symbol="AAPL", fill_price=150.5,
        filled_at=datetime(2026, 1, 5, 14, 30, tzinfo=timezone.utc),
        order_type="market", notes=None,
    )
    defaults.update(overrides)
    return Trade(**defaults)


def test_build_trade_text_basic_fields():
    text = build_trade_text(_trade())
    assert text.startswith("BUY 10 AAPL @ $150.50")
    assert "filled 2026-01-05 14:30" in text
    assert "market order" in text


def test_build_trade_text_omits_order_type_when_none():
    text = build_trade_text(_trade(order_type=None))
    assert "order" not in text


def test_build_trade_text_includes_notes_when_present():
    text = build_trade_text(_trade(notes="panicked and exited early"))
    assert "notes: panicked and exited early" in text


def test_build_trade_text_formats_fractional_qty_without_trailing_zeros():
    text = build_trade_text(_trade(qty=2.5))
    assert text.startswith("BUY 2.5 AAPL")


@pytest.fixture(autouse=True)
def _reset_voyage_client():
    embeddings._client = None
    yield
    embeddings._client = None


def test_get_client_raises_when_voyage_not_configured(monkeypatch):
    class _FakeSettings:
        has_voyage_creds = False
        voyage_api_key = ""

    monkeypatch.setattr(embeddings, "get_settings", lambda: _FakeSettings())
    with pytest.raises(RuntimeError):
        embeddings._get_client()


def test_get_client_is_cached_across_calls(monkeypatch):
    class _FakeSettings:
        has_voyage_creds = True
        voyage_api_key = "fake-key"

    monkeypatch.setattr(embeddings, "get_settings", lambda: _FakeSettings())
    with patch("app.services.embeddings.voyageai.Client") as mock_client_cls:
        mock_client_cls.return_value = MagicMock()
        first = embeddings._get_client()
        second = embeddings._get_client()

    assert first is second
    mock_client_cls.assert_called_once()


def test_embed_documents_returns_empty_list_for_empty_input():
    assert embed_documents([]) == []


def test_embed_documents_calls_client_with_document_input_type():
    fake_client = MagicMock()
    fake_client.embed.return_value = MagicMock(embeddings=[[0.1, 0.2]])
    with patch.object(embeddings, "_get_client", return_value=fake_client):
        result = embed_documents(["some trade text"])

    assert result == [[0.1, 0.2]]
    _, kwargs = fake_client.embed.call_args
    assert kwargs["input_type"] == "document"


def test_embed_query_calls_client_with_query_input_type_and_returns_single_vector():
    fake_client = MagicMock()
    fake_client.embed.return_value = MagicMock(embeddings=[[0.5, 0.6]])
    with patch.object(embeddings, "_get_client", return_value=fake_client):
        result = embed_query("the one where I panicked")

    assert result == [0.5, 0.6]
    _, kwargs = fake_client.embed.call_args
    assert kwargs["input_type"] == "query"
