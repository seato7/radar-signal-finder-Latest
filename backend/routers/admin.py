from fastapi import APIRouter, HTTPException, Depends
from backend.db import get_db
from backend.auth import require_admin, TokenData
from backend.models_admin import AdminActionRequest
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

router = APIRouter()

CANONICAL_THEMES = [
    {
        "_id": "theme-ai-liquid-cooling",
        "name": "AI Liquid Cooling",
        "keywords": ["liquid cooling", "data center", "datacenter", "thermal"],
        "alpha": 1.0,
        "contributors": []
    },
    {
        "_id": "theme-water-reuse",
        "name": "Water Reuse",
        "keywords": ["desal", "reverse osmosis", "water reuse", "pipeline"],
        "alpha": 1.0,
        "contributors": []
    },
    {
        "_id": "theme-hvdc-transformers",
        "name": "HVDC Transformers",
        "keywords": ["hvdc", "transformer", "transmission", "interconnector", "grid"],
        "alpha": 1.0,
        "contributors": []
    }
]

@router.post("/seed-themes")
async def seed_themes(db=Depends(get_db)):
    """Seed canonical themes - no auth required for initial setup"""
    
    # Check if themes already exist
    existing_count = await db.themes.count_documents({})
    
    for theme in CANONICAL_THEMES:
        await db.themes.update_one(
            {"_id": theme["_id"]},
            {"$set": theme},
            upsert=True
        )
    
    return {
        "status": "success",
        "message": f"Seeded {len(CANONICAL_THEMES)} themes",
        "themes_before": existing_count,
        "themes_after": await db.themes.count_documents({})
    }

@router.get("/metrics", dependencies=[Depends(require_admin)])
async def get_admin_metrics(db=Depends(get_db)):
    """Get admin dashboard metrics"""
    
    # Count totals
    total_bots = await db.bots.count_documents({})
    total_alerts = await db.alerts.count_documents({})
    total_subscriptions = await db.subscriptions.count_documents({})
    
    # Count by status
    running_bots = await db.bots.count_documents({"status": "running"})
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    
    # Recent activity (last 24h)
    yesterday = datetime.utcnow() - timedelta(days=1)
    recent_alerts = await db.alerts.count_documents({"created_at": {"$gte": yesterday}})
    recent_bots = await db.bots.count_documents({"created_at": {"$gte": yesterday}})
    
    return {
        "totals": {
            "bots": total_bots,
            "alerts": total_alerts,
            "subscriptions": total_subscriptions
        },
        "active": {
            "running_bots": running_bots,
            "active_subscriptions": active_subs
        },
        "recent_24h": {
            "alerts": recent_alerts,
            "bots_created": recent_bots
        }
    }

