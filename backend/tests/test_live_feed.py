from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import live_feed


@pytest.fixture(autouse=True)
def _clean_subs():
    live_feed._bar_subs.clear()
    live_feed._quote_subs.clear()
    yield
    live_feed._bar_subs.clear()
    live_feed._quote_subs.clear()


def test_subscribe_bars_touches_stream_only_on_first_subscriber():
    fake_stream = MagicMock()
    with patch.object(live_feed.alpaca_client, "get_data_stream", return_value=fake_stream):
        live_feed.subscribe_bars("AAPL", AsyncMock())
        live_feed.subscribe_bars("AAPL", AsyncMock())

    fake_stream.subscribe_bars.assert_called_once()


def test_unsubscribe_bars_touches_stream_only_on_last_unsubscribe():
    fake_stream = MagicMock()
    handler_a, handler_b = AsyncMock(), AsyncMock()
    with patch.object(live_feed.alpaca_client, "get_data_stream", return_value=fake_stream):
        live_feed.subscribe_bars("AAPL", handler_a)
        live_feed.subscribe_bars("AAPL", handler_b)
        live_feed.unsubscribe_bars("AAPL", handler_a)
        fake_stream.unsubscribe_bars.assert_not_called()
        live_feed.unsubscribe_bars("AAPL", handler_b)
        fake_stream.unsubscribe_bars.assert_called_once_with("AAPL")


def test_unsubscribe_unknown_handler_is_a_noop():
    fake_stream = MagicMock()
    with patch.object(live_feed.alpaca_client, "get_data_stream", return_value=fake_stream):
        live_feed.unsubscribe_bars("AAPL", AsyncMock())
    fake_stream.unsubscribe_bars.assert_not_called()


def test_subscribe_quotes_touches_stream_only_on_first_subscriber():
    fake_stream = MagicMock()
    with patch.object(live_feed.alpaca_client, "get_data_stream", return_value=fake_stream):
        live_feed.subscribe_quotes("AAPL", AsyncMock())
        live_feed.subscribe_quotes("AAPL", AsyncMock())

    fake_stream.subscribe_quotes.assert_called_once()


def test_different_symbols_each_trigger_their_own_subscribe():
    fake_stream = MagicMock()
    with patch.object(live_feed.alpaca_client, "get_data_stream", return_value=fake_stream):
        live_feed.subscribe_bars("AAPL", AsyncMock())
        live_feed.subscribe_bars("MSFT", AsyncMock())

    assert fake_stream.subscribe_bars.call_count == 2


@pytest.mark.asyncio
async def test_dispatch_bar_calls_every_handler_for_that_symbol():
    calls = []

    async def handler_a(bar):
        calls.append(("a", bar))

    async def handler_b(bar):
        calls.append(("b", bar))

    fake_stream = MagicMock()
    with patch.object(live_feed.alpaca_client, "get_data_stream", return_value=fake_stream):
        live_feed.subscribe_bars("AAPL", handler_a)
        live_feed.subscribe_bars("AAPL", handler_b)

    fake_bar = MagicMock(symbol="AAPL")
    await live_feed._dispatch_bar(fake_bar)

    assert calls == [("a", fake_bar), ("b", fake_bar)]


@pytest.mark.asyncio
async def test_dispatch_bar_handler_error_does_not_block_other_handlers():
    calls = []

    async def failing_handler(bar):
        raise RuntimeError("boom")

    async def ok_handler(bar):
        calls.append(bar)

    fake_stream = MagicMock()
    with patch.object(live_feed.alpaca_client, "get_data_stream", return_value=fake_stream):
        live_feed.subscribe_bars("AAPL", failing_handler)
        live_feed.subscribe_bars("AAPL", ok_handler)

    fake_bar = MagicMock(symbol="AAPL")
    await live_feed._dispatch_bar(fake_bar)

    assert calls == [fake_bar]


@pytest.mark.asyncio
async def test_dispatch_bar_no_subscribers_is_a_noop():
    fake_bar = MagicMock(symbol="UNSUBSCRIBED")
    await live_feed._dispatch_bar(fake_bar)  # must not raise
