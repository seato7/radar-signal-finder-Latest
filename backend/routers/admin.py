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
