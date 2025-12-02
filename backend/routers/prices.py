"""Price Ingestion API Routes"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional, List
from datetime import datetime, timezone
import asyncio
import logging

from backend.etl.yahoo_prices import fetch_all_prices, YahooPriceFetcher
from backend.services.supabase_sync import SupabaseSync, sync_prices_to_supabase
from backend.metrics import metrics

router = APIRouter()
logger = logging.getLogger(__name__)

# Track ongoing ingestion
_ingestion_lock = asyncio.Lock()
_last_ingestion = {
    "started_at": None,
    "completed_at": None,
    "status": "idle",
    "stats": {}
}


@router.get("/status")
async def get_ingestion_status():
    """Get current price ingestion status"""
    return {
        "status": _last_ingestion["status"],
        "started_at": _last_ingestion["started_at"],
        "completed_at": _last_ingestion["completed_at"],
        "stats": _last_ingestion["stats"]
    }


@router.post("/ingest")
async def trigger_price_ingestion(
    background_tasks: BackgroundTasks,
    asset_class: Optional[str] = Query(None, description="Filter by asset class"),
    test_mode: bool = Query(False, description="Test with 5 tickers only")
):
    """
    Trigger price ingestion from Yahoo Finance to Supabase.
    
    - **asset_class**: Optional filter (stock, crypto, forex, commodity)
    - **test_mode**: If true, only fetch 5 test tickers
    """
    global _last_ingestion
    
    # Check if already running
    if _last_ingestion["status"] == "running":
        return {
            "status": "already_running",
            "started_at": _last_ingestion["started_at"],
            "message": "Ingestion already in progress"
        }
    
    # Start background ingestion
    background_tasks.add_task(
        _run_ingestion,
        asset_class=asset_class,
        test_mode=test_mode
    )
    
    _last_ingestion["status"] = "starting"
    _last_ingestion["started_at"] = datetime.now(timezone.utc).isoformat()
    
    return {
        "status": "started",
        "started_at": _last_ingestion["started_at"],
        "message": "Price ingestion started in background"
    }


async def _run_ingestion(asset_class: Optional[str] = None, test_mode: bool = False):
    """Background task for price ingestion"""
    global _last_ingestion
    
    async with _ingestion_lock:
        _last_ingestion["status"] = "running"
        start_time = datetime.now(timezone.utc)
        
        try:
            async with SupabaseSync() as sync:
                # Fetch assets from Supabase
                logger.info("Fetching assets from Supabase...")
                assets = await sync.get_assets()
                
                if not assets:
                    raise Exception("No assets found in Supabase")
                
                # Filter by asset class if specified
                if asset_class:
                    assets = [a for a in assets if a.get("asset_class") == asset_class]
                
                # Test mode: only 5 tickers
                if test_mode:
                    # Pick diverse test set
                    test_tickers = {"AAPL", "MSFT", "BTC", "ETH", "EUR/USD"}
                    assets = [a for a in assets if a["ticker"] in test_tickers][:5]
                
                total_assets = len(assets)
                logger.info(f"Processing {total_assets} assets...")
                
                # Fetch prices from Yahoo
                prices, fetch_stats = await fetch_all_prices(assets)
                
                logger.info(f"Fetched {len(prices)} prices, syncing to Supabase...")
                
                # Sync to Supabase
                inserted, failed, errors = await sync.upsert_prices(prices)
                
                # Calculate duration
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                
                # Log to Supabase
                await sync.log_ingestion(
                    etl_name="railway-price-ingestion",
                    status="success" if failed == 0 else "partial",
                    rows_inserted=inserted,
                    rows_skipped=failed,
                    duration_seconds=int(duration),
                    source_used="yahoo_finance",
                    metadata={
                        "total_assets": total_assets,
                        "fetch_stats": fetch_stats,
                        "asset_class_filter": asset_class,
                        "test_mode": test_mode
                    }
                )
                
                # Update metrics
                metrics.inc("price_ingestion_runs")
                metrics.set("price_ingestion_success_rate", inserted / max(total_assets, 1))
                
                _last_ingestion["status"] = "completed"
                _last_ingestion["completed_at"] = end_time.isoformat()
                _last_ingestion["stats"] = {
                    "total_assets": total_assets,
                    "prices_fetched": len(prices),
                    "inserted": inserted,
                    "failed": failed,
                    "duration_seconds": duration,
                    "success_rate": inserted / max(total_assets, 1),
                    "fetch_stats": fetch_stats,
                    "errors": errors[:5] if errors else []
                }
                
                logger.info(f"Price ingestion completed: {inserted}/{total_assets} in {duration:.1f}s")
                
        except Exception as e:
            logger.error(f"Price ingestion failed: {str(e)}")
            
            _last_ingestion["status"] = "failed"
            _last_ingestion["completed_at"] = datetime.now(timezone.utc).isoformat()
            _last_ingestion["stats"] = {"error": str(e)}
            
            # Log failure
            try:
                async with SupabaseSync() as sync:
                    await sync.log_ingestion(
                        etl_name="railway-price-ingestion",
                        status="failure",
                        error_message=str(e),
                        source_used="yahoo_finance"
                    )
            except:
                pass


@router.post("/ingest/sync")
async def sync_price_ingestion(
    asset_class: Optional[str] = Query(None),
    test_mode: bool = Query(False)
):
    """
    Synchronous price ingestion - waits for completion.
    Use for testing or when you need immediate results.
    """
    global _last_ingestion
    
    if _last_ingestion["status"] == "running":
        raise HTTPException(409, "Ingestion already in progress")
    
    await _run_ingestion(asset_class=asset_class, test_mode=test_mode)
    
    return {
        "status": _last_ingestion["status"],
        "stats": _last_ingestion["stats"]
    }


@router.get("/test")
async def test_price_fetch():
    """
    Quick test of Yahoo Finance connectivity.
    Fetches prices for 5 test tickers.
    """
    test_assets = [
        {"id": None, "ticker": "AAPL", "asset_class": "stock"},
        {"id": None, "ticker": "MSFT", "asset_class": "stock"},
        {"id": None, "ticker": "BTC", "asset_class": "crypto"},
        {"id": None, "ticker": "ETH", "asset_class": "crypto"},
        {"id": None, "ticker": "EURUSD", "asset_class": "forex"}
    ]
    
    async with YahooPriceFetcher() as fetcher:
        prices, stats = await fetcher.fetch_prices(test_assets)
    
    return {
        "success": len(prices) > 0,
        "prices_fetched": len(prices),
        "stats": stats,
        "prices": prices
    }


@router.get("/coverage")
async def get_price_coverage():
    """Get price coverage statistics from Supabase"""
    async with SupabaseSync() as sync:
        if not sync.is_configured:
            return {"error": "Supabase not configured"}
        
        try:
            # Get total assets
            assets = await sync.get_assets()
            total = len(assets)
            
            # Get prices with recent updates
            response = await sync.session.get(
                f"{sync.url}/rest/v1/prices",
                params={"select": "ticker,updated_at"}
            )
            
            if response.status_code != 200:
                return {"error": f"Failed to fetch prices: {response.status_code}"}
            
            prices = response.json()
            covered = len(set(p["ticker"] for p in prices))
            
            # Group by asset class
            by_class = {}
            for asset in assets:
                ac = asset.get("asset_class", "unknown")
                if ac not in by_class:
                    by_class[ac] = {"total": 0, "covered": 0}
                by_class[ac]["total"] += 1
            
            for price in prices:
                ticker = price["ticker"]
                for asset in assets:
                    if asset["ticker"] == ticker:
                        ac = asset.get("asset_class", "unknown")
                        by_class[ac]["covered"] += 1
                        break
            
            return {
                "total_assets": total,
                "covered": covered,
                "coverage_percent": (covered / total * 100) if total > 0 else 0,
                "by_asset_class": by_class
            }
            
        except Exception as e:
            return {"error": str(e)}
