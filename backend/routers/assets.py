from fastapi import APIRouter
from backend.db import get_db
from backend.services.where_to_buy import get_where_to_buy
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/")
async def get_all_assets(skip: int = 0, limit: int = 100, search: str = None):
    """Get all assets with optional search and pagination"""
    db = get_db()
    
    # Build query
    query = {}
    if search:
        query = {
            "$or": [
                {"ticker": {"$regex": search, "$options": "i"}},
                {"name": {"$regex": search, "$options": "i"}},
                {"exchange": {"$regex": search, "$options": "i"}}
            ]
        }
    
    # Get total count
    total = await db.assets.count_documents(query)
    
    # Get paginated assets
    assets_cursor = db.assets.find(query).sort("ticker", 1).skip(skip).limit(limit)
    assets = await assets_cursor.to_list(length=None)
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "assets": [
            {
                "id": str(a["_id"]),
                "ticker": a["ticker"],
                "exchange": a.get("exchange", "UNKNOWN"),
                "name": a.get("name", a["ticker"]),
            }
            for a in assets
        ]
    }

@router.get("/by-ticker/{ticker}")
async def get_asset_by_ticker(ticker: str):
    """Get asset details by ticker symbol"""
    db = get_db()
    ticker = ticker.upper()
    
    # Get asset
    asset = await db.assets.find_one({"ticker": ticker})
    
    if not asset:
        # Return basic info even if not in DB
        asset = {
            "_id": None,
            "ticker": ticker,
            "exchange": "UNKNOWN",
            "name": ticker,
            "metadata": {}
        }
    
    return await _get_asset_response(asset)

@router.get("/{asset_id}")
async def get_asset(asset_id: str):
    """Get asset details, where to buy info, and recent signals"""
    from bson import ObjectId
    db = get_db()
    
    # Get asset
    try:
        asset = await db.assets.find_one({"_id": ObjectId(asset_id)})
    except Exception:
        asset = None
    
    if not asset:
        return {"error": "Asset not found"}
    
    return await _get_asset_response(asset)

async def _get_asset_response(asset: dict):
    """Helper to build asset response with signals and themes"""
    db = get_db()
    ticker = asset.get("ticker", "")
    
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
