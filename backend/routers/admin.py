from fastapi import APIRouter, HTTPException, Depends
from backend.db import get_db
from backend.auth import require_admin, TokenData
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

@router.get("/audit", dependencies=[Depends(require_admin)])
async def get_audit_log(limit: int = 100, db=Depends(get_db)):
    """Get recent bot actions and payment events"""
    
    # Get recent bot logs
    bot_logs = await db.bot_logs.find().sort("ts", -1).limit(limit).to_list(length=limit)
    
    # Get recent subscription updates
    subs = await db.subscriptions.find().sort("updated_at", -1).limit(limit).to_list(length=limit)
    
    return {
        "bot_actions": bot_logs,
        "payment_events": subs
    }

@router.get("/make-admin/{email}")
async def make_user_admin(email: str, db=Depends(get_db)):
    """Promote a user to admin role - temporary endpoint for setup"""
    from backend.models_auth import UserRole
    
    # Find user by email
    user = await db.users.find_one({"email": email})
    
    if not user:
        raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")
    
    # Update role to admin
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"role": UserRole.ADMIN.value}}
    )
    
    return {
        "status": "success",
        "message": f"Successfully promoted {email} to admin",
        "email": email,
        "new_role": UserRole.ADMIN.value
    }

@router.get("/upgrade-premium/{email}")
async def upgrade_user_to_premium(email: str, db=Depends(get_db)):
    """Upgrade a user to premium plan - temporary endpoint for setup"""
    
    # Find user by email
    user = await db.users.find_one({"email": email})
    
    if not user:
        raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")
    
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
                    "expires_at": datetime.utcnow() + timedelta(days=365)
                }
            }
        )
        message = "Updated existing subscription to premium"
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
        message = "Created new premium subscription"
    
    return {
        "status": "success",
        "message": message,
        "email": email,
        "plan": "premium",
        "expires_at": (datetime.utcnow() + timedelta(days=365)).isoformat()
    }

@router.get("/setup/{email}")
async def full_setup(email: str, db=Depends(get_db)):
    """Complete setup - make admin AND upgrade to premium"""
    from backend.models_auth import UserRole
    
    # Find user by email
    user = await db.users.find_one({"email": email})
    
    if not user:
        raise HTTPException(status_code=404, detail=f"User with email '{email}' not found. Please login first.")
    
    # 1. Update role to admin
    await db.users.update_one(
        {"email": email},
        {"$set": {"role": UserRole.ADMIN.value}}
    )
    
    # 2. Update/create premium subscription
    existing_sub = await db.subscriptions.find_one({"user_id": email})
    
    if existing_sub:
        await db.subscriptions.update_one(
            {"user_id": email},
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
            "user_id": email,
            "plan": "premium",
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=365)
        }
        await db.subscriptions.insert_one(subscription)
    
    return {
        "status": "success",
        "message": f"Successfully set up {email} as admin with premium plan",
        "email": email,
        "role": UserRole.ADMIN.value,
        "plan": "premium",
        "expires_at": (datetime.utcnow() + timedelta(days=365)).isoformat()
    }
