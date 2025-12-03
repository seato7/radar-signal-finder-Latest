"""Price Ingestion API Routes - Twelve Data with Tiered Scheduling"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import asyncio
import logging
import os

from backend.etl.twelvedata_prices import (
    TwelveDataPriceFetcher,
    fetch_all_prices_twelvedata,
)
from backend.services.supabase_sync import SupabaseSync
from backend.services.price_scheduler import (
    start_scheduler,
    stop_scheduler,
    get_scheduler_stats,
    trigger_immediate_run,
    get_tier_config,
    update_tier_interval,
    get_credits_used_last_hour,
    TIER_INTERVALS
)
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

# Track errors for debugging endpoint
_recent_errors: List[Dict] = []


def _log_error(source: str, error: str):
    """Log error for debug endpoint"""
    global _recent_errors
    _recent_errors.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "error": error
    })
    # Keep only last 100 errors
    _recent_errors = _recent_errors[-100:]


# ===================== DEBUG / HEALTH ENDPOINTS =====================

@router.get("/debug/price-ingestion-status")
async def get_price_ingestion_debug_status():
    """
    Debug endpoint showing complete price ingestion health.
    Returns last run times, symbol counts, errors, and credit usage.
    """
    stats = get_scheduler_stats()
    
    # Get recent errors from last hour
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    recent_errors = [
        e for e in _recent_errors 
        if datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")) > cutoff
    ]
    
    return {
        "data_provider": "Twelve Data",
        "scheduler_active": stats.get("scheduler_active", False),
        "tier_intervals": {
            "crypto": "10 minutes",
            "forex": "10 minutes",
            "stocks": "30 minutes",
            "commodities": "30 minutes"
        },
        "last_runs": {
            tier: {
                "last_run_at": data.get("last_run_at"),
                "last_success_at": data.get("last_success_at"),
                "successful_runs": data.get("successful_runs", 0),
                "failed_runs": data.get("failed_runs", 0),
                "total_prices_synced": data.get("total_prices_synced", 0),
                "last_credits_used": data.get("last_credits_used", 0)
            }
            for tier, data in stats.items()
            if tier not in ("global", "tier_intervals", "scheduler_active", "running_tiers", 
                           "global_success_rate", "credits_used_last_hour", "data_provider")
        },
        "global_stats": {
            "total_runs": stats.get("global", {}).get("total_runs", 0),
            "successful_runs": stats.get("global", {}).get("successful_runs", 0),
            "failed_runs": stats.get("global", {}).get("failed_runs", 0),
            "total_prices_synced": stats.get("global", {}).get("total_prices_synced", 0),
            "last_error": stats.get("global", {}).get("last_error"),
            "success_rate": f"{stats.get('global_success_rate', 0):.1f}%"
        },
        "rate_limiting": {
            "credits_used_last_hour": get_credits_used_last_hour(),
            "max_credits_per_minute": 55,
            "credits_remaining_this_minute": 55 - (get_credits_used_last_hour() % 55)
        },
        "errors_last_hour": recent_errors,
        "api_key_configured": bool(os.getenv("TWELVEDATA_API_KEY"))
    }


# ===================== SCHEDULER ENDPOINTS =====================

@router.post("/scheduler/start")
async def start_price_scheduler(
    custom_intervals: Optional[Dict[str, int]] = None
):
    """
    Start the Twelve Data tiered price scheduler.
    
    Default intervals:
    - crypto: 10 minutes
    - forex: 10 minutes
    - stocks/equity: 30 minutes
    - commodities: 30 minutes
    
    Pass custom_intervals to override, e.g. {"crypto": 5, "forex": 5}
    """
    try:
        start_scheduler(custom_intervals)
        return {
            "status": "started",
            "tier_intervals": get_tier_config(),
            "data_provider": "Twelve Data",
            "message": "Twelve Data tiered scheduler started successfully"
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to start scheduler: {str(e)}")


@router.post("/scheduler/stop")
async def stop_price_scheduler():
    """Stop the tiered price scheduler"""
    try:
        stop_scheduler()
        return {"status": "stopped", "message": "Scheduler stopped"}
    except Exception as e:
        raise HTTPException(500, f"Failed to stop scheduler: {str(e)}")


@router.get("/scheduler/status")
async def get_scheduler_status():
    """Get detailed scheduler status and stats per tier"""
    return get_scheduler_stats()


@router.get("/scheduler/tiers")
async def get_tier_intervals():
    """Get current tier configuration"""
    return {
        "tiers": get_tier_config(),
        "description": {
            "crypto": "High frequency - every 10 minutes",
            "forex": "High frequency - every 10 minutes",
            "equity": "Standard - every 30 minutes",
            "stock": "Standard - every 30 minutes (alias for equity)",
            "commodity": "Standard - every 30 minutes"
        },
        "data_provider": "Twelve Data",
        "rate_limit": "55 API credits per minute"
    }


@router.put("/scheduler/tier/{asset_class}")
async def update_tier(
    asset_class: str,
    interval_minutes: int = Query(..., ge=5, le=60, description="Interval in minutes (5-60)")
):
    """Update interval for a specific asset class tier (5-60 minutes)"""
    if update_tier_interval(asset_class, interval_minutes):
        return {
            "status": "updated",
            "asset_class": asset_class,
            "new_interval": interval_minutes,
            "note": "Restart scheduler for changes to take effect"
        }
    raise HTTPException(404, f"Unknown asset class: {asset_class}")


@router.post("/scheduler/trigger")
async def trigger_scheduler_run(
    asset_class: Optional[str] = Query(None, description="Specific tier to run, or all if empty")
):
    """Trigger an immediate run of the scheduler (specific tier or all)"""
    try:
        await trigger_immediate_run(asset_class)
        return {
            "status": "triggered",
            "asset_class": asset_class or "all",
            "data_provider": "Twelve Data",
            "message": f"Immediate ingestion triggered for {asset_class or 'all tiers'}"
        }
    except Exception as e:
        _log_error("trigger_scheduler_run", str(e))
        raise HTTPException(500, f"Trigger failed: {str(e)}")


# ===================== MANUAL INGESTION ENDPOINTS =====================

@router.get("/status")
async def get_ingestion_status():
    """Get current price ingestion status"""
    return {
        "status": _last_ingestion["status"],
        "started_at": _last_ingestion["started_at"],
        "completed_at": _last_ingestion["completed_at"],
        "stats": _last_ingestion["stats"],
        "data_provider": "Twelve Data"
    }


@router.post("/ingest")
async def trigger_price_ingestion(
    background_tasks: BackgroundTasks,
    asset_class: Optional[str] = Query(None, description="Filter by asset class"),
    test_mode: bool = Query(False, description="Test with 5 tickers only")
):
    """
    Trigger manual price ingestion from Twelve Data to Supabase.
    For automated updates, use /scheduler/start instead.
    """
    global _last_ingestion
    
    if _last_ingestion["status"] == "running":
        return {
            "status": "already_running",
            "started_at": _last_ingestion["started_at"],
            "message": "Ingestion already in progress"
        }
    
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
        "data_provider": "Twelve Data",
        "message": "Price ingestion started in background"
    }


async def _run_ingestion(asset_class: Optional[str] = None, test_mode: bool = False):
    """Background task for price ingestion using Twelve Data"""
    global _last_ingestion
    
    async with _ingestion_lock:
        _last_ingestion["status"] = "running"
        start_time = datetime.now(timezone.utc)
        
        try:
            async with SupabaseSync() as sync:
                logger.info("Fetching assets from Supabase...")
                assets = await sync.get_assets()
                
                if not assets:
                    raise Exception("No assets found in Supabase")
                
                if asset_class:
                    assets = [a for a in assets if a.get("asset_class") == asset_class]
                
                if test_mode:
                    test_tickers = {"AAPL", "MSFT", "BTC", "ETH", "EUR/USD"}
                    assets = [a for a in assets if a["ticker"] in test_tickers][:5]
                
                total_assets = len(assets)
                logger.info(f"Processing {total_assets} assets via Twelve Data...")
                
                prices, fetch_stats = await fetch_all_prices_twelvedata(assets)
                
                logger.info(f"Fetched {len(prices)} prices, syncing to Supabase...")
                
                inserted, failed, errors = await sync.upsert_prices(prices)
                
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                
                await sync.log_ingestion(
                    etl_name="twelvedata-price-ingestion",
                    status="success" if failed == 0 else "partial",
                    rows_inserted=inserted,
                    rows_skipped=failed,
                    duration_seconds=int(duration),
                    source_used="twelvedata",
                    metadata={
                        "total_assets": total_assets,
                        "fetch_stats": fetch_stats,
                        "asset_class_filter": asset_class,
                        "test_mode": test_mode
                    }
                )
                
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
                    "errors": errors[:5] if errors else [],
                    "data_provider": "Twelve Data"
                }
                
                logger.info(f"Twelve Data price ingestion completed: {inserted}/{total_assets} in {duration:.1f}s")
                
        except Exception as e:
            logger.error(f"Price ingestion failed: {str(e)}")
            _log_error("_run_ingestion", str(e))
            
            _last_ingestion["status"] = "failed"
            _last_ingestion["completed_at"] = datetime.now(timezone.utc).isoformat()
            _last_ingestion["stats"] = {"error": str(e)}
            
            try:
                async with SupabaseSync() as sync:
                    await sync.log_ingestion(
                        etl_name="twelvedata-price-ingestion",
                        status="failure",
                        error_message=str(e),
                        source_used="twelvedata"
                    )
            except:
                pass


@router.post("/ingest/sync")
async def sync_price_ingestion(
    asset_class: Optional[str] = Query(None),
    test_mode: bool = Query(False)
):
    """Synchronous price ingestion - waits for completion."""
    global _last_ingestion
    
    if _last_ingestion["status"] == "running":
        raise HTTPException(409, "Ingestion already in progress")
    
    await _run_ingestion(asset_class=asset_class, test_mode=test_mode)
    
    return {
        "status": _last_ingestion["status"],
        "stats": _last_ingestion["stats"],
        "data_provider": "Twelve Data"
    }


# ===================== TEST & COVERAGE ENDPOINTS =====================

@router.get("/test")
async def test_price_fetch():
    """Quick test of Twelve Data connectivity."""
    if not os.getenv("TWELVEDATA_API_KEY"):
        return {
            "success": False,
            "error": "TWELVEDATA_API_KEY not configured",
            "message": "Please set the TWELVEDATA_API_KEY environment variable"
        }
    
    test_assets = [
        {"id": None, "ticker": "AAPL", "asset_class": "stock"},
        {"id": None, "ticker": "MSFT", "asset_class": "stock"},
        {"id": None, "ticker": "BTC", "asset_class": "crypto"},
        {"id": None, "ticker": "ETH", "asset_class": "crypto"},
        {"id": None, "ticker": "EUR/USD", "asset_class": "forex"}
    ]
    
    try:
        async with TwelveDataPriceFetcher() as fetcher:
            prices, stats = await fetcher.fetch_prices_for_class(test_assets[:2], "stock")
            crypto_prices, _ = await fetcher.fetch_prices_for_class(test_assets[2:4], "crypto")
            forex_prices, _ = await fetcher.fetch_prices_for_class(test_assets[4:], "forex")
            
            all_prices = prices + crypto_prices + forex_prices
            credits_status = fetcher.get_credits_status()
        
        return {
            "success": len(all_prices) > 0,
            "prices_fetched": len(all_prices),
            "data_provider": "Twelve Data",
            "credits_status": credits_status,
            "stats": stats,
            "prices": all_prices
        }
    except Exception as e:
        _log_error("test_price_fetch", str(e))
        return {
            "success": False,
            "error": str(e),
            "data_provider": "Twelve Data"
        }


@router.get("/coverage")
async def get_price_coverage():
    """Get price coverage statistics from Supabase"""
    async with SupabaseSync() as sync:
        if not sync.is_configured:
            return {"error": "Supabase not configured"}
        
        try:
            assets = await sync.get_assets()
            total = len(assets)
            
            response = await sync.session.get(
                f"{sync.url}/rest/v1/prices",
                params={"select": "ticker,updated_at"}
            )
            
            if response.status_code != 200:
                return {"error": f"Failed to fetch prices: {response.status_code}"}
            
            prices = response.json()
            covered = len(set(p["ticker"] for p in prices))
            
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
                "by_asset_class": by_class,
                "data_provider": "Twelve Data",
                "refresh_intervals": {
                    "crypto": "10 minutes",
                    "forex": "10 minutes",
                    "stocks": "30 minutes",
                    "commodities": "30 minutes"
                }
            }
            
        except Exception as e:
            _log_error("get_price_coverage", str(e))
            return {"error": str(e)}
