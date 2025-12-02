"""Price Scheduler - Automated price ingestion on a schedule"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.etl.yahoo_prices import fetch_all_prices
from backend.services.supabase_sync import SupabaseSync
from backend.config import settings

logger = logging.getLogger(__name__)

# Default schedule: every 5 minutes
DEFAULT_INTERVAL_MINUTES = 5

# Global scheduler instance
_scheduler: Optional[AsyncIOScheduler] = None
_is_running = False

# Stats tracking
_scheduler_stats = {
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


async def run_scheduled_ingestion():
    """Execute a scheduled price ingestion cycle"""
    global _scheduler_stats, _is_running
    
    if _is_running:
        logger.warning("Previous ingestion still running, skipping this cycle")
        return
    
    _is_running = True
    start_time = datetime.now(timezone.utc)
    _scheduler_stats["total_runs"] += 1
    _scheduler_stats["last_run_at"] = start_time.isoformat()
    
    try:
        async with SupabaseSync() as sync:
            if not sync.is_configured:
                raise Exception("Supabase not configured")
            
            # Get assets from Supabase
            assets = await sync.get_assets()
            
            if not assets:
                logger.warning("No assets found to process")
                return
            
            logger.info(f"Starting scheduled ingestion for {len(assets)} assets")
            
            # Fetch prices
            prices, fetch_stats = await fetch_all_prices(assets)
            
            # Sync to Supabase
            inserted, failed, errors = await sync.upsert_prices(prices)
            
            # Calculate duration
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()
            
            # Update stats
            _scheduler_stats["successful_runs"] += 1
            _scheduler_stats["last_success_at"] = end_time.isoformat()
            _scheduler_stats["total_prices_synced"] += inserted
            
            # Calculate running average duration
            total_runs = _scheduler_stats["total_runs"]
            avg_duration = _scheduler_stats["average_duration_seconds"]
            _scheduler_stats["average_duration_seconds"] = (
                (avg_duration * (total_runs - 1) + duration) / total_runs
            )
            
            # Log to Supabase
            await sync.log_ingestion(
                etl_name="railway-price-scheduler",
                status="success",
                rows_inserted=inserted,
                rows_skipped=failed,
                duration_seconds=int(duration),
                source_used="yahoo_finance",
                metadata={
                    "total_assets": len(assets),
                    "fetch_stats": fetch_stats,
                    "scheduler_stats": _scheduler_stats
                }
            )
            
            logger.info(
                f"Scheduled ingestion completed: {inserted}/{len(assets)} prices "
                f"in {duration:.1f}s (success rate: {inserted/len(assets)*100:.1f}%)"
            )
            
    except Exception as e:
        logger.error(f"Scheduled ingestion failed: {str(e)}")
        _scheduler_stats["failed_runs"] += 1
        _scheduler_stats["last_failure_at"] = datetime.now(timezone.utc).isoformat()
        _scheduler_stats["last_error"] = str(e)
        
        # Try to log failure
        try:
            async with SupabaseSync() as sync:
                await sync.log_ingestion(
                    etl_name="railway-price-scheduler",
                    status="failure",
                    error_message=str(e),
                    source_used="yahoo_finance"
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
        "is_running": _is_running,
        "scheduler_active": _scheduler is not None and _scheduler.running if _scheduler else False,
        "success_rate": (
            _scheduler_stats["successful_runs"] / _scheduler_stats["total_runs"] * 100
            if _scheduler_stats["total_runs"] > 0 else 0
        )
    }


def start_scheduler(interval_minutes: int = DEFAULT_INTERVAL_MINUTES):
    """Start the price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return
    
    _scheduler = AsyncIOScheduler()
    
    _scheduler.add_job(
        run_scheduled_ingestion,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="price_ingestion",
        name="Yahoo Finance Price Ingestion",
        replace_existing=True,
        max_instances=1
    )
    
    _scheduler.start()
    logger.info(f"Price scheduler started with {interval_minutes} minute interval")


def stop_scheduler():
    """Stop the price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Price scheduler stopped")
    
    _scheduler = None


async def trigger_immediate_run():
    """Trigger an immediate ingestion run"""
    await run_scheduled_ingestion()
