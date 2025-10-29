from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator
from backend.db import get_db
import re

router = APIRouter()

class WatchlistAdd(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=10, description="Stock ticker symbol")
    notes: str = Field(default="", max_length=500, description="Optional notes")
    
    @validator('ticker')
    def validate_ticker(cls, v):
        # Ticker must be uppercase letters only
        v = v.upper().strip()
        if not re.match(r'^[A-Z]{1,10}$', v):
            raise ValueError('Ticker must contain only uppercase letters (1-10 characters)')
        return v

@router.get("")
async def get_watchlist():
    """Get user watchlist"""
    db = get_db()
    watchlist = await db.watchlist.find_one({"_id": "singleton"})
    
    if not watchlist:
        return {"tickers": []}
    
    return {"tickers": watchlist.get("tickers", [])}

@router.post("")
async def add_to_watchlist(data: WatchlistAdd):
    """Add ticker to watchlist with validation"""
    db = get_db()
    
    try:
        result = await db.watchlist.update_one(
            {"_id": "singleton"},
            {
                "$addToSet": {"tickers": data.ticker},
                "$set": {"userId": "default"}
            },
            upsert=True
        )
        
        return {"status": "added", "ticker": data.ticker}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to add ticker")

@router.delete("/{ticker}")
async def remove_from_watchlist(ticker: str):
    """Remove ticker from watchlist"""
    db = get_db()
    
    # Validate ticker format
    ticker = ticker.upper().strip()
    if not re.match(r'^[A-Z]{1,10}$', ticker):
        raise HTTPException(status_code=400, detail="Invalid ticker format")
    
    try:
        await db.watchlist.update_one(
            {"_id": "singleton"},
            {"$pull": {"tickers": ticker}}
        )
        
        return {"status": "removed", "ticker": ticker}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to remove ticker")
