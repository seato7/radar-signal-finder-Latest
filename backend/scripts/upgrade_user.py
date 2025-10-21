"""
Admin script to upgrade a user to premium plan
Usage: python -m backend.scripts.upgrade_user
"""
import asyncio
from backend.db import get_db
from datetime import datetime, timedelta

async def upgrade_user_to_premium(email: str):
    """Upgrade a user to premium plan"""
    db = get_db()
    
    # Check if user exists
    user = await db.users.find_one({"email": email})
    if not user:
        print(f"❌ User {email} not found in database")
        return False
    
    print(f"✓ Found user: {email}")
    
    # Check existing subscription
    existing_sub = await db.subscriptions.find_one({"user_id": email})
    
    if existing_sub:
        # Update existing subscription
        result = await db.subscriptions.update_one(
            {"user_id": email},
            {
                "$set": {
                    "plan": "premium",
                    "status": "active",
                    "updated_at": datetime.utcnow(),
                    "expires_at": datetime.utcnow() + timedelta(days=365)  # 1 year
                }
            }
        )
        print(f"✓ Updated existing subscription to premium")
    else:
        # Create new subscription
        subscription = {
            "user_id": email,
            "plan": "premium",
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=365)
        }
        result = await db.subscriptions.insert_one(subscription)
        print(f"✓ Created new premium subscription")
    
    # Verify the update
    updated_sub = await db.subscriptions.find_one({"user_id": email})
    print(f"\n✅ SUCCESS! User {email} is now on {updated_sub['plan']} plan")
    print(f"   Status: {updated_sub['status']}")
    print(f"   Expires: {updated_sub.get('expires_at', 'Never')}")
    
    return True

async def main():
    email = "danseaton7@gmail.com"
    
    print(f"🔄 Upgrading {email} to Premium plan...\n")
    
    success = await upgrade_user_to_premium(email)
    
    if not success:
        print("\n❌ Upgrade failed")
        return
    
    print("\n" + "="*60)
    print("PREMIUM FEATURES NOW AVAILABLE:")
    print("="*60)
    print("✓ Unlimited live-eligible bots")
    print("✓ Unlimited alerts")
    print("✓ Priority support")
    print("✓ Advanced analytics")
    print("✓ CSV & Parquet exports")
    print("✓ Unlimited backtest horizon")
    print("="*60)

if __name__ == "__main__":
    asyncio.run(main())
