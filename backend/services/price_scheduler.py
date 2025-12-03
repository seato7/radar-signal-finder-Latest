"""Price Scheduler - Tiered automated price ingestion by asset class"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.etl.yahoo_prices import fetch_all_prices
from backend.services.supabase_sync import SupabaseSync

logger = logging.getLogger(__name__)

# Tiered intervals by asset class (in minutes)
# Increased to account for Yahoo rate limiting and large asset counts
# Crypto: 171 assets, ~3min per batch with rate limits
# Forex: 87 assets, ~2min per batch with rate limits
TIER_INTERVALS = {
    "crypto": 5,      # Every 5 minutes (was 2, too fast with 171 assets)
    "forex": 5,       # Every 5 minutes (was 3, too fast with 87 assets)
    "equity": 10,     # Every 10 minutes
    "commodity": 10,  # Every 10 minutes
    "index": 10,      # Every 10 minutes
    "etf": 10,        # Every 10 minutes
}

DEFAULT_INTERVAL_MINUTES = 5

# Global scheduler instance
_scheduler: Optional[AsyncIOScheduler] = None

# Stats tracking per tier
_scheduler_stats: Dict[str, dict] = {
    "global": {
        "total_runs": 0,
        "successful_runs": 0,
        "failed_runs": 0,
        "last_run_at": None,
        "last_success_at": None,
        "last_failure_at": None,
        "last_error": None,
        "total_prices_synced": 0,
        "average_duration_seconds": 0
    }
}

# Track running state per tier
_running_tiers: Dict[str, bool] = {}


async def run_tiered_ingestion(asset_class: str):
    """Execute a scheduled price ingestion for a specific asset class tier"""
    global _scheduler_stats, _running_tiers
    
    tier_key = asset_class.lower()
    
    if _running_tiers.get(tier_key, False):
        logger.warning(f"Previous {asset_class} ingestion still running, skipping")
        return
    
    _running_tiers[tier_key] = True
    start_time = datetime.now(timezone.utc)
    
    # Initialize tier stats if needed
    if tier_key not in _scheduler_stats:
        _scheduler_stats[tier_key] = {
            "total_runs": 0,
            "successful_runs": 0,
            "failed_runs": 0,
            "last_run_at": None,
            "last_success_at": None,
            "total_prices_synced": 0,
            "average_duration_seconds": 0
        }
    
    _scheduler_stats[tier_key]["total_runs"] += 1
    _scheduler_stats[tier_key]["last_run_at"] = start_time.isoformat()
    _scheduler_stats["global"]["total_runs"] += 1
    _scheduler_stats["global"]["last_run_at"] = start_time.isoformat()
    
    try:
        async with SupabaseSync() as sync:
            if not sync.is_configured:
                raise Exception("Supabase not configured")
            
            # Get assets filtered by asset class
            all_assets = await sync.get_assets()
            assets = [a for a in all_assets if a.get("asset_class", "").lower() == tier_key]
            
            if not assets:
                logger.info(f"No {asset_class} assets found to process")
                return
            
            logger.info(f"Starting {asset_class} ingestion for {len(assets)} assets")
            
            # Fetch prices
            prices, fetch_stats = await fetch_all_prices(assets)
            
            # Sync to Supabase
            inserted, failed, errors = await sync.upsert_prices(prices)
            
            # Calculate duration
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()
            
            # Update tier stats
            _scheduler_stats[tier_key]["successful_runs"] += 1
            _scheduler_stats[tier_key]["last_success_at"] = end_time.isoformat()
            _scheduler_stats[tier_key]["total_prices_synced"] += inserted
            _scheduler_stats["global"]["successful_runs"] += 1
            _scheduler_stats["global"]["last_success_at"] = end_time.isoformat()
            _scheduler_stats["global"]["total_prices_synced"] += inserted
            
            # Calculate running average duration
            total_runs = _scheduler_stats[tier_key]["total_runs"]
            avg_duration = _scheduler_stats[tier_key]["average_duration_seconds"]
            _scheduler_stats[tier_key]["average_duration_seconds"] = (
                (avg_duration * (total_runs - 1) + duration) / total_runs
            )
            
            # Log to Supabase
            await sync.log_ingestion(
                etl_name=f"railway-price-{tier_key}",
                status="success",
                rows_inserted=inserted,
                rows_skipped=failed,
                duration_seconds=int(duration),
                source_used="yahoo_finance",
                metadata={
                    "asset_class": asset_class,
                    "total_assets": len(assets),
                    "fetch_stats": fetch_stats,
                    "tier_interval_minutes": TIER_INTERVALS.get(tier_key, DEFAULT_INTERVAL_MINUTES)
                }
            )
            
            logger.info(
                f"{asset_class} ingestion completed: {inserted}/{len(assets)} prices "
                f"in {duration:.1f}s (interval: {TIER_INTERVALS.get(tier_key, DEFAULT_INTERVAL_MINUTES)}min)"
            )
            
    except Exception as e:
        logger.error(f"{asset_class} ingestion failed: {str(e)}")
        _scheduler_stats[tier_key]["failed_runs"] += 1
        _scheduler_stats[tier_key]["last_failure_at"] = datetime.now(timezone.utc).isoformat()
        _scheduler_stats["global"]["failed_runs"] += 1
        _scheduler_stats["global"]["last_failure_at"] = datetime.now(timezone.utc).isoformat()
        _scheduler_stats["global"]["last_error"] = f"{asset_class}: {str(e)}"
        
        # Try to log failure
        try:
            async with SupabaseSync() as sync:
                await sync.log_ingestion(
                    etl_name=f"railway-price-{tier_key}",
                    status="failure",
                    error_message=str(e),
                    source_used="yahoo_finance"
                )
        except:
            pass
    finally:
        _running_tiers[tier_key] = False


def get_scheduler_stats() -> dict:
    """Get current scheduler statistics"""
    global _scheduler_stats, _scheduler
    
    return {
        **_scheduler_stats,
        "tier_intervals": TIER_INTERVALS,
        "scheduler_active": _scheduler is not None and _scheduler.running if _scheduler else False,
        "running_tiers": _running_tiers,
        "global_success_rate": (
            _scheduler_stats["global"]["successful_runs"] / _scheduler_stats["global"]["total_runs"] * 100
            if _scheduler_stats["global"]["total_runs"] > 0 else 0
        )
    }


def start_scheduler(custom_intervals: Optional[Dict[str, int]] = None):
    """Start the tiered price scheduler"""
    global _scheduler, TIER_INTERVALS
    
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return
    
    # Apply custom intervals if provided
    if custom_intervals:
        TIER_INTERVALS.update(custom_intervals)
    
    _scheduler = AsyncIOScheduler()
    
    # Create a job for each tier
    for asset_class, interval_minutes in TIER_INTERVALS.items():
        _scheduler.add_job(
            run_tiered_ingestion,
            trigger=IntervalTrigger(minutes=interval_minutes),
            args=[asset_class],
            id=f"price_ingestion_{asset_class}",
            name=f"{asset_class.title()} Price Ingestion ({interval_minutes}min)",
            replace_existing=True,
            max_instances=1
        )
        logger.info(f"Scheduled {asset_class} prices every {interval_minutes} minutes")
    
    _scheduler.start()
    logger.info(f"Tiered price scheduler started with {len(TIER_INTERVALS)} tiers")


def stop_scheduler():
    """Stop the price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Price scheduler stopped")
    
    _scheduler = None


async def trigger_immediate_run(asset_class: Optional[str] = None):
    """Trigger an immediate ingestion run for specific tier or all"""
    if asset_class:
        await run_tiered_ingestion(asset_class)
    else:
        # Run all tiers concurrently
        await asyncio.gather(*[
            run_tiered_ingestion(ac) for ac in TIER_INTERVALS.keys()
        ])


def get_tier_config() -> Dict[str, int]:
    """Get current tier configuration"""
    return TIER_INTERVALS.copy()


def update_tier_interval(asset_class: str, interval_minutes: int):
    """Update interval for a specific tier (requires scheduler restart)"""
    global TIER_INTERVALS
    if asset_class.lower() in TIER_INTERVALS:
        TIER_INTERVALS[asset_class.lower()] = interval_minutes
        logger.info(f"Updated {asset_class} interval to {interval_minutes} minutes")
        return True
    return False
