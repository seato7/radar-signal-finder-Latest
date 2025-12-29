"""
Options Flow Ingestion Router

Receives trigger from Supabase Edge function and runs options chain ETL.
"""
from fastapi import APIRouter, Body
from typing import Optional, List
import logging
import time

from backend.etl.options_chain import run_options_chain_etl

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/options/ingest")
async def ingest_options(
    tickers: Optional[List[str]] = Body(default=None),
    debug: bool = Body(default=False)
):
    """
    Ingest options flow data for specified tickers.
    
    Called by Supabase Edge function ingest-options-flow.
    
    Returns:
        {
            success: bool,
            inserted: int,
            source: str,
            reason?: str,
            details?: dict
        }
    """
    start_time = time.time()
    
    # Default tickers if none provided
    if not tickers:
        tickers = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL']
    
    logger.info(f"📊 Options ingestion started for {len(tickers)} tickers (debug={debug})")
    
    try:
        result = await run_options_chain_etl(tickers=tickers, debug=debug)
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"{'✅' if result['inserted'] > 0 else '⚠️'} Options ingestion completed: "
            f"{result['inserted']} inserted via {result['source']} in {duration_ms}ms"
        )
        
        return {
            "success": True,
            "inserted": result["inserted"],
            "source": result["source"],
            "reason": result.get("reason"),
            "details": {
                **result.get("details", {}),
                "duration_ms": duration_ms,
                "tickers_requested": len(tickers),
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Options ingestion failed: {str(e)}", exc_info=True)
        return {
            "success": False,
            "inserted": 0,
            "source": "railway",
            "reason": f"ETL failed: {str(e)}",
            "details": {
                "error": str(e),
                "duration_ms": int((time.time() - start_time) * 1000),
            }
        }
