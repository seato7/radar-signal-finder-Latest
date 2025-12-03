"""Price Scheduler - Twelve Data tiered price ingestion with rate limiting"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.config import settings
from backend.etl.twelvedata_prices import (
    fetch_crypto_prices,
    fetch_forex_prices,
    fetch_stock_prices,
    fetch_commodity_prices,
    TwelveDataPriceFetcher,
)
from backend.services.supabase_sync import SupabaseSync

logger = logging.getLogger(__name__)

# Read intervals from env vars (with defaults matching spec)
# Crypto: 171 assets @ 10 min = ~17 credits per run
# Forex: 87 assets @ 10 min = ~9 credits per run
# Stocks: 731 assets @ 30 min = ~24 credits per run (distributed)
# Commodities: 54 assets @ 30 min = ~2 credits per run
TIER_INTERVALS = {
    "crypto": settings.TD_REFRESH_CRYPTO_MINUTES,     # Default: 10 min
    "forex": settings.TD_REFRESH_FOREX_MINUTES,       # Default: 10 min
    "equity": settings.TD_REFRESH_STOCK_MINUTES,      # Default: 30 min
    "stock": settings.TD_REFRESH_STOCK_MINUTES,       # Alias for equity
    "commodity": settings.TD_REFRESH_COMMODITY_MINUTES,  # Default: 30 min
    "index": settings.TD_REFRESH_STOCK_MINUTES,       # Same as stocks
    "etf": settings.TD_REFRESH_STOCK_MINUTES,         # Same as stocks
}

DEFAULT_INTERVAL_MINUTES = 30

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
        "average_duration_seconds": 0,
        "credits_used_last_hour": 0
    }
}

# Track running state per tier
_running_tiers: Dict[str, bool] = {}

# Credit usage tracking
_credits_log: List[Dict] = []


def _log_credit_usage(asset_class: str, credits_used: int):
    """Log credit usage for monitoring"""
    global _credits_log
    _credits_log.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "asset_class": asset_class,
        "credits_used": credits_used
    })
    # Keep only last hour of logs
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    _credits_log = [
        log for log in _credits_log 
        if datetime.fromisoformat(log["timestamp"].replace("Z", "+00:00")) > cutoff
    ]


def get_credits_used_last_hour() -> int:
    """Get total credits used in the last hour"""
    return sum(log["credits_used"] for log in _credits_log)


async def ingest_crypto_prices_from_twelvedata():
    """Ingest crypto prices from Twelve Data"""
    await _run_tier_ingestion("crypto", fetch_crypto_prices)


async def ingest_forex_prices_from_twelvedata():
    """Ingest forex prices from Twelve Data"""
    await _run_tier_ingestion("forex", fetch_forex_prices)


async def ingest_stock_prices_from_twelvedata():
    """Ingest stock prices from Twelve Data"""
    await _run_tier_ingestion("equity", fetch_stock_prices)


async def ingest_commodity_prices_from_twelvedata():
    """Ingest commodity prices from Twelve Data"""
    await _run_tier_ingestion("commodity", fetch_commodity_prices)


async def _run_tier_ingestion(asset_class: str, fetch_func):
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
            "average_duration_seconds": 0,
            "last_credits_used": 0
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
            
            # Handle asset class aliases
            if tier_key == "equity":
                assets = [a for a in all_assets if a.get("asset_class", "").lower() in ("equity", "stock", "etf", "index")]
            else:
                assets = [a for a in all_assets if a.get("asset_class", "").lower() == tier_key]
            
            if not assets:
                logger.info(f"No {asset_class} assets found to process")
                _running_tiers[tier_key] = False
                return
            
            logger.info(f"Starting Twelve Data {asset_class} ingestion for {len(assets)} assets")
            
            # Fetch prices using Twelve Data
            prices, fetch_stats = await fetch_func(assets)
            
            # Log credit usage
            credits_used = len(assets)  # 1 credit per symbol
            _log_credit_usage(asset_class, credits_used)
            _scheduler_stats[tier_key]["last_credits_used"] = credits_used
            
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
            _scheduler_stats["global"]["credits_used_last_hour"] = get_credits_used_last_hour()
            
            # Calculate running average duration
            total_runs = _scheduler_stats[tier_key]["total_runs"]
            avg_duration = _scheduler_stats[tier_key]["average_duration_seconds"]
            _scheduler_stats[tier_key]["average_duration_seconds"] = (
                (avg_duration * (total_runs - 1) + duration) / total_runs
            )
            
            # Log to Supabase
            await sync.log_ingestion(
                etl_name=f"twelvedata-price-{tier_key}",
                status="success",
                rows_inserted=inserted,
                rows_skipped=failed,
                duration_seconds=int(duration),
                source_used="twelvedata",
                metadata={
                    "asset_class": asset_class,
                    "total_assets": len(assets),
                    "fetch_stats": fetch_stats,
                    "tier_interval_minutes": TIER_INTERVALS.get(tier_key, DEFAULT_INTERVAL_MINUTES),
                    "credits_used": credits_used
                }
            )
            
            logger.info(
                f"Twelve Data {asset_class} ingestion completed: {inserted}/{len(assets)} prices "
                f"in {duration:.1f}s (credits: {credits_used})"
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
                    etl_name=f"twelvedata-price-{tier_key}",
                    status="failure",
                    error_message=str(e),
                    source_used="twelvedata"
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
        ),
        "credits_used_last_hour": get_credits_used_last_hour(),
        "max_credits_per_minute": settings.TD_MAX_CREDITS_PER_MINUTE,
        "data_provider": "Twelve Data",
        "config": {
            "TD_REFRESH_CRYPTO_MINUTES": settings.TD_REFRESH_CRYPTO_MINUTES,
            "TD_REFRESH_FOREX_MINUTES": settings.TD_REFRESH_FOREX_MINUTES,
            "TD_REFRESH_STOCK_MINUTES": settings.TD_REFRESH_STOCK_MINUTES,
            "TD_REFRESH_COMMODITY_MINUTES": settings.TD_REFRESH_COMMODITY_MINUTES,
            "TD_MAX_CREDITS_PER_MINUTE": settings.TD_MAX_CREDITS_PER_MINUTE,
            "TD_MAX_SYMBOLS_PER_BATCH": settings.TD_MAX_SYMBOLS_PER_BATCH,
        }
    }


def start_scheduler(custom_intervals: Optional[Dict[str, int]] = None):
    """Start the tiered price scheduler with staggered start times"""
    global _scheduler, TIER_INTERVALS
    
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return
    
    # Apply custom intervals if provided (overrides env vars)
    if custom_intervals:
        TIER_INTERVALS.update(custom_intervals)
    
    _scheduler = AsyncIOScheduler()
    
    # Stagger start times to distribute API calls
    # Crypto and Forex run every 10 min, stocks/commodities every 30 min
    STAGGER_OFFSETS = {
        "crypto": 0,      # Starts immediately
        "forex": 5,       # Starts 5 min after crypto
        "equity": 2,      # Starts 2 min after crypto  
        "commodity": 7,   # Starts 7 min after crypto
    }
    
    now = datetime.now(timezone.utc)
    
    # Map asset classes to their ingestion functions
    INGESTION_FUNCTIONS = {
        "crypto": ingest_crypto_prices_from_twelvedata,
        "forex": ingest_forex_prices_from_twelvedata,
        "equity": ingest_stock_prices_from_twelvedata,
        "commodity": ingest_commodity_prices_from_twelvedata,
    }
    
    # Create a job for each tier with staggered start times
    for asset_class, ingestion_func in INGESTION_FUNCTIONS.items():
        interval_minutes = TIER_INTERVALS.get(asset_class, DEFAULT_INTERVAL_MINUTES)
        offset_minutes = STAGGER_OFFSETS.get(asset_class, 0)
        start_time = now.replace(second=0, microsecond=0) + timedelta(minutes=offset_minutes)
        
        _scheduler.add_job(
            ingestion_func,
            trigger=IntervalTrigger(minutes=interval_minutes, start_date=start_time),
            id=f"twelvedata_price_{asset_class}",
            name=f"Twelve Data {asset_class.title()} Prices ({interval_minutes}min, offset +{offset_minutes}m)",
            replace_existing=True,
            max_instances=1,
            coalesce=True
        )
        logger.info(f"Scheduled Twelve Data {asset_class} prices every {interval_minutes} min (starts at +{offset_minutes}m)")
    
    _scheduler.start()
    logger.info(f"Twelve Data price scheduler started with {len(INGESTION_FUNCTIONS)} tiers (staggered)")


def stop_scheduler():
    """Stop the price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Price scheduler stopped")
    
    _scheduler = None


async def trigger_immediate_run(asset_class: Optional[str] = None):
    """Trigger an immediate ingestion run for specific tier or all (sequentially to respect rate limits)"""
    if asset_class:
        asset_class = asset_class.lower()
        if asset_class == "crypto":
            await ingest_crypto_prices_from_twelvedata()
        elif asset_class == "forex":
            await ingest_forex_prices_from_twelvedata()
        elif asset_class in ("equity", "stock"):
            await ingest_stock_prices_from_twelvedata()
        elif asset_class == "commodity":
            await ingest_commodity_prices_from_twelvedata()
        else:
            raise ValueError(f"Unknown asset class: {asset_class}")
    else:
        # Run all tiers sequentially with delay to respect rate limits
        await ingest_crypto_prices_from_twelvedata()
        await asyncio.sleep(30)  # 30s delay between tiers
        await ingest_forex_prices_from_twelvedata()
        await asyncio.sleep(30)
        await ingest_stock_prices_from_twelvedata()
        await asyncio.sleep(30)
        await ingest_commodity_prices_from_twelvedata()


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
