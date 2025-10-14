from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse
from datetime import datetime, timedelta
import io
import csv

router = APIRouter()

@router.get("/summary")
async def backtest_summary(
    since_days: int = Query(120, ge=1, le=365),
    group_by: str = Query("theme", regex="^(theme|signal)$")
):
    """Get backtest summary (stub with realistic data)"""
    return {
        "period_days": since_days,
        "group_by": group_by,
        "total_opportunities": 156,
        "hit_rate": 72.3,
        "avg_return": 8.4,
        "best_themes": [
            {"name": "DeFi Expansion", "hit_rate": 78.5, "count": 23},
            {"name": "Layer 2 Scaling", "hit_rate": 74.2, "count": 18},
            {"name": "Institutional Flow", "hit_rate": 71.8, "count": 15}
        ]
    }

@router.get("/top_contributors")
async def top_contributors(
    rank_horizon: int = Query(7, regex="^(7|30|90)$"),
    min_signals: int = Query(2, ge=1),
    top_n: int = Query(10, ge=1, le=50)
):
    """Get top contributing assets"""
    return {
        "rank_horizon_days": rank_horizon,
        "min_signals": min_signals,
        "contributors": [
            {"ticker": "BTC", "score": 94.2, "signal_count": 12, "avg_return": 12.5},
            {"ticker": "ETH", "score": 89.7, "signal_count": 10, "avg_return": 9.8},
            {"ticker": "SOL", "score": 87.4, "signal_count": 8, "avg_return": 15.2}
        ][:top_n]
    }

@router.get("/rows.csv")
async def backtest_csv():
    """Export backtest data as CSV"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "theme", "ticker", "score", "return_7d", "hit"])
    writer.writerow(["2024-01-15", "DeFi", "UNI", "85.3", "8.2", "true"])
    writer.writerow(["2024-01-14", "Layer2", "MATIC", "82.1", "5.7", "true"])
    
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=backtest.csv"}
    )

@router.get("/rows.parquet")
async def backtest_parquet():
    """Export backtest data as Parquet (stub)"""
    return {"error": "Parquet export requires pyarrow - not yet implemented"}
