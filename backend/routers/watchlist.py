from fastapi import APIRouter, Body
from backend.db import get_db
from typing import List

router = APIRouter()

@router.get("")
async def get_watchlist():
    """Get user watchlist"""
    db = get_db()
    watchlist = await db.watchlist.find_one({"_id": "singleton"})
    
    if not watchlist:
        return {"tickers": []}
    
    return {"tickers": watchlist.get("tickers", [])}

@router.post("")
async def add_to_watchlist(data: dict = Body(...)):
    """Add ticker to watchlist"""
    db = get_db()
    ticker = data.get("ticker", "").upper()
    
    if not ticker:
        return {"error": "Ticker required"}, 400
    
    result = await db.watchlist.update_one(
        {"_id": "singleton"},
        {"$addToSet": {"tickers": ticker}, "$set": {"userId": "default"}},
        upsert=True
    )
    
    return {"status": "added", "ticker": ticker}

@router.delete("/{ticker}")
async def remove_from_watchlist(ticker: str):
    """Remove ticker from watchlist"""
    db = get_db()
    ticker = ticker.upper()
    
    await db.watchlist.update_one(
        {"_id": "singleton"},
        {"$pull": {"tickers": ticker}}
    )
    
    return {"status": "removed", "ticker": ticker}
