"""
Price Scheduler - TIERED REFRESH for different asset priorities

Tiers:
- Priority (~500): S&P 500 + major crypto/forex - every 10 min
- Standard (~2000): Popular stocks/ETFs - every 30 min  
- Background (~5700): Everything else - every 2 hours

Target: ~50 API credits/min to stay under 55 limit
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.config import settings
from backend.etl.twelvedata_prices import TwelveDataPriceFetcher
from backend.services.supabase_sync import SupabaseSync

logger = logging.getLogger(__name__)

# Configuration - stay under 55 credits/min
BATCH_SIZE = 25          # Symbols per API call
BATCHES_PER_MINUTE = 2   # 2 batches = 50 credits/min
CYCLE_INTERVAL_SECONDS = 60

# Tier definitions
TIERS = {
    "priority": {
        "refresh_minutes": 10,
        "description": "Major indices, top crypto, forex majors"
    },
    "standard": {
        "refresh_minutes": 30,
        "description": "Popular stocks and ETFs"
    },
    "background": {
        "refresh_minutes": 120,
        "description": "Full coverage"
    }
}

# Priority tickers - S&P 500 top 100 + major crypto + forex majors
PRIORITY_TICKERS = {
    # Top 50 S&P 500 by market cap
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "UNH",
    "XOM", "JNJ", "JPM", "V", "PG", "MA", "HD", "CVX", "MRK", "ABBV",
    "LLY", "PEP", "KO", "COST", "AVGO", "MCD", "WMT", "CSCO", "TMO", "ACN",
    "ABT", "DHR", "NEE", "LIN", "NKE", "TXN", "PM", "VZ", "UNP", "ORCL",
    "CRM", "AMD", "INTC", "QCOM", "LOW", "MS", "SPGI", "HON", "IBM", "BA",
    # Major crypto
    "BTC/USD", "ETH/USD", "BNB/USD", "XRP/USD", "SOL/USD", "ADA/USD", "DOGE/USD",
    "DOT/USD", "MATIC/USD", "AVAX/USD", "LINK/USD", "UNI/USD", "LTC/USD", "ATOM/USD",
    # Forex majors
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD",
    "EUR/GBP", "EUR/JPY", "GBP/JPY",
    # Major ETFs
    "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "VEA", "VWO", "GLD", "SLV",
    # Major indices proxies
    "XAU/USD", "XAG/USD",
}

# Standard tickers - next ~2000 most popular
STANDARD_EXCHANGES = {"NYSE", "NASDAQ", "AMEX"}
STANDARD_ASSET_CLASSES = {"stock", "etf", "crypto"}

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
    "tier_stats": {
        "priority": {"assets": 0, "last_refresh": None, "offset": 0},
        "standard": {"assets": 0, "last_refresh": None, "offset": 0},
        "background": {"assets": 0, "last_refresh": None, "offset": 0},
    },
    "current_tier": "priority",
    "credits_used_this_minute": 0,
}

_is_running = False
_execution_lock: Optional[asyncio.Lock] = None


def _get_lock() -> asyncio.Lock:
    global _execution_lock
    if _execution_lock is None:
        _execution_lock = asyncio.Lock()
    return _execution_lock


def _classify_asset(asset: dict) -> str:
    """Classify asset into a tier based on ticker, exchange, class"""
    ticker = asset.get("ticker", "")
    
    # Priority tier
    if ticker in PRIORITY_TICKERS:
        return "priority"
    
    # Standard tier - major exchanges, stocks/ETFs/crypto
    exchange = asset.get("exchange", "")
    asset_class = asset.get("asset_class", "")
    
    if exchange in STANDARD_EXCHANGES or asset_class in STANDARD_ASSET_CLASSES:
        return "standard"
    
    # Everything else is background
    return "background"


def _should_refresh_tier(tier: str, tier_stats: dict) -> bool:
    """Check if a tier needs refreshing based on its schedule"""
    last_refresh = tier_stats.get("last_refresh")
    if last_refresh is None:
        return True
    
    # Parse last refresh time
    if isinstance(last_refresh, str):
        last_refresh = datetime.fromisoformat(last_refresh.replace("Z", "+00:00"))
    
    refresh_interval = timedelta(minutes=TIERS[tier]["refresh_minutes"])
    return datetime.now(timezone.utc) - last_refresh >= refresh_interval


def _get_next_tier_to_process(tier_assets: dict, tier_stats: dict) -> Optional[str]:
    """Determine which tier should be processed next"""
    # Priority: always check priority first
    for tier in ["priority", "standard", "background"]:
        if not tier_assets.get(tier):
            continue
            
        # Check if tier needs refresh
        if _should_refresh_tier(tier, tier_stats.get(tier, {})):
            return tier
        
        # Check if tier has pending assets (not completed cycle)
        offset = tier_stats.get(tier, {}).get("offset", 0)
        if offset > 0 and offset < len(tier_assets.get(tier, [])):
            return tier
    
    return None


async def _run_tiered_price_batch():
    """
    Process prices using tiered refresh strategy.
    Priority assets refresh every 10 min, standard every 30 min, background every 2 hours.
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
                
                # Get ALL assets
                all_assets = await sync.get_assets()
                
                if not all_assets:
                    logger.info("📭 No assets found")
                    _is_running = False
                    return
                
                # Classify assets into tiers
                tier_assets = {"priority": [], "standard": [], "background": []}
                for asset in all_assets:
                    tier = _classify_asset(asset)
                    tier_assets[tier].append(asset)
                
                # Update tier asset counts
                for tier in tier_assets:
                    _scheduler_stats["tier_stats"][tier]["assets"] = len(tier_assets[tier])
                
                logger.info(
                    f"📊 Asset tiers: Priority={len(tier_assets['priority'])}, "
                    f"Standard={len(tier_assets['standard'])}, "
                    f"Background={len(tier_assets['background'])}"
                )
                
                # Determine which tier to process
                current_tier = _get_next_tier_to_process(
                    tier_assets, 
                    _scheduler_stats["tier_stats"]
                )
                
                if not current_tier:
                    logger.info("✅ All tiers up to date, waiting for next refresh window")
                    _is_running = False
                    return
                
                _scheduler_stats["current_tier"] = current_tier
                tier_config = TIERS[current_tier]
                tier_stat = _scheduler_stats["tier_stats"][current_tier]
                assets_for_tier = tier_assets[current_tier]
                
                # Get current offset for this tier
                current_offset = tier_stat.get("offset", 0)
                
                # Reset offset if starting new cycle
                if current_offset >= len(assets_for_tier):
                    current_offset = 0
                    tier_stat["offset"] = 0
                    tier_stat["last_refresh"] = start_time.isoformat()
                    logger.info(f"🔄 Starting new {current_tier} tier cycle")
                
                # Calculate batch
                symbols_this_run = min(
                    BATCH_SIZE * BATCHES_PER_MINUTE, 
                    len(assets_for_tier) - current_offset
                )
                end_offset = current_offset + symbols_this_run
                batch_assets = assets_for_tier[current_offset:end_offset]
                
                logger.info(
                    f"🚀 [{current_tier.upper()}] Processing {current_offset}-{end_offset} "
                    f"of {len(assets_for_tier)} ({tier_config['description']})"
                )
                
                if not batch_assets:
                    _is_running = False
                    return
                
                # Fetch prices
                async with TwelveDataPriceFetcher() as fetcher:
                    prices, fetch_stats = await fetcher.fetch_prices_batch(batch_assets)
                
                # Sync to Supabase
                inserted, failed, errors = await sync.upsert_prices(prices)
                
                # Update tier offset
                tier_stat["offset"] = end_offset
                
                # If tier cycle complete, update last_refresh
                if end_offset >= len(assets_for_tier):
                    tier_stat["last_refresh"] = datetime.now(timezone.utc).isoformat()
                    tier_stat["offset"] = 0
                    logger.info(f"✅ {current_tier.upper()} tier cycle complete!")
                
                # Calculate duration
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                
                # Update stats
                _scheduler_stats["successful_runs"] += 1
                _scheduler_stats["last_success_at"] = end_time.isoformat()
                _scheduler_stats["total_prices_synced"] += inserted
                _scheduler_stats["credits_used_this_minute"] = symbols_this_run
                
                # Log to Supabase
                await sync.log_ingestion(
                    etl_name=f"twelvedata-{current_tier}",
                    status="success",
                    rows_inserted=inserted,
                    rows_skipped=failed,
                    duration_seconds=int(duration),
                    source_used="twelvedata",
                    metadata={
                        "tier": current_tier,
                        "offset": current_offset,
                        "batch_size": symbols_this_run,
                        "tier_total": len(assets_for_tier),
                        "fetch_stats": fetch_stats,
                    }
                )
                
                logger.info(
                    f"✅ [{current_tier.upper()}] Batch complete: {inserted}/{len(batch_assets)} prices | "
                    f"Duration: {duration:.1f}s"
                )
                
        except Exception as e:
            logger.error(f"❌ Price batch failed: {str(e)}")
            _scheduler_stats["failed_runs"] += 1
            _scheduler_stats["last_error"] = str(e)
            
            try:
                async with SupabaseSync() as sync:
                    await sync.log_ingestion(
                        etl_name="twelvedata-tiered",
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
            "tiers": TIERS,
        },
        "data_provider": "Twelve Data",
        "mode": "tiered_refresh",
    }


