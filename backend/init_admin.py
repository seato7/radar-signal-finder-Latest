"""
Initialize admin user on startup
"""
import asyncio
from backend.db import get_db
from backend.auth import get_password_hash
from backend.models_auth import UserRole
from datetime import datetime, timedelta

ADMIN_EMAIL = "danseaton7@gmail.com"
ADMIN_PASSWORD = "#Cricket4life"

async def init_admin():
    """Create or update admin user with premium subscription"""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"🔧 Starting admin initialization for {ADMIN_EMAIL}")
        db = get_db()
        
        # Find or create user
        user = await db.users.find_one({"email": ADMIN_EMAIL})
        logger.info(f"📝 User lookup complete. Exists: {user is not None}")
    
        if not user:
            # Create new admin user
            user_data = {
                "email": ADMIN_EMAIL,
                "hashed_password": get_password_hash(ADMIN_PASSWORD),
                "role": UserRole.ADMIN.value,
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
                    "role": UserRole.ADMIN.value,
                    "is_active": True,
                    "hashed_password": get_password_hash(ADMIN_PASSWORD),
                    "updated_at": datetime.utcnow()
                }}
            )
            user_id = str(user["_id"])
            print(f"✅ Updated admin user: {ADMIN_EMAIL}")
        
        # Create or update premium subscription
        subscription = await db.subscriptions.find_one({"user_id": user_id})
        expires_at = datetime.utcnow() + timedelta(days=365)
        
        if not subscription:
            subscription_data = {
                "user_id": user_id,
                "plan": "premium",
                "status": "active",
                "created_at": datetime.utcnow(),
                "expires_at": expires_at
            }
            await db.subscriptions.insert_one(subscription_data)
            print(f"✅ Created premium subscription for {ADMIN_EMAIL}")
        else:
            await db.subscriptions.update_one(
                {"user_id": user_id},
                {"$set": {
                    "plan": "premium",
                    "status": "active",
                    "expires_at": expires_at
                }}
            )
            print(f"✅ Updated premium subscription for {ADMIN_EMAIL}")
        
        print(f"🎉 Admin setup complete! Email: {ADMIN_EMAIL}, Role: admin, Plan: premium")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize admin: {str(e)}", exc_info=True)
        raise

if __name__ == "__main__":
    asyncio.run(init_admin())
