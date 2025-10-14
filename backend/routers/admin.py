from fastapi import APIRouter, HTTPException, Depends
from backend.db import get_db
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/metrics")
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

@router.get("/audit")
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
