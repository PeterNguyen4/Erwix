from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.yahoo_finance import SEARCH_URL, yahoo_search


@pytest.mark.asyncio
async def test_yahoo_search_returns_parsed_json():
    fake_response = httpx.Response(
        200, json={"quotes": [{"symbol": "AAPL"}]}, request=httpx.Request("GET", SEARCH_URL)
    )
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=fake_response)) as mock_get:
        result = await yahoo_search({"q": "apple"})

    assert result == {"quotes": [{"symbol": "AAPL"}]}
    mock_get.assert_called_once()
    _, kwargs = mock_get.call_args
    assert kwargs["params"] == {"q": "apple"}


@pytest.mark.asyncio
async def test_yahoo_search_raises_on_http_error():
    fake_response = httpx.Response(500, request=httpx.Request("GET", SEARCH_URL))
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=fake_response)):
        with pytest.raises(httpx.HTTPStatusError):
            await yahoo_search({"q": "apple"})
