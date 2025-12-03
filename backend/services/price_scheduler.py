"""
Price Scheduler - Twelve Data tiered price ingestion with STRICT rate limiting

CRITICAL CONSTRAINTS (Grow Plan - 55 credits/min):
- Max 20 symbols per request
- Max 50 credits/minute (5 credit buffer)
- Intervals: Crypto 10min, Forex 10min, Stocks 30min, Commodities 30min
- Stagger tiers to avoid overlapping runs
- Use 62+ second gaps between scheduled runs (not 60)
"""
import asyncio
import logging
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
    get_credits_guard,
)
from backend.services.supabase_sync import SupabaseSync

logger = logging.getLogger(__name__)

# Tier intervals (in minutes) - use 62-second based intervals to avoid minute boundary issues
TIER_INTERVALS = {
    "crypto": 10,     # Every 10 minutes
    "forex": 10,      # Every 10 minutes  
    "equity": 30,     # Every 30 minutes
    "stock": 30,      # Alias
    "commodity": 30,  # Every 30 minutes
    "index": 30,
    "etf": 30,
}

# Stagger offsets in MINUTES from start - ensures tiers don't overlap
TIER_STAGGER_OFFSETS = {
    "crypto": 0,      # Starts at :00, :10, :20, :30, :40, :50
    "forex": 3,       # Starts at :03, :13, :23, :33, :43, :53
    "equity": 6,      # Starts at :06, :36
    "commodity": 9,   # Starts at :09, :39
}

# Global scheduler instance
_scheduler: Optional[AsyncIOScheduler] = None

# Stats tracking
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
        "credits_used_last_hour": 0
    }
}

# Track running state per tier - prevents overlap
_running_tiers: Dict[str, bool] = {}

# Tier execution lock - only one tier can run at a time (created lazily)
_tier_execution_lock: Optional[asyncio.Lock] = None


def _get_tier_lock() -> asyncio.Lock:
    """Get or create the tier execution lock (must be called after event loop starts)"""
    global _tier_execution_lock
    if _tier_execution_lock is None:
        _tier_execution_lock = asyncio.Lock()
    return _tier_execution_lock


async def _run_tier_ingestion(asset_class: str, fetch_func):
    """Execute price ingestion for a specific tier with strict rate limiting"""
    global _scheduler_stats, _running_tiers
    
    tier_key = asset_class.lower()
    
    # Check if already running
    if _running_tiers.get(tier_key, False):
        logger.warning(f"⏭️ {asset_class} ingestion still running, skipping this cycle")
        return
    
    # Acquire execution lock - only one tier at a time
    async with _get_tier_lock():
        _running_tiers[tier_key] = True
        start_time = datetime.now(timezone.utc)
        
        # Initialize tier stats
        if tier_key not in _scheduler_stats:
            _scheduler_stats[tier_key] = {
                "total_runs": 0,
                "successful_runs": 0,
                "failed_runs": 0,
                "last_run_at": None,
                "last_success_at": None,
                "total_prices_synced": 0,
                "last_credits_used": 0
            }
        
        _scheduler_stats[tier_key]["total_runs"] += 1
        _scheduler_stats[tier_key]["last_run_at"] = start_time.isoformat()
        _scheduler_stats["global"]["total_runs"] += 1
        _scheduler_stats["global"]["last_run_at"] = start_time.isoformat()
        
        logger.info(f"🚀 Starting {asset_class} price ingestion")
        
        try:
            async with SupabaseSync() as sync:
                if not sync.is_configured:
                    raise Exception("Supabase not configured")
                
                # Get assets for this tier
                all_assets = await sync.get_assets()
                
                if tier_key == "equity":
                    assets = [a for a in all_assets if a.get("asset_class", "").lower() in ("equity", "stock", "etf", "index")]
                else:
                    assets = [a for a in all_assets if a.get("asset_class", "").lower() == tier_key]
                
                if not assets:
                    logger.info(f"📭 No {asset_class} assets found")
                    _running_tiers[tier_key] = False
                    return
                
                logger.info(f"📊 Processing {len(assets)} {asset_class} assets")
                
                # Fetch prices with strict rate limiting
                prices, fetch_stats = await fetch_func(assets)
                
                # Get credits status
                credits_guard = get_credits_guard()
                credits_status = credits_guard.get_status()
                credits_used = fetch_stats.get("total_credits_used", len(assets))
                
                _scheduler_stats[tier_key]["last_credits_used"] = credits_used
                
                # Sync to Supabase
                inserted, failed, errors = await sync.upsert_prices(prices)
                
                # Calculate duration
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                
                # Update stats
                _scheduler_stats[tier_key]["successful_runs"] += 1
                _scheduler_stats[tier_key]["last_success_at"] = end_time.isoformat()
                _scheduler_stats[tier_key]["total_prices_synced"] += inserted
                _scheduler_stats["global"]["successful_runs"] += 1
                _scheduler_stats["global"]["last_success_at"] = end_time.isoformat()
                _scheduler_stats["global"]["total_prices_synced"] += inserted
                
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
                        "credits_used": credits_used,
                        "credits_status": credits_status,
                        "rate_limit_waits": fetch_stats.get("rate_limit_waits", 0)
                    }
                )
                
                logger.info(
                    f"✅ {asset_class} ingestion complete: {inserted}/{len(assets)} prices | "
                    f"Duration: {duration:.1f}s | Credits: {credits_used} | "
                    f"Rate limit waits: {fetch_stats.get('rate_limit_waits', 0)}"
                )
                
        except Exception as e:
            logger.error(f"❌ {asset_class} ingestion failed: {str(e)}")
            _scheduler_stats[tier_key]["failed_runs"] += 1
            _scheduler_stats[tier_key]["last_failure_at"] = datetime.now(timezone.utc).isoformat()
            _scheduler_stats["global"]["failed_runs"] += 1
            _scheduler_stats["global"]["last_failure_at"] = datetime.now(timezone.utc).isoformat()
            _scheduler_stats["global"]["last_error"] = f"{asset_class}: {str(e)}"
            
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


