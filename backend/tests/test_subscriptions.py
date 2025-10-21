import pytest
from httpx import AsyncClient
from backend.main import app
from backend.db import get_db
from backend.auth import create_access_token
from datetime import datetime, timedelta

@pytest.mark.asyncio
async def test_subscription_lookup_consistency():
    """Test that subscriptions are consistently looked up by user_id (ObjectId string)"""
    db = get_db()
    
    # Create test user
    from backend.models_auth import UserRole
    from backend.auth import get_password_hash
    
    test_email = "test_sub@example.com"
    test_password = "Test123456"
    
    # Clean up any existing test data
    await db.users.delete_many({"email": test_email})
    await db.subscriptions.delete_many({"user_id": {"$regex": "^[0-9a-f]{24}$"}})
    
    # Create user
    user_doc = {
        "email": test_email,
        "hashed_password": get_password_hash(test_password),
        "role": UserRole.FREE.value,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create subscription with user_id (ObjectId string)
    subscription_doc = {
        "user_id": user_id,
        "plan": "premium",
        "status": "active",
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=365)
    }
    await db.subscriptions.insert_one(subscription_doc)
    
    # Create access token
    token = create_access_token(
        data={
            "sub": test_email,
            "user_id": user_id,
            "role": UserRole.FREE.value
        }
    )
    
    # Test various endpoints that check subscriptions
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test analytics endpoint (should find subscription)
        response = await client.get("/api/analytics/dashboard", headers=headers)
        # Premium plan should allow access
        assert response.status_code in [200, 404]  # 404 if no bots, but not 403
        
    # Cleanup
    await db.users.delete_many({"email": test_email})
    await db.subscriptions.delete_many({"user_id": user_id})

@pytest.mark.asyncio
async def test_admin_subscription_storage():
    """Test that admin setup stores subscriptions with correct user_id format"""
    db = get_db()
    
    # Find the admin user
    admin_user = await db.users.find_one({"role": "admin"})
    
    if admin_user:
        user_id = str(admin_user["_id"])
        
        # Check subscription is stored with user_id (not email)
        subscription = await db.subscriptions.find_one({"user_id": user_id})
        
        assert subscription is not None, "Admin should have subscription"
        assert subscription["user_id"] == user_id, "Subscription should use ObjectId string as user_id"
        assert subscription["plan"] == "premium", "Admin should have premium plan"
        assert subscription["status"] == "active", "Subscription should be active"