@router.get("/users", dependencies=[Depends(require_admin)])
async def get_all_users(
    role: str = None, 
    is_active: bool = None,
    limit: int = 100,
    db=Depends(get_db)
):
    """Get list of all users with optional filters"""
    
    # Build query filter
    query = {}
    if role:
        query["role"] = role
    if is_active is not None:
        query["is_active"] = is_active
    
    # Get users
    users = await db.users.find(query).sort("created_at", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectIds to strings and remove sensitive data
    user_list = []
    for user in users:
        user_list.append({
            "id": str(user["_id"]),
            "email": user.get("email"),
            "role": user.get("role", "free"),
            "is_active": user.get("is_active", True),
            "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
            "updated_at": user.get("updated_at").isoformat() if user.get("updated_at") else None,
        })
    
    return {
        "users": user_list,
        "total": len(user_list)
    }

@router.get("/user-stats", dependencies=[Depends(require_admin)])
async def get_user_stats(db=Depends(get_db)):
    """Get user growth and activity statistics"""
    
    # Count by role
    total_users = await db.users.count_documents({})
    free_users = await db.users.count_documents({"role": "free"})
    lite_users = await db.users.count_documents({"role": "lite"})
    pro_users = await db.users.count_documents({"role": "pro"})
    admin_users = await db.users.count_documents({"role": "admin"})
    active_users = await db.users.count_documents({"is_active": True})
    
    # Recent signups (last 7 days, 30 days)
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    signups_7d = await db.users.count_documents({"created_at": {"$gte": week_ago}})
    signups_30d = await db.users.count_documents({"created_at": {"$gte": month_ago}})
    
    # Get recent signups with details
    recent_signups = await db.users.find().sort("created_at", -1).limit(10).to_list(length=10)
    recent_list = []
    for user in recent_signups:
        recent_list.append({
            "id": str(user["_id"]),
            "email": user.get("email"),
            "role": user.get("role", "free"),
            "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
        })
    
    return {
        "totals": {
            "all_users": total_users,
            "free": free_users,
            "lite": lite_users,
            "pro": pro_users,
            "admin": admin_users,
            "active": active_users
        },
        "growth": {
            "signups_7d": signups_7d,
            "signups_30d": signups_30d
        },
        "recent_signups": recent_list
    }

@router.get("/audit", dependencies=[Depends(require_admin)])
async def get_audit_log(limit: int = 100, db=Depends(get_db)):
    """Get recent bot actions and payment events"""
    
    # Get recent bot logs
    bot_logs = await db.bot_logs.find().sort("ts", -1).limit(limit).to_list(length=limit)
    
    # Get recent subscription updates
    subs = await db.subscriptions.find().sort("updated_at", -1).limit(limit).to_list(length=limit)
    
    # Convert ObjectIds to strings
    for log in bot_logs:
        if "_id" in log:
            log["_id"] = str(log["_id"])
    
    for sub in subs:
        if "_id" in sub:
            sub["_id"] = str(sub["_id"])
    
    return {
        "bot_actions": bot_logs,
        "payment_events": subs
    }

@router.post("/make-admin")
async def make_user_admin(
    data: AdminActionRequest,
    current_user: TokenData = Depends(require_admin),
    db=Depends(get_db)
):
    """Promote a user to admin role - requires admin authentication"""
    from backend.models_auth import UserRole
    
    # Find user by email
    user = await db.users.find_one({"email": data.email})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update role to admin
    result = await db.users.update_one(
        {"email": data.email},
        {"$set": {"role": UserRole.ADMIN.value, "updated_at": datetime.utcnow()}}
    )
    
    # Log admin action
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(
        f"Admin {current_user.email} promoted {data.email} to admin role. "
        f"Reason: {data.reason or 'Not provided'}"
    )
    
    return {
        "status": "success",
        "message": f"Successfully promoted {data.email} to admin",
        "email": data.email
    }

@router.post("/upgrade-premium")
async def upgrade_user_to_premium(
    data: AdminActionRequest,
    current_user: TokenData = Depends(require_admin),
    db=Depends(get_db)
):
    """Upgrade a user to premium plan - requires admin authentication"""
    
    # Find user by email
    user = await db.users.find_one({"email": data.email})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = str(user["_id"])
    
    # Check existing subscription
    existing_sub = await db.subscriptions.find_one({"user_id": user_id})
    
    if existing_sub:
        # Update existing subscription
        result = await db.subscriptions.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "plan": "premium",
                    "status": "active",
                    "updated_at": datetime.utcnow(),
                    "expires_at": datetime.utcnow() + timedelta(days=365)
                }
            }
        )
        message = "Updated existing subscription to premium"
    else:
        # Create new subscription
        subscription = {
            "user_id": user_id,
            "plan": "premium",
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=365)
        }
        result = await db.subscriptions.insert_one(subscription)
        message = "Created new premium subscription"
    
    # Log admin action
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(
        f"Admin {current_user.email} upgraded {data.email} to premium. "
        f"Reason: {data.reason or 'Not provided'}"
    )
    
    return {
        "status": "success",
        "message": message,
        "email": data.email
    }

@router.post("/setup")
async def full_setup(
    data: AdminActionRequest,
    current_user: TokenData = Depends(require_admin),
    db=Depends(get_db)
):
    """Complete setup - make admin AND upgrade to premium - requires admin authentication"""
    from backend.models_auth import UserRole
    
    # Find user by email
    user = await db.users.find_one({"email": data.email})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Please register first.")
    
    user_id = str(user["_id"])
    
    # 1. Update role to admin
    await db.users.update_one(
        {"email": data.email},
        {"$set": {"role": UserRole.ADMIN.value, "updated_at": datetime.utcnow()}}
    )
    
    # 2. Update/create premium subscription
    existing_sub = await db.subscriptions.find_one({"user_id": user_id})
    
    if existing_sub:
        await db.subscriptions.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "plan": "premium",
                    "status": "active",
                    "updated_at": datetime.utcnow(),
                    "expires_at": datetime.utcnow() + timedelta(days=365)
                }
            }
        )
    else:
        subscription = {
            "user_id": user_id,
            "plan": "premium",
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=365)
        }
        await db.subscriptions.insert_one(subscription)
    
    # Log admin action
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(
        f"Admin {current_user.email} performed full setup for {data.email}. "
        f"Reason: {data.reason or 'Not provided'}"
    )
    
    return {
        "status": "success",
        "message": f"Successfully set up {data.email} as admin with premium plan",
        "email": data.email
    }