def start_scheduler():
    """Start the tiered price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return
    
    _scheduler = AsyncIOScheduler()
    
    _scheduler.add_job(
        _run_tiered_price_batch,
        trigger=IntervalTrigger(seconds=CYCLE_INTERVAL_SECONDS),
        id="twelvedata_price_tiered",
        name=f"TwelveData Tiered Refresh ({BATCH_SIZE * BATCHES_PER_MINUTE} symbols/min)",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )
    
    _scheduler.start()
    
    logger.info(
        f"✅ Price scheduler started: TIERED REFRESH mode | "
        f"{BATCH_SIZE * BATCHES_PER_MINUTE} symbols/min | "
        f"Priority=10min, Standard=30min, Background=2hr"
    )
    
    # Return config for logging
    return {
        "batch_size": BATCH_SIZE,
        "batches_per_minute": BATCHES_PER_MINUTE,
        "symbols_per_minute": BATCH_SIZE * BATCHES_PER_MINUTE,
        "cycle_interval_seconds": CYCLE_INTERVAL_SECONDS,
    }


def stop_scheduler():
    """Stop the price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Price scheduler stopped")
    
    _scheduler = None


async def trigger_immediate_run():
    """Trigger immediate batch processing"""
    await _run_tiered_price_batch()


def reset_cycle():
    """Reset all tier cycles to start from beginning"""
    global _scheduler_stats
    for tier in _scheduler_stats["tier_stats"]:
        _scheduler_stats["tier_stats"][tier]["offset"] = 0
        _scheduler_stats["tier_stats"][tier]["last_refresh"] = None
    logger.info("🔄 All tier cycles reset")
