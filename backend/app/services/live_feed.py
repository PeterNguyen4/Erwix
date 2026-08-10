"""Fan-out layer over app.alpaca_client's singleton StockDataStream.

alpaca-py's `subscribe_bars`/`subscribe_quotes` map one handler per symbol —
calling them a second time for a symbol already in use (e.g. the chart's own
`WS /api/market/stream/{symbol}` and this app's `WS /api/agent/watch/{symbol}`
both open on the same symbol) silently replaces the first handler instead of
adding a second one. Routers should subscribe through here instead of calling
alpaca_client.get_data_stream() directly, so multiple independent listeners
on the same symbol/channel all receive every tick.
"""

import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable

from app import alpaca_client

logger = logging.getLogger("erwix.live_feed")

BarHandler = Callable[[object], Awaitable[None]]
QuoteHandler = Callable[[object], Awaitable[None]]

_bar_subs: dict[str, list[BarHandler]] = defaultdict(list)
_quote_subs: dict[str, list[QuoteHandler]] = defaultdict(list)


async def _dispatch_bar(bar) -> None:
    symbol = bar.symbol
    for handler in list(_bar_subs.get(symbol, ())):
        try:
            await handler(bar)
        except Exception:
            logger.exception("live_feed bar handler failed for %s", symbol)


async def _dispatch_quote(quote) -> None:
    symbol = quote.symbol
    for handler in list(_quote_subs.get(symbol, ())):
        try:
            await handler(quote)
        except Exception:
            logger.exception("live_feed quote handler failed for %s", symbol)


def subscribe_bars(symbol: str, handler: BarHandler) -> None:
    is_first = not _bar_subs[symbol]
    _bar_subs[symbol].append(handler)
    if is_first:
        alpaca_client.get_data_stream().subscribe_bars(_dispatch_bar, symbol)


def unsubscribe_bars(symbol: str, handler: BarHandler) -> None:
    subs = _bar_subs.get(symbol)
    if not subs or handler not in subs:
        return
    subs.remove(handler)
    if not subs:
        del _bar_subs[symbol]
        alpaca_client.get_data_stream().unsubscribe_bars(symbol)


def subscribe_quotes(symbol: str, handler: QuoteHandler) -> None:
    is_first = not _quote_subs[symbol]
    _quote_subs[symbol].append(handler)
    if is_first:
        alpaca_client.get_data_stream().subscribe_quotes(_dispatch_quote, symbol)


def unsubscribe_quotes(symbol: str, handler: QuoteHandler) -> None:
    subs = _quote_subs.get(symbol)
    if not subs or handler not in subs:
        return
    subs.remove(handler)
    if not subs:
        del _quote_subs[symbol]
        alpaca_client.get_data_stream().unsubscribe_quotes(symbol)
