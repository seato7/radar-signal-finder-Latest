import pytest
from httpx import AsyncClient
from backend.main import app

@pytest.mark.asyncio
async def test_watchlist_crud():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Add ticker
        response = await client.post("/api/watchlist", json={"ticker": "BTC"})
        assert response.status_code == 200
        
        # Get watchlist
        response = await client.get("/api/watchlist")
        assert response.status_code == 200
        data = response.json()
        assert "BTC" in data["tickers"]
        
        # Remove ticker
        response = await client.delete("/api/watchlist/BTC")
        assert response.status_code == 200
