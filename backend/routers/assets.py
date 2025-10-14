from fastapi import APIRouter
from backend.db import get_db
from backend.services.where_to_buy import get_where_to_buy
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/{ticker}")
async def get_asset(ticker: str):
    """Get asset details, where to buy info, and recent signals"""
    db = get_db()
    ticker = ticker.upper()
    
    # Get asset
    asset = await db.assets.find_one({"ticker": ticker})
    
    if not asset:
        # Return basic info even if not in DB
        asset = {
            "ticker": ticker,
            "exchange": "UNKNOWN",
            "name": ticker,
            "metadata": {}
        }
    
    # Get where to buy
    where_to_buy = get_where_to_buy(asset.get("exchange", "UNKNOWN"), ticker)
    
    # Get recent signals (last 30 days)
    since = datetime.utcnow() - timedelta(days=30)
    signals_cursor = db.signals.find({
        "value_text": {"$regex": ticker, "$options": "i"},
        "observed_at": {"$gte": since}
    }).sort("observed_at", -1).limit(10)
    signals = await signals_cursor.to_list(length=None)
    
    # Get associated themes
    theme_ids = list(set(s.get("theme_id") for s in signals if s.get("theme_id")))
    themes = []
    if theme_ids:
        themes_cursor = db.themes.find({"_id": {"$in": theme_ids}})
        themes = await themes_cursor.to_list(length=None)
    
    return {
        "ticker": asset["ticker"],
        "exchange": asset.get("exchange"),
        "name": asset.get("name"),
        "metadata": asset.get("metadata", {}),
        "where_to_buy": where_to_buy,
        "signals": [
            {
                "id": str(s["_id"]),
                "type": s["signal_type"],
                "observed_at": s["observed_at"].isoformat(),
                "citation": s.get("oa_citation")
            }
            for s in signals
        ],
        "themes": [
            {"id": str(t["_id"]), "name": t["name"]}
            for t in themes
        ]
    }
