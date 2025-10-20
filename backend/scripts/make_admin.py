"""
Script to promote a user to admin role
Usage: python -m backend.scripts.make_admin <email>
"""
import sys
import asyncio
from backend.db import get_db
from backend.models_auth import UserRole

async def make_admin(email: str):
    """Update user role to admin"""
    db = get_db()
    
    # Find user by email
    user = await db.users.find_one({"email": email})
    
    if not user:
        print(f"❌ User with email '{email}' not found")
        return False
    
    # Update role to admin
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"role": UserRole.ADMIN.value}}
    )
    
    if result.modified_count > 0:
        print(f"✅ Successfully promoted {email} to admin")
        return True
    else:
        print(f"ℹ️  User {email} is already an admin")
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m backend.scripts.make_admin <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    asyncio.run(make_admin(email))
