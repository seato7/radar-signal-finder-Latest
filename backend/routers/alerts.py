from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from backend.db import get_db
from backend.config import settings
from backend.services.alerts import check_and_fire_alerts
from backend.services.payments import get_plans
from backend.auth import get_current_user
from typing import Dict
from datetime import datetime
import re

router = APIRouter()

class ThemeSubscription(BaseModel):
    theme_id: str = Field(..., min_length=1, max_length=100, description="Theme ID to subscribe to")
    
    @property
    def validated_id(self) -> str:
        """Return sanitized theme_id (alphanumeric, hyphens, underscores only)"""
        return re.sub(r'[^a-zA-Z0-9_-]', '', self.theme_id)

@router.get("")
async def get_alerts(user=Depends(get_current_user), db=Depends(get_db)):
    """Get all active alerts for the user"""
    # Get user's alerts (or all if admin)
    query = {"status": {"$in": ["active", "fired_slack_error"]}}
    if user.get("role") != "admin":
        query["user_id"] = user["email"]
    
    alerts_cursor = db.alerts.find(query).sort("created_at", -1).limit(50)
    alerts = await alerts_cursor.to_list(length=None)
    
    return [
        {
            "id": str(a["_id"]),
            "theme": a["theme"],
            "theme_id": a.get("theme_id"),
            "score": a["score"],
            "positives": a["positives"],
            "created_at": a["created_at"].isoformat(),
            "dont_miss": a.get("dont_miss"),
            "status": a.get("status", "active")
        }
        for a in alerts
    ]

@router.get("/thresholds")
async def get_thresholds():
    """Get current alert thresholds"""
    return {
        "score_threshold": settings.ALERT_SCORE_THRESHOLD,
        "min_positives": 3,
        "half_life_days": settings.HALF_LIFE_DAYS,
        "momentum_fade_threshold": 0.5
    }

@router.post("/thresholds")
async def update_thresholds(thresholds: Dict = Body(...)):
    """Update alert thresholds (stub - would need persistence)"""
    return {
        "status": "updated",
        "thresholds": thresholds,
        "note": "Thresholds updated in memory only (restart will reset)"
    }

@router.post("/check")
async def run_alert_check():
    """Manually trigger alert checking"""
    result = await check_and_fire_alerts()
    return result

@router.post("/subscribe")
async def subscribe_to_theme(
    data: ThemeSubscription,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Subscribe to alerts for a specific theme"""
    theme_id = data.validated_id
    
    # Check user's subscription plan and alert limits
    subscription = await db.subscriptions.find_one({"user_id": user.user_id})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    
    # Count existing alerts for this user
    alert_count = await db.alerts.count_documents({"user_id": user.user_id})
    
    # Check limits
    max_alerts = get_plans()[user_plan]["features"]["max_alerts"]
    if max_alerts != -1 and alert_count >= max_alerts:
        raise HTTPException(
            status_code=403,
            detail=f"Alert limit reached. Upgrade your plan to add more alerts."
        )
    
    # Check if already subscribed
    existing = await db.alerts.find_one({
        "user_id": user["email"],
        "theme_id": theme_id,
        "type": "subscription"
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Already subscribed to this theme")
    
    # Create alert subscription
    alert_doc = {
        "user_id": user["email"],
        "theme_id": theme_id,
        "type": "subscription",
        "status": "active",
        "created_at": datetime.utcnow()
    }
    
    result = await db.alerts.insert_one(alert_doc)
    alert_doc["id"] = str(result.inserted_id)
    alert_doc.pop("_id", None)
    
    return {"message": "Subscribed to theme alerts", "alert": alert_doc}

@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete/unsubscribe from an alert"""
    from bson import ObjectId
    
    # Ensure user owns this alert (or is admin)
    query = {"_id": ObjectId(alert_id)}
    if user.get("role") != "admin":
        query["user_id"] = user["email"]
    
    result = await db.alerts.delete_one(query)
    
    if result.deleted_count == 0:
        raise HTTPException(404, "Alert not found")
    
    return {"message": "Alert deleted"}
