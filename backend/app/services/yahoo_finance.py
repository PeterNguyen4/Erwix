"""Shared client for Yahoo Finance's public, keyless search endpoint — used by
both symbol search (alpaca_client.search_assets) and headline scraping
(services.news)."""

import httpx

SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"


async def yahoo_search(params: dict) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            SEARCH_URL,
            params=params,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5.0,
        )
        resp.raise_for_status()
        return resp.json()