async def ingest_crypto_prices_from_twelvedata():
    """Ingest crypto prices"""
    await _run_tier_ingestion("crypto", fetch_crypto_prices)


async def ingest_forex_prices_from_twelvedata():
    """Ingest forex prices"""
    await _run_tier_ingestion("forex", fetch_forex_prices)


async def ingest_stock_prices_from_twelvedata():
    """Ingest stock prices"""
    await _run_tier_ingestion("equity", fetch_stock_prices)


async def ingest_commodity_prices_from_twelvedata():
    """Ingest commodity prices"""
    await _run_tier_ingestion("commodity", fetch_commodity_prices)


def get_scheduler_stats() -> dict:
    """Get current scheduler statistics"""
    global _scheduler_stats, _scheduler
    
    credits_guard = get_credits_guard()
    
    return {
        **_scheduler_stats,
        "tier_intervals": TIER_INTERVALS,
        "tier_stagger_offsets": TIER_STAGGER_OFFSETS,
        "scheduler_active": _scheduler is not None and _scheduler.running if _scheduler else False,
        "running_tiers": _running_tiers,
        "global_success_rate": (
            _scheduler_stats["global"]["successful_runs"] / _scheduler_stats["global"]["total_runs"] * 100
            if _scheduler_stats["global"]["total_runs"] > 0 else 0
        ),
        "credits_status": credits_guard.get_status(),
        "data_provider": "Twelve Data",
        "rate_limits": {
            "max_credits_per_minute": 50,  # Actual limit 55, using 50 for safety
            "max_symbols_per_batch": 20,
            "min_interval_seconds": 62,
        }
    }


def start_scheduler(custom_intervals: Optional[Dict[str, int]] = None):
    """Start the tiered price scheduler with proper staggering"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return
    
    # Apply custom intervals if provided
    if custom_intervals:
        for tier, interval in custom_intervals.items():
            if tier.lower() in TIER_INTERVALS:
                TIER_INTERVALS[tier.lower()] = interval
                logger.info(f"Custom interval for {tier}: {interval} minutes")
    
    _scheduler = AsyncIOScheduler()
    
    # Map tiers to functions
    TIER_FUNCTIONS = {
        "crypto": ingest_crypto_prices_from_twelvedata,
        "forex": ingest_forex_prices_from_twelvedata,
        "equity": ingest_stock_prices_from_twelvedata,
        "commodity": ingest_commodity_prices_from_twelvedata,
    }
    
    now = datetime.now(timezone.utc)
    
    for tier, func in TIER_FUNCTIONS.items():
        interval_minutes = TIER_INTERVALS.get(tier, 30)
        offset_minutes = TIER_STAGGER_OFFSETS.get(tier, 0)
        
        # Calculate start time with offset
        # Use 2 extra seconds per interval to ensure >60s gaps
        start_time = now.replace(second=2, microsecond=0) + timedelta(minutes=offset_minutes)
        
        _scheduler.add_job(
            func,
            trigger=IntervalTrigger(
                minutes=interval_minutes,
                start_date=start_time
            ),
            id=f"twelvedata_price_{tier}",
            name=f"TwelveData {tier.title()} ({interval_minutes}min, +{offset_minutes}m offset)",
            replace_existing=True,
            max_instances=1,  # Prevent overlap
            coalesce=True     # Skip missed runs
        )
        
        logger.info(
            f"📅 Scheduled {tier} prices: every {interval_minutes}min, "
            f"offset +{offset_minutes}m, starts at {start_time.strftime('%H:%M:%S')}"
        )
    
    _scheduler.start()
    logger.info(f"✅ Twelve Data price scheduler started with {len(TIER_FUNCTIONS)} tiers (strict rate limiting)")


def stop_scheduler():
    """Stop the price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Price scheduler stopped")
    
    _scheduler = None


async def trigger_immediate_run(asset_class: Optional[str] = None):
    """Trigger immediate ingestion (sequential to respect rate limits)"""
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
        # Run all sequentially with delays
        logger.info("🔄 Running all tiers sequentially...")
        await ingest_crypto_prices_from_twelvedata()
        await asyncio.sleep(65)  # >60s gap
        await ingest_forex_prices_from_twelvedata()
        await asyncio.sleep(65)
        await ingest_stock_prices_from_twelvedata()
        await asyncio.sleep(65)
        await ingest_commodity_prices_from_twelvedata()


def get_tier_config() -> Dict[str, int]:
    """Get current tier configuration"""
    return TIER_INTERVALS.copy()


def update_tier_interval(asset_class: str, interval_minutes: int) -> bool:
    """
    Update interval for a specific asset class.
    Note: Requires scheduler restart for changes to take effect.
    """
    asset_class = asset_class.lower()
    if asset_class in TIER_INTERVALS:
        TIER_INTERVALS[asset_class] = interval_minutes
        logger.info(f"Updated {asset_class} interval to {interval_minutes} minutes")
        return True
    return False


def get_credits_used_last_hour() -> int:
    """Get approximate credits used in last hour based on stats"""
    credits_guard = get_credits_guard()
    status = credits_guard.get_status()
    # Return current minute usage as proxy (actual tracking would need more state)
    return status.get("credits_used_this_minute", 0)
