"""Retrieval tools for the router/ask agent (agent_graph.build_router_graph).

Distinct in kind from agent_graph's chart/UI tools (draw_annotations etc, which
mutate the whiteboard) — these fetch data. Each is a plain async function (also
reusable directly, e.g. by news_agent for strategy context) plus a `make_*_tool`
factory that closes over `db`/`user_id` into an LLM-bindable @tool, since
LangChain tool args must be model-controllable and can't include an AsyncSession.
"""

import asyncio
import json
from datetime import datetime

from langchain_core.tools import BaseTool, tool
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embeddings import build_trade_text
from app.services.news import fetch_news
from app.services.strategy import archetype_name, get_active_strategy, render_playbook
from app.services.trade_retrieval import compute_pnl_summary_pair, get_trades_window, semantic_search


async def get_strategy_context(db: AsyncSession, user_id: int) -> tuple[str, str] | None:
    """The trader's active strategy as (archetype_label, rendered_playbook), or
    None if they haven't stated one. Shared by every prompt that references the
    trader's strategy — do not re-fetch/re-render this inline elsewhere."""
    strategy = await get_active_strategy(db, user_id)
    if not strategy or not strategy.structured_summary:
        return None
    try:
        rendered = render_playbook(json.loads(strategy.structured_summary))
    except (json.JSONDecodeError, TypeError, AttributeError):
        rendered = strategy.structured_summary  # legacy plain-text summary, pre-JSON playbooks
    label = archetype_name(strategy.archetype) or "Custom"
    return label, rendered


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def make_strategy_context_tool(db: AsyncSession, user_id: int, lock: asyncio.Lock) -> BaseTool:
    @tool
    async def strategy_context() -> str:
        """Look up the trader's stated strategy/playbook (their trading rules, archetype,
        preferred symbols) — call this to check whether trades align with or drift from
        what they said they'd do."""
        async with lock:
            ctx = await get_strategy_context(db, user_id)
        if not ctx:
            return "The trader has not stated a strategy."
        label, rendered = ctx
        return f"The trader's stated strategy ({label}):\n{rendered}"

    return strategy_context


def make_compare_trade_windows_tool(db: AsyncSession, user_id: int, lock: asyncio.Lock) -> BaseTool:
    @tool
    async def compare_trade_windows(
        window_a_start: str, window_a_end: str, window_b_start: str, window_b_end: str
    ) -> str:
        """Compare realized PnL/win-rate between two arbitrary date ranges (ISO 8601
        datetimes) — use this for any 'this week vs last week' / 'this month vs last
        month' / before-vs-after comparison question."""
        async with lock:
            a, b = await compute_pnl_summary_pair(
                db,
                user_id,
                (_parse_iso(window_a_start), _parse_iso(window_a_end)),
                (_parse_iso(window_b_start), _parse_iso(window_b_end)),
            )

        def _fmt(label: str, s) -> str:
            return (
                f"{label}: total_pnl={s.total_pnl:.2f}, win_rate="
                f"{f'{s.win_rate:.0%}' if s.win_rate is not None else 'n/a'}, "
                f"wins={s.win_count}, losses={s.loss_count}, breakeven={s.breakeven_count}, "
                f"largest_win={s.largest_win if s.largest_win is not None else 'n/a'}, "
                f"largest_loss={s.largest_loss if s.largest_loss is not None else 'n/a'}"
            )

        return (
            f"{_fmt(f'Window A ({window_a_start} to {window_a_end})', a)}\n"
            f"{_fmt(f'Window B ({window_b_start} to {window_b_end})', b)}\n"
            f"Delta (A - B) total_pnl: {a.total_pnl - b.total_pnl:.2f}"
        )

    return compare_trade_windows


def make_fetch_trades_window_tool(db: AsyncSession, user_id: int, lock: asyncio.Lock) -> BaseTool:
    @tool
    async def fetch_trades_window(start: str, end: str, symbol: str | None = None) -> str:
        """Fetch a trader's individual fills in a date range (ISO 8601 datetimes,
        optionally filtered to one symbol) with per-trade detail (side, price, notes)
        — use this to look at specific trades, not just aggregate stats."""
        async with lock:
            trades = await get_trades_window(db, user_id, _parse_iso(start), _parse_iso(end))
        if symbol:
            trades = [t for t in trades if t.symbol == symbol.upper()]
        if not trades:
            return "No fills in this window."
        return "\n".join(f"- (trade_id={t.id}) {build_trade_text(t)}" for t in trades)

    return fetch_trades_window


def make_search_trades_tool(db: AsyncSession, user_id: int, lock: asyncio.Lock) -> BaseTool:
    @tool
    async def search_trades(query: str) -> str:
        """Semantic search over the trader's full trade history (not date-limited) for
        trades matching a description, e.g. 'trades where I panicked' or 'breakout
        trades that failed'."""
        async with lock:
            found = await semantic_search(db, user_id, query)
        if not found:
            return "No matching trades found."
        return "\n".join(f"- (trade_id={t.id}) {build_trade_text(t)}" for t in found)

    return search_trades


def make_fetch_symbol_news_tool(db: AsyncSession, user_id: int, lock: asyncio.Lock) -> BaseTool:
    @tool
    async def fetch_symbol_news(start: str, end: str, symbol: str | None = None) -> str:
        """Fetch recent news headlines for the symbols the trader actually traded in a
        date range (ISO 8601 datetimes) — use this to check whether news/events explain
        a trade's outcome."""
        async with lock:
            trades = await get_trades_window(db, user_id, _parse_iso(start), _parse_iso(end))
        symbols = sorted({t.symbol for t in trades if not symbol or t.symbol == symbol.upper()})
        if not symbols:
            return "No trades (and so no symbols to look up news for) in this window."
        articles = await fetch_news(symbols, limit_per_symbol=6)
        if not articles:
            return "No recent headlines found for these symbols."
        by_symbol: dict[str, list[str]] = {}
        for a in articles:
            by_symbol.setdefault(a.symbol, []).append(f"  - [{a.publisher}] {a.title} ({a.published_at:%Y-%m-%d})")
        lines = []
        for sym, headlines in by_symbol.items():
            lines.append(f"{sym}:")
            lines.extend(headlines)
        return "\n".join(lines)

    return fetch_symbol_news


def build_retrieval_tools(db: AsyncSession, user_id: int) -> list[BaseTool]:
    """Factory for orchestrator agent's tools."""
    lock = asyncio.Lock()
    return [
        make_strategy_context_tool(db, user_id, lock),
        make_compare_trade_windows_tool(db, user_id, lock),
        make_fetch_trades_window_tool(db, user_id, lock),
        make_search_trades_tool(db, user_id, lock),
        make_fetch_symbol_news_tool(db, user_id, lock),
    ]
