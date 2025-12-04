"""
Price Scheduler - SINGLE SERIAL QUEUE for all assets

Processes ALL 1043 assets in a single queue:
- 40 symbols per minute (2 batches of 20)
- Full cycle: ~26 minutes
- Zero race conditions - one batch at a time
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.config import settings
from backend.etl.twelvedata_prices import TwelveDataPriceFetcher
from backend.services.supabase_sync import SupabaseSync

logger = logging.getLogger(__name__)

# Configuration
BATCH_SIZE = 20          # Max symbols per API call
BATCHES_PER_MINUTE = 2   # 2 batches = 40 credits/min (under 55 limit)
CYCLE_INTERVAL_SECONDS = 60  # Run once per minute

# Global scheduler instance
_scheduler: Optional[AsyncIOScheduler] = None

# Stats tracking
_scheduler_stats: Dict = {
    "total_runs": 0,
    "successful_runs": 0,
    "failed_runs": 0,
    "last_run_at": None,
    "last_success_at": None,
    "last_error": None,
    "total_prices_synced": 0,
    "current_offset": 0,
    "total_assets": 0,
    "cycle_progress_pct": 0,
    "estimated_cycle_minutes": 0,
}

# Track if currently running
_is_running = False

# Execution lock
_execution_lock: Optional[asyncio.Lock] = None


def _get_lock() -> asyncio.Lock:
    """Get or create execution lock"""
    global _execution_lock
    if _execution_lock is None:
        _execution_lock = asyncio.Lock()
    return _execution_lock


async def _run_price_batch():
    """
    Process the next batch of assets in the global queue.
    Called once per minute, processes 2 batches (40 symbols).
    """
    global _scheduler_stats, _is_running
    
    if _is_running:
        logger.warning("⏭️ Previous batch still running, skipping")
        return
    
    async with _get_lock():
        _is_running = True
        start_time = datetime.now(timezone.utc)
        _scheduler_stats["total_runs"] += 1
        _scheduler_stats["last_run_at"] = start_time.isoformat()
        
        try:
            async with SupabaseSync() as sync:
                if not sync.is_configured:
                    raise Exception("Supabase not configured")
                
                # Get ALL assets (sorted for consistent ordering)
                all_assets = await sync.get_assets()
                all_assets.sort(key=lambda x: (x.get("asset_class", ""), x.get("ticker", "")))
                
                total_assets = len(all_assets)
                _scheduler_stats["total_assets"] = total_assets
                
                if total_assets == 0:
                    logger.info("📭 No assets found")
                    _is_running = False
                    return
                
                # Calculate current position
                current_offset = _scheduler_stats["current_offset"]
                
                # Reset if we've completed a cycle
                if current_offset >= total_assets:
                    current_offset = 0
                    _scheduler_stats["current_offset"] = 0
                    logger.info("🔄 Starting new price cycle")
                
                # Calculate how many symbols to process this run (2 batches = 40 symbols)
                symbols_this_run = min(BATCH_SIZE * BATCHES_PER_MINUTE, total_assets - current_offset)
                end_offset = current_offset + symbols_this_run
                
                batch_assets = all_assets[current_offset:end_offset]
                
                cycle_progress = (current_offset / total_assets) * 100 if total_assets > 0 else 0
                estimated_cycle_minutes = (total_assets / (BATCH_SIZE * BATCHES_PER_MINUTE))
                
                _scheduler_stats["cycle_progress_pct"] = round(cycle_progress, 1)
                _scheduler_stats["estimated_cycle_minutes"] = round(estimated_cycle_minutes, 1)
                
                logger.info(
                    f"🚀 Processing assets {current_offset}-{end_offset} of {total_assets} "
                    f"({cycle_progress:.1f}% through cycle, ~{estimated_cycle_minutes:.0f}min total)"
                )
                
                if not batch_assets:
                    _is_running = False
                    return
                
                # Fetch prices using TwelveData
                async with TwelveDataPriceFetcher() as fetcher:
                    prices, fetch_stats = await fetcher.fetch_prices_batch(batch_assets)
                
                # Sync to Supabase
                inserted, failed, errors = await sync.upsert_prices(prices)
                
                # Update offset for next run
                _scheduler_stats["current_offset"] = end_offset
                
                # Calculate duration
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                
                # Update stats
                _scheduler_stats["successful_runs"] += 1
                _scheduler_stats["last_success_at"] = end_time.isoformat()
                _scheduler_stats["total_prices_synced"] += inserted
                
                # Log to Supabase
                await sync.log_ingestion(
                    etl_name="twelvedata-price-serial",
                    status="success",
                    rows_inserted=inserted,
                    rows_skipped=failed,
                    duration_seconds=int(duration),
                    source_used="twelvedata",
                    metadata={
                        "offset": current_offset,
                        "batch_size": symbols_this_run,
                        "total_assets": total_assets,
                        "cycle_progress_pct": cycle_progress,
                        "fetch_stats": fetch_stats,
                    }
                )
                
                logger.info(
                    f"✅ Batch complete: {inserted}/{len(batch_assets)} prices | "
                    f"Duration: {duration:.1f}s | "
                    f"Next offset: {end_offset}"
                )
                
        except Exception as e:
            logger.error(f"❌ Price batch failed: {str(e)}")
            _scheduler_stats["failed_runs"] += 1
            _scheduler_stats["last_error"] = str(e)
            
            try:
                async with SupabaseSync() as sync:
                    await sync.log_ingestion(
                        etl_name="twelvedata-price-serial",
                        status="failure",
                        error_message=str(e),
                        source_used="twelvedata"
                    )
            except:
                pass
        finally:
            _is_running = False


def get_scheduler_stats() -> dict:
    """Get current scheduler statistics"""
    global _scheduler_stats, _scheduler
    
    return {
        **_scheduler_stats,
        "scheduler_active": _scheduler is not None and _scheduler.running if _scheduler else False,
        "is_running": _is_running,
        "config": {
            "batch_size": BATCH_SIZE,
            "batches_per_minute": BATCHES_PER_MINUTE,
            "symbols_per_minute": BATCH_SIZE * BATCHES_PER_MINUTE,
            "cycle_interval_seconds": CYCLE_INTERVAL_SECONDS,
        },
        "data_provider": "Twelve Data",
        "mode": "serial_queue",
    }


def start_scheduler():
    """Start the serial price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return
    
    _scheduler = AsyncIOScheduler()
    
    # Single job - runs every minute, processes next batch
    _scheduler.add_job(
        _run_price_batch,
        trigger=IntervalTrigger(seconds=CYCLE_INTERVAL_SECONDS),
        id="twelvedata_price_serial",
        name=f"TwelveData Serial Queue ({BATCH_SIZE * BATCHES_PER_MINUTE} symbols/min)",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )
    
    _scheduler.start()
    logger.info(
        f"✅ Price scheduler started: SERIAL QUEUE mode | "
        f"{BATCH_SIZE * BATCHES_PER_MINUTE} symbols/min | "
        f"~26 min full cycle for 1043 assets"
    )


def stop_scheduler():
    """Stop the price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Price scheduler stopped")
    
    _scheduler = None


async def trigger_immediate_run():
    """Trigger immediate batch processing"""
    await _run_price_batch()


def reset_cycle():
    """Reset the cycle to start from beginning"""
    global _scheduler_stats
    _scheduler_stats["current_offset"] = 0
    logger.info("🔄 Cycle reset - will start from offset 0")
