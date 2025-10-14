import pytest
from httpx import AsyncClient
from backend.main import app

@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_weights():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/healthz/weights")
    assert response.status_code == 200
    data = response.json()
    assert "weights" in data
    assert "PolicyMomentum" in data["weights"]
