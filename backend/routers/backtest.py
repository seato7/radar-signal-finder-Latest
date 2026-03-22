from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timedelta
import io
import csv
from backend.etl.prices_csv import run_prices_etl
from backend.services.backtest import compute_backtest_summary, get_top_contributors
from backend.db import get_db

router = APIRouter()

@router.post("/prices/run")
async def ingest_prices():
    """Ingest price data from configured CSV URLs"""
    result = await run_prices_etl()
    return result

@router.get("/summary")
async def backtest_summary(
    since_days: int = Query(120, ge=1, le=365),
    group_by: str = Query("theme", regex="^(theme|signal)$"),
    user_id: str = Query("default")
):
    """Get backtest summary with forward returns"""
    from backend.services.payments import get_plans
    from backend.db import get_db
    
    # Get user's subscription and enforce backtest limits
    db = get_db()
    subscription = await db.subscriptions.find_one({"user_id": user_id})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    
    max_days = get_plans()[user_plan]["features"]["backtest_days"]
    if max_days != -1 and since_days > max_days:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403,
            detail=f"Your {user_plan} plan allows {max_days}-day backtests. Upgrade for longer horizons."
        )
    
    result = await compute_backtest_summary(since_days, group_by)
    return result

@router.get("/top_contributors")
async def top_contributors(
    rank_horizon: int = Query(7, regex="^(7|30|90)$"),
    min_signals: int = Query(2, ge=1),
    top_n: int = Query(10, ge=1, le=50)
):
    """Get top contributing assets"""
    result = await get_top_contributors(rank_horizon, min_signals, top_n)
    return {"rank_horizon_days": rank_horizon, "min_signals": min_signals, "contributors": result}

@router.get("/rows.csv")
async def backtest_csv(since_days: int = Query(120, ge=1), user_id: str = Query("default")):
    """Export backtest data as CSV"""
    from backend.services.payments import get_plans
    from fastapi import HTTPException
    
    db = get_db()
    
    # Enforce backtest horizon limits
    subscription = await db.subscriptions.find_one({"user_id": user_id})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    
    max_days = get_plans()[user_plan]["features"]["backtest_days"]
    if max_days != -1 and since_days > max_days:
        raise HTTPException(
            status_code=403,
            detail=f"Your {user_plan} plan allows {max_days}-day backtests. Upgrade for longer horizons."
        )
    
    # Get signals and compute rows
    since_date = datetime.utcnow() - timedelta(days=since_days)
    signals_cursor = db.signals.find({"observed_at": {"$gte": since_date}}).limit(1000)
    signals = await signals_cursor.to_list(length=None)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "theme_id", "theme_name", "score", "rank", "ticker", "close", "fwd_7d", "fwd_30d", "fwd_90d", "signal_counts", "positives"])
    
    for signal in signals[:100]:  # Limit for performance
        writer.writerow([
            signal.get("observed_at", datetime.utcnow()).strftime("%Y-%m-%d"),
            signal.get("theme_id", ""),
            "",  # theme_name - would need lookup
            85.0,  # mock score
            1,     # mock rank
            signal.get("asset_id", ""),
            0.0,   # mock close
            8.5,   # mock fwd_7d
            12.3,  # mock fwd_30d
            15.7,  # mock fwd_90d
            1,     # signal_counts
            "PolicyMomentum"  # mock positives
        ])
    
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=backtest.csv"}
    )

@router.get("/rows.parquet")
async def backtest_parquet(since_days: int = Query(120, ge=1), user_id: str = Query("default")):
    """Export backtest data as Parquet"""
    from backend.services.payments import get_plans
    from fastapi import HTTPException
    
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError:
        return {
            "error": "Parquet export requires pyarrow package",
            "note": "Install pyarrow in requirements.txt to enable this endpoint"
        }
    
    db = get_db()
    
    # Check if user's plan allows parquet export
    subscription = await db.subscriptions.find_one({"user_id": user_id})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    
    allowed_exports = get_plans()[user_plan]["features"]["exports"]
    if "parquet" not in allowed_exports:
        raise HTTPException(
            status_code=403,
            detail=f"Parquet export requires Starter plan or higher. Your plan: {user_plan}."
        )
    
    max_days = get_plans()[user_plan]["features"]["backtest_days"]
    if max_days != -1 and since_days > max_days:
        raise HTTPException(
            status_code=403,
            detail=f"Your {user_plan} plan allows {max_days}-day backtests."
        )
    
    # Get signals and compute rows
    since_date = datetime.utcnow() - timedelta(days=since_days)
    signals_cursor = db.signals.find({"observed_at": {"$gte": since_date}}).limit(1000)
    signals = await signals_cursor.to_list(length=None)
    
    # Build data arrays
    dates = []
    theme_ids = []
    theme_names = []
    scores = []
    ranks = []
    tickers = []
    closes = []
    fwd_7ds = []
    fwd_30ds = []
    fwd_90ds = []
    signal_counts = []
    positives_list = []
    
    for signal in signals[:100]:  # Limit for performance
        dates.append(signal.get("observed_at", datetime.utcnow()).strftime("%Y-%m-%d"))
        theme_ids.append(signal.get("theme_id", ""))
        theme_names.append("")  # would need lookup
        scores.append(85.0)
        ranks.append(1)
        tickers.append(signal.get("asset_id", ""))
        closes.append(0.0)
        fwd_7ds.append(8.5)
        fwd_30ds.append(12.3)
        fwd_90ds.append(15.7)
        signal_counts.append(1)
        positives_list.append("PolicyMomentum")
    
    # Create PyArrow table
    table = pa.table({
        "date": dates,
        "theme_id": theme_ids,
        "theme_name": theme_names,
        "score": scores,
        "rank": ranks,
        "ticker": tickers,
        "close": closes,
        "fwd_7d": fwd_7ds,
        "fwd_30d": fwd_30ds,
        "fwd_90d": fwd_90ds,
        "signal_counts": signal_counts,
        "positives": positives_list
    })
    
    # Write to bytes
    output = io.BytesIO()
    pq.write_table(table, output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/x-parquet",
        headers={"Content-Disposition": "attachment; filename=backtest.parquet"}
    )
