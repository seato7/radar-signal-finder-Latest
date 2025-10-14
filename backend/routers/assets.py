from fastapi import APIRouter
from backend.db import get_db

router = APIRouter()

@router.get("/{ticker}")
async def get_asset(ticker: str):
    """Get asset details and where to buy info"""
    db = get_db()
    ticker = ticker.upper()
    
    asset = await db.assets.find_one({"ticker": ticker})
    
    if not asset:
        # Return basic info even if not in DB
        asset = {
            "ticker": ticker,
            "exchange": "UNKNOWN",
            "name": ticker,
            "metadata": {}
        }
    
    # Determine where to buy based on exchange
    where_to_buy = get_where_to_buy(asset.get("exchange", "UNKNOWN"))
    
    return {
        "ticker": asset["ticker"],
        "exchange": asset.get("exchange"),
        "name": asset.get("name"),
        "metadata": asset.get("metadata", {}),
        "where_to_buy": where_to_buy
    }

def get_where_to_buy(exchange: str) -> list:
    """Return AU-friendly brokers based on exchange"""
    if exchange in ["NYSE", "NASDAQ", "US"]:
        return [
            {"name": "Stake", "url": "https://stake.com.au", "type": "broker"},
            {"name": "Interactive Brokers", "url": "https://www.interactivebrokers.com.au", "type": "broker"}
        ]
    elif exchange in ["ASX", "AUS"]:
        return [
            {"name": "CommSec", "url": "https://www.commsec.com.au", "type": "broker"},
            {"name": "SelfWealth", "url": "https://www.selfwealth.com.au", "type": "broker"}
        ]
    elif exchange in ["CRYPTO", "BINANCE", "COINBASE"]:
        return [
            {"name": "Binance AU", "url": "https://www.binance.com/en-AU", "type": "exchange"},
            {"name": "Kraken", "url": "https://www.kraken.com", "type": "exchange"},
            {"name": "KuCoin", "url": "https://www.kucoin.com", "type": "exchange"}
        ]
    else:
        return [
            {"name": "Interactive Brokers", "url": "https://www.interactivebrokers.com.au", "type": "broker"}
        ]
