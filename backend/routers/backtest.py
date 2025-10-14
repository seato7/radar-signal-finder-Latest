from fastapi import APIRouter, Query, Response
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
    group_by: str = Query("theme", regex="^(theme|signal)$")
):
    """Get backtest summary with forward returns"""
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
async def backtest_csv(since_days: int = Query(120, ge=1)):
    """Export backtest data as CSV"""
    db = get_db()
    
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
async def backtest_parquet():
    """Export backtest data as Parquet (requires pyarrow)"""
    return {
        "error": "Parquet export requires pyarrow package",
        "note": "Install pyarrow in requirements.txt to enable this endpoint"
    }
