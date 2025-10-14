from fastapi import APIRouter, Body
from backend.db import get_db
from backend.config import settings
from typing import Dict

router = APIRouter()

@router.get("")
async def get_alerts():
    """Get all active alerts"""
    db = get_db()
    alerts_cursor = db.alerts.find({"status": "active"}).sort("created_at", -1).limit(50)
    alerts = await alerts_cursor.to_list(length=None)
    
    return [
        {
            "id": str(a["_id"]),
            "theme": a["theme"],
            "score": a["score"],
            "positives": a["positives"],
            "created_at": a["created_at"].isoformat(),
            "dont_miss": a.get("dont_miss")
        }
        for a in alerts
    ]

@router.get("/thresholds")
async def get_thresholds():
    """Get current alert thresholds"""
    return {
        "score_threshold": settings.ALERT_SCORE_THRESHOLD,
        "min_positives": 3,
        "half_life_days": settings.HALF_LIFE_DAYS
    }

@router.post("/thresholds")
async def update_thresholds(thresholds: Dict = Body(...)):
    """Update alert thresholds (stub - would need persistence)"""
    return {
        "status": "updated",
        "thresholds": thresholds,
        "note": "Thresholds updated in memory only (restart will reset)"
    }
