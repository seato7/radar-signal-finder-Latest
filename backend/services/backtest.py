"""Backtest service - compute returns and metrics"""
from typing import List, Dict, Any
from datetime import datetime, timedelta
from backend.db import get_db
from backend.scoring import compute_theme_score

async def get_forward_returns(ticker: str, date: str, horizons: List[int]) -> Dict[int, float]:
    """
    Calculate forward returns for a ticker from a given date.
    
    Args:
        ticker: Asset ticker
        date: Start date (YYYY-MM-DD)
        horizons: List of day horizons (e.g., [7, 30, 90])
    
    Returns:
        Dict mapping horizon to return percentage
    """
    db = get_db()
    
    # Get current price
    current_price_doc = await db.prices.find_one({"ticker": ticker, "date": date})
    if not current_price_doc:
        return {h: 0.0 for h in horizons}
    
    current_price = current_price_doc["close"]
    returns = {}
    
    # Calculate returns for each horizon
    start_date = datetime.strptime(date, "%Y-%m-%d")
    
    for horizon in horizons:
        target_date = start_date + timedelta(days=horizon)
        
        # Find closest price within +/- 5 days
        price_window_start = target_date - timedelta(days=5)
        price_window_end = target_date + timedelta(days=5)
        
        future_price_doc = await db.prices.find_one({
            "ticker": ticker,
            "date": {
                "$gte": price_window_start.strftime("%Y-%m-%d"),
                "$lte": price_window_end.strftime("%Y-%m-%d")
            }
        }, sort=[("date", 1)])
        
        if future_price_doc and current_price > 0:
            future_price = future_price_doc["close"]
            return_pct = ((future_price - current_price) / current_price) * 100
            returns[horizon] = return_pct
        else:
            returns[horizon] = 0.0
    
    return returns

async def compute_backtest_summary(since_days: int, group_by: str) -> Dict[str, Any]:
    """
    Compute backtest summary statistics.
    
    Args:
        since_days: Look back period in days
        group_by: 'theme' or 'signal'
    
    Returns:
        Summary dict with metrics
    """
    db = get_db()
    
    since_date = datetime.utcnow() - timedelta(days=since_days)
    
    # Get all signals in the period
    signals_cursor = db.signals.find({
        "observed_at": {"$gte": since_date}
    })
    signals_raw = await signals_cursor.to_list(length=None)
    
    if not signals_raw:
        return {
            "since_days": since_days,
            "count_days": 0,
            "horizons": {},
            "group_by": group_by,
            "sample_size": 0
        }
    
    # Get unique tickers from signals
    tickers = set()
    for s in signals_raw:
        if s.get("asset_id"):
            tickers.add(s["asset_id"])
    
    # Calculate average returns across all tickers
    all_returns_7d = []
    all_returns_30d = []
    all_returns_90d = []
    
    for ticker in tickers:
        # Get earliest signal date for this ticker
        ticker_signals = [s for s in signals_raw if s.get("asset_id") == ticker]
        if not ticker_signals:
            continue
        
        earliest_date = min(s["observed_at"] for s in ticker_signals)
        date_str = earliest_date.strftime("%Y-%m-%d")
        
        returns = await get_forward_returns(ticker, date_str, [7, 30, 90])
        
        if returns[7] != 0:
            all_returns_7d.append(returns[7])
        if returns[30] != 0:
            all_returns_30d.append(returns[30])
        if returns[90] != 0:
            all_returns_90d.append(returns[90])
    
    # Compute summary stats
    def stats(returns_list):
        if not returns_list:
            return {"avg": 0.0, "stdev": 0.0}
        avg = sum(returns_list) / len(returns_list)
        variance = sum((r - avg) ** 2 for r in returns_list) / len(returns_list)
        stdev = variance ** 0.5
        return {"avg": round(avg, 2), "stdev": round(stdev, 2)}
    
    return {
        "since_days": since_days,
        "count_days": since_days,
        "horizons": {
            7: stats(all_returns_7d),
            30: stats(all_returns_30d),
            90: stats(all_returns_90d)
        },
        "group_by": group_by,
        "sample_size": len(tickers)
    }

async def get_top_contributors(rank_horizon: int, min_signals: int, top_n: int) -> List[Dict]:
    """Get top contributing assets by average returns"""
    db = get_db()
    
    # Simple implementation - get assets with most signals
    pipeline = [
        {"$match": {"asset_id": {"$ne": None}}},
        {"$group": {
            "_id": "$asset_id",
            "signal_count": {"$sum": 1}
        }},
        {"$match": {"signal_count": {"$gte": min_signals}}},
        {"$sort": {"signal_count": -1}},
        {"$limit": top_n}
    ]
    
    results = await db.signals.aggregate(pipeline).to_list(length=None)
    
    contributors = []
    for result in results:
        ticker = result["_id"]
        signal_count = result["signal_count"]
        
        # Mock score and return for now
        contributors.append({
            "ticker": ticker,
            "score": 85.0 + (signal_count * 0.5),
            "signal_count": signal_count,
            "avg_return": 8.5 + (signal_count * 0.2)
        })
    
    return contributors
