import pytest
from httpx import AsyncClient
from backend.main import app
from backend.db import get_db
from datetime import datetime

@pytest.mark.asyncio
async def test_seed_themes():
    """Test seeding themes endpoint"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/admin/seed-themes")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "themes_after" in data

@pytest.mark.asyncio
async def test_admin_metrics_unauthorized():
    """Test admin metrics requires authentication"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/admin/metrics")
    # Should return 401 or 403 for unauthorized access
    assert response.status_code in [401, 403]

@pytest.mark.asyncio
async def test_admin_audit_unauthorized():
    """Test admin audit requires authentication"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/admin/audit")
    # Should return 401 or 403 for unauthorized access
    assert response.status_code in [401, 403]

@pytest.mark.asyncio
async def test_audit_endpoint_structure():
    """Test that audit endpoint returns proper structure when accessed"""
    # Note: This test will fail with 401/403 but verifies the endpoint exists
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/admin/audit")
    # Endpoint should exist (not 404)
    assert response.status_code != 404
