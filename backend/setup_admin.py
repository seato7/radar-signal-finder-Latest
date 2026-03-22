#!/usr/bin/env python3
"""
Standalone script to set up admin user
Run this directly: python backend/setup_admin.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_EMAIL = "danseaton7@gmail.com"
ADMIN_PASSWORD = "#Cricket4life"

async def setup_admin():
    # Connect to MongoDB
    mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url)
    db = client.opportunity_radar
    
    print("🔌 Connected to MongoDB")
    
    # Hash password
    hashed_password = pwd_context.hash(ADMIN_PASSWORD)
    
    # Find or create user
    user = await db.users.find_one({"email": ADMIN_EMAIL})
    
    if not user:
        # Create new admin user
        user_data = {
            "email": ADMIN_EMAIL,
            "hashed_password": hashed_password,
            "role": "admin",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = await db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        print(f"✅ Created admin user: {ADMIN_EMAIL}")
    else:
        # Update existing user to admin
        await db.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {
                "role": "admin",
                "is_active": True,
                "hashed_password": hashed_password,
                "updated_at": datetime.utcnow()
            }}
        )
        user_id = str(user["_id"])
        print(f"✅ Updated user to admin: {ADMIN_EMAIL}")
    
    # Create or update premium subscription
    expires_at = datetime.utcnow() + timedelta(days=365)
    
    subscription = await db.subscriptions.find_one({"user_id": user_id})
    if not subscription:
        subscription_data = {
            "user_id": user_id,
            "plan": "premium",
            "status": "active",
            "created_at": datetime.utcnow(),
            "expires_at": expires_at
        }
        await db.subscriptions.insert_one(subscription_data)
        print("✅ Created premium subscription")
    else:
        await db.subscriptions.update_one(
            {"user_id": user_id},
            {"$set": {
                "plan": "premium",
                "status": "active",
                "expires_at": expires_at
            }}
        )
        print("✅ Updated to premium subscription")
    
    # Verify
    final_user = await db.users.find_one({"email": ADMIN_EMAIL})
    final_sub = await db.subscriptions.find_one({"user_id": user_id})
    
    print("\n🎉 Setup complete!")
    print(f"   Email: {ADMIN_EMAIL}")
    print(f"   Role: {final_user['role']}")
    print(f"   Plan: {final_sub['plan']}")
    print(f"   Expires: {final_sub['expires_at']}")
    print("\n👉 Now log out and log back in with these credentials")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(setup_admin())
