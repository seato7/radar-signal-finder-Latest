"""
Admin script to check user status in database
Usage: python -m backend.scripts.check_user_status
"""
import asyncio
from backend.db import get_db

async def check_user_status(email: str):
    """Check user's current status in database"""
    db = get_db()
    
    print(f"\n{'='*60}")
    print(f"CHECKING STATUS FOR: {email}")
    print('='*60)
    
    # Check user record
    user = await db.users.find_one({"email": email})
    if user:
        print(f"\n✓ USER RECORD FOUND:")
        print(f"  Email: {user.get('email')}")
        print(f"  Role: {user.get('role', 'user')}")
        print(f"  Active: {user.get('is_active', True)}")
        print(f"  Created: {user.get('created_at')}")
    else:
        print(f"\n✗ No user record found")
    
    # Check subscription
    subscription = await db.subscriptions.find_one({"user_id": email})
    if subscription:
        print(f"\n✓ SUBSCRIPTION FOUND:")
        print(f"  Plan: {subscription.get('plan', 'free')}")
        print(f"  Status: {subscription.get('status', 'unknown')}")
        print(f"  Created: {subscription.get('created_at')}")
        print(f"  Updated: {subscription.get('updated_at')}")
        if subscription.get('expires_at'):
            print(f"  Expires: {subscription.get('expires_at')}")
    else:
        print(f"\n✗ No subscription found (defaults to free)")
    
    print(f"\n{'='*60}\n")
    
    return {
        'user': user,
        'subscription': subscription
    }

async def main():
    email = "danseaton7@gmail.com"
    result = await check_user_status(email)
    
    # Recommendations
    print("RECOMMENDATIONS:")
    if not result['subscription'] or result['subscription'].get('plan') != 'premium':
        print("⚠️  Subscription is NOT premium. Run upgrade_user.py script.")
    else:
        print("✓ Subscription is premium")
    
    if not result['user']:
        print("⚠️  User record not found. User needs to register/login first.")
    elif result['user'].get('role') != 'admin':
        print(f"⚠️  User role is '{result['user'].get('role')}', not 'admin'")
        print("   To grant admin: update users collection manually or create admin script")
    else:
        print("✓ User has admin role")
    
    print("\nTO FIX:")
    print("1. Log out and log back in to refresh session")
    print("2. Click the refresh button (↻) next to your plan badge")
    print("3. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)")

if __name__ == "__main__":
    asyncio.run(main())
