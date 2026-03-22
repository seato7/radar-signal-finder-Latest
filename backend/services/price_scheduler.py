"""
Price Scheduler - CREDIT-BUDGETED TIERED REFRESH

Budget: 55 credits/min = 79,200 credits/day

Tier allocations:
- Hot (100 assets): Every 5 min = 28,800 credits/day
- Active (500 assets): Every 30 min = 24,000 credits/day  
- Standard (26,400 assets): Daily = 26,400 credits/day
- Total: 79,200 credits/day ✓

Hot = curated list of globally important assets
Active = secondary priority list (next most important)
Standard = everything else (daily refresh)
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Set
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.etl.twelvedata_prices import TwelveDataPriceFetcher
from backend.services.supabase_sync import SupabaseSync

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION - Stay under 55 credits/min
# =============================================================================
BATCH_SIZE = 50              # Symbols per cycle (under 55 limit)
CYCLE_INTERVAL_SECONDS = 60  # Run every minute

# Tier refresh intervals (in minutes)
TIER_CONFIG = {
    "hot": {
        "refresh_minutes": 5,
        "description": "Major indices, top stocks, crypto, forex (100 assets)",
        "credits_per_day": 28800,  # 100 * 288 (5-min intervals)
    },
    "active": {
        "refresh_minutes": 30,
        "description": "Secondary priorities, popular assets (500 assets)",
        "credits_per_day": 24000,  # 500 * 48 (30-min intervals)
    },
    "standard": {
        "refresh_minutes": 1440,  # 24 hours
        "description": "Full coverage, daily refresh (26,400 assets)",
        "credits_per_day": 26400,  # 26400 * 1 (daily)
    },
}

# =============================================================================
# HOT TIER - 100 most important global assets
# =============================================================================
HOT_TICKERS: Set[str] = {
    # === MAJOR INDICES / ETFs (10) ===
    "SPY", "QQQ", "DIA", "IWM", "VTI", "VOO", "VEA", "VWO", "EEM", "XLF",
    
    # === TOP 40 STOCKS BY MARKET CAP ===
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "UNH",
    "XOM", "JNJ", "JPM", "V", "PG", "MA", "HD", "CVX", "MRK", "ABBV",
    "LLY", "PEP", "KO", "COST", "AVGO", "MCD", "WMT", "CSCO", "TMO", "ACN",
    "ABT", "DHR", "NEE", "LIN", "NKE", "TXN", "PM", "VZ", "UNP", "ORCL",
    
    # === TOP 25 CRYPTO ===
    "BTC/USD", "ETH/USD", "BNB/USD", "XRP/USD", "SOL/USD", "ADA/USD", "DOGE/USD",
    "DOT/USD", "MATIC/USD", "AVAX/USD", "LINK/USD", "UNI/USD", "LTC/USD", "ATOM/USD",
    "XLM/USD", "NEAR/USD", "ALGO/USD", "VET/USD", "FIL/USD", "ICP/USD",
    "AAVE/USD", "APE/USD", "SAND/USD", "MANA/USD", "AXS/USD",
    
    # === FOREX MAJORS (15) ===
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD",
    "EUR/GBP", "EUR/JPY", "GBP/JPY", "EUR/CHF", "AUD/JPY", "CAD/JPY", "CHF/JPY", "NZD/JPY",
    
    # === KEY COMMODITIES (10) ===
    "XAU/USD", "XAG/USD", "GLD", "SLV", "USO", "UNG", "DBA", "DBC", "PDBC", "GSG",
}

# =============================================================================
# ACTIVE TIER - 500 secondary priority assets
# =============================================================================
ACTIVE_TICKERS: Set[str] = {
    # === NEXT 150 STOCKS (S&P 500 components, high volume) ===
    "CRM", "AMD", "INTC", "QCOM", "LOW", "MS", "SPGI", "HON", "IBM", "BA",
    "GE", "CAT", "DE", "MMM", "RTX", "LMT", "NOC", "GD", "TDG", "ITW",
    "EMR", "ROK", "PH", "ETN", "CMI", "PCAR", "OTIS", "FAST", "URI", "PWR",
    "PYPL", "SQ", "SHOP", "ADBE", "CRM", "NOW", "SNOW", "DDOG", "ZS", "CRWD",
    "NET", "MDB", "TEAM", "OKTA", "TWLO", "DOCU", "ZM", "ROKU", "U", "RBLX",
    "DIS", "NFLX", "CMCSA", "T", "TMUS", "VZ", "CHTR", "DISH", "WBD", "PARA",
    "WFC", "BAC", "C", "GS", "BLK", "SCHW", "AXP", "COF", "DFS", "SYF",
    "PFE", "BMY", "AMGN", "GILD", "REGN", "VRTX", "BIIB", "MRNA", "ZTS", "ISRG",
    "MDT", "SYK", "BSX", "EW", "DXCM", "ALGN", "HOLX", "IDXX", "IQV", "MTD",
    "F", "GM", "TM", "HMC", "RIVN", "LCID", "NIO", "XPEV", "LI", "FSR",
    "UBER", "LYFT", "ABNB", "BKNG", "EXPE", "MAR", "HLT", "H", "WH", "CHH",
    "SBUX", "CMG", "DPZ", "YUM", "QSR", "DNUT", "WING", "TXRH", "CAKE", "EAT",
    "TGT", "COST", "DLTR", "DG", "FIVE", "OLLI", "BJ", "PSMT", "RH", "WSM",
    "NKE", "LULU", "UAA", "VFC", "PVH", "RL", "TPR", "CPRI", "SKX", "DECK",
    "AMZN", "BABA", "JD", "PDD", "MELI", "SE", "CPNG", "GLBE", "ETSY", "W",
    
    # === NEXT 100 CRYPTO ===
    "SHIB/USD", "CRO/USD", "TRX/USD", "ETC/USD", "LEO/USD", "OKB/USD", "TON/USD",
    "DAI/USD", "USDC/USD", "BUSD/USD", "TUSD/USD", "XMR/USD", "BCH/USD", "XTZ/USD",
    "EOS/USD", "THETA/USD", "IOTA/USD", "NEO/USD", "WAVES/USD", "DASH/USD",
    "ZEC/USD", "QTUM/USD", "OMG/USD", "ZRX/USD", "BAT/USD", "ENJ/USD", "CHZ/USD",
    "SUSHI/USD", "1INCH/USD", "COMP/USD", "MKR/USD", "YFI/USD", "SNX/USD", "CRV/USD",
    "LDO/USD", "RPL/USD", "ANKR/USD", "LRC/USD", "IMX/USD", "GMT/USD", "FLOW/USD",
    "KAVA/USD", "AR/USD", "ROSE/USD", "ONE/USD", "ZIL/USD", "CELO/USD", "HBAR/USD",
    "STX/USD", "KSM/USD", "EGLD/USD", "HNT/USD", "GRT/USD", "FTM/USD", "RUNE/USD",
    "CAKE/USD", "RNDR/USD", "INJ/USD", "FET/USD", "AGIX/USD", "OCEAN/USD", "JASMY/USD",
    "BLUR/USD", "ARB/USD", "OP/USD", "APT/USD", "SUI/USD", "SEI/USD", "TIA/USD",
    "PEPE/USD", "FLOKI/USD", "BONK/USD", "WIF/USD", "BOME/USD", "MEW/USD", "POPCAT/USD",
    "WLD/USD", "PYTH/USD", "JTO/USD", "JUP/USD", "ONDO/USD", "ENA/USD", "ETHFI/USD",
    "PENDLE/USD", "AEVO/USD", "DYM/USD", "ALT/USD", "STRK/USD", "MANTA/USD", "PIXEL/USD",
    "PORTAL/USD", "MYRO/USD", "SLERF/USD", "TNSR/USD", "W/USD", "SAGA/USD", "OMNI/USD",
    "REZ/USD", "BB/USD",
    
    # === ALL REMAINING FOREX PAIRS (30) ===
    "EUR/AUD", "EUR/CAD", "EUR/NZD", "GBP/AUD", "GBP/CAD", "GBP/CHF", "GBP/NZD",
    "AUD/CAD", "AUD/CHF", "AUD/NZD", "NZD/CAD", "NZD/CHF", "CAD/CHF", "SGD/JPY",
    "USD/SGD", "USD/HKD", "USD/CNH", "USD/MXN", "USD/ZAR", "USD/TRY", "USD/PLN",
    "USD/SEK", "USD/NOK", "USD/DKK", "USD/CZK", "USD/HUF", "USD/RUB", "USD/THB",
    "USD/INR", "USD/KRW",
    
    # === SECTOR ETFS (50) ===
    "XLK", "XLV", "XLE", "XLI", "XLY", "XLP", "XLB", "XLU", "XLRE", "XLC",
    "SMH", "SOXX", "IGV", "SKYY", "BOTZ", "ROBO", "ARKK", "ARKG", "ARKF", "ARKW",
    "IBB", "XBI", "VHT", "IHI", "IHF", "LABU", "LABD", "XOP", "OIH", "VDE",
    "ICLN", "TAN", "QCLN", "PBW", "FAN", "LIT", "REMX", "URA", "URNM", "NLR",
    "IYR", "VNQ", "SCHH", "RWR", "REM", "MORT", "REZ", "HOMZ", "ITB", "XHB",
    
    # === BOND & TREASURY ETFS (20) ===
    "TLT", "IEF", "SHY", "BND", "AGG", "LQD", "HYG", "JNK", "TIP", "GOVT",
    "VCIT", "VCSH", "MUB", "SUB", "VTEB", "EMB", "PCY", "IGIB", "SCHO", "SCHZ",
    
    # === INTERNATIONAL ETFS (50) ===
    "EFA", "IEFA", "VEU", "VXUS", "IXUS", "ACWX", "ACWI", "VT", "URTH", "IEMG",
    "FXI", "MCHI", "KWEB", "CQQQ", "ASHR", "GXC", "EWJ", "DXJ", "HEWJ", "BBJP",
    "EWZ", "EWW", "EWC", "EWA", "EWU", "EWG", "EWQ", "EWI", "EWP", "EWL",
    "EWH", "EWT", "EWY", "EWS", "EWM", "THD", "INDA", "SMIN", "PIN", "INDY",
    "VGK", "IEV", "HEDJ", "DBEU", "EZU", "FEZ", "EUFN", "BBEU", "IEUR", "HEWG",
}

# =============================================================================
# GLOBAL STATE
# =============================================================================
_scheduler: Optional[AsyncIOScheduler] = None
_is_running = False
_execution_lock: Optional[asyncio.Lock] = None

_scheduler_stats: Dict = {
    "total_runs": 0,
    "successful_runs": 0,
    "failed_runs": 0,
    "last_run_at": None,
    "last_success_at": None,
    "last_error": None,
    "total_prices_synced": 0,
    "credits_used_today": 0,
    "day_started": None,
    "tier_stats": {
        "hot": {"assets": 0, "last_refresh": None, "offset": 0, "cycle_complete": False},
        "active": {"assets": 0, "last_refresh": None, "offset": 0, "cycle_complete": False},
        "standard": {"assets": 0, "last_refresh": None, "offset": 0, "cycle_complete": False},
    },
    "current_tier": None,
}


def _get_lock() -> asyncio.Lock:
    global _execution_lock
    if _execution_lock is None:
        _execution_lock = asyncio.Lock()
    return _execution_lock


def _classify_asset(asset: dict) -> str:
    """Classify asset into Hot, Active, or Standard tier"""
    ticker = asset.get("ticker", "").upper()
    
    # Hot tier - curated priority list
    if ticker in HOT_TICKERS:
        return "hot"
    
    # Active tier - secondary priority list
    if ticker in ACTIVE_TICKERS:
        return "active"
    
    # Everything else is Standard
    return "standard"


def _tier_needs_refresh(tier: str, tier_stat: dict) -> bool:
    """Check if a tier needs refreshing based on its schedule"""
    last_refresh = tier_stat.get("last_refresh")
    
    if last_refresh is None:
        return True
    
    if isinstance(last_refresh, str):
        last_refresh = datetime.fromisoformat(last_refresh.replace("Z", "+00:00"))
    
    refresh_minutes = TIER_CONFIG[tier]["refresh_minutes"]
    elapsed = datetime.now(timezone.utc) - last_refresh
    
    return elapsed >= timedelta(minutes=refresh_minutes)


def _get_next_tier_to_process(tier_assets: Dict[str, List], tier_stats: Dict) -> Optional[str]:
    """
    Determine which tier to process next.
    Priority: Hot > Active > Standard
    Also considers pending assets in incomplete cycles.
    """
    for tier in ["hot", "active", "standard"]:
        if not tier_assets.get(tier):
            continue
        
        tier_stat = tier_stats.get(tier, {})
        
        # Check if tier needs refresh (timer expired)
        if _tier_needs_refresh(tier, tier_stat):
            return tier
        
        # Check if tier has pending assets in current cycle
        offset = tier_stat.get("offset", 0)
        if offset > 0 and offset < len(tier_assets.get(tier, [])):
            return tier
    
    return None


async def _run_tiered_price_batch():
    """
    Main scheduler job - processes prices using tiered strategy.
    Runs every minute, processing up to BATCH_SIZE symbols.
    """
    global _scheduler_stats, _is_running
    
    if _is_running:
        logger.debug("⏭️ Previous batch still running, skipping")
        return
    
    async with _get_lock():
        _is_running = True
        start_time = datetime.now(timezone.utc)
        _scheduler_stats["total_runs"] += 1
        _scheduler_stats["last_run_at"] = start_time.isoformat()
        
        # Reset daily counter if new day
        today = start_time.strftime("%Y-%m-%d")
        if _scheduler_stats.get("day_started") != today:
            _scheduler_stats["day_started"] = today
            _scheduler_stats["credits_used_today"] = 0
        
        try:
            async with SupabaseSync() as sync:
                if not sync.is_configured:
                    raise Exception("Supabase not configured")
                
                # Get all assets
                all_assets = await sync.get_assets()
                
                if not all_assets:
                    logger.info("📭 No assets found")
                    _is_running = False
                    return
                
                # Classify assets into tiers
                tier_assets = {"hot": [], "active": [], "standard": []}
                for asset in all_assets:
                    tier = _classify_asset(asset)
                    tier_assets[tier].append(asset)
                
                # Update asset counts
                for tier in tier_assets:
                    _scheduler_stats["tier_stats"][tier]["assets"] = len(tier_assets[tier])
                
                logger.info(
                    f"📊 Tiers: Hot={len(tier_assets['hot'])}, "
                    f"Active={len(tier_assets['active'])}, "
                    f"Standard={len(tier_assets['standard'])}"
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
                tier_stat = _scheduler_stats["tier_stats"][current_tier]
                assets_for_tier = tier_assets[current_tier]
                
                # Get current offset
                current_offset = tier_stat.get("offset", 0)
                
                # Reset offset if starting new cycle
                if current_offset >= len(assets_for_tier):
                    current_offset = 0
                    tier_stat["offset"] = 0
                    tier_stat["cycle_complete"] = False
                    logger.info(f"🔄 Starting new {current_tier.upper()} tier cycle")
                
                # Calculate batch
                symbols_this_run = min(BATCH_SIZE, len(assets_for_tier) - current_offset)
                end_offset = current_offset + symbols_this_run
                batch_assets = assets_for_tier[current_offset:end_offset]
                
                if not batch_assets:
                    _is_running = False
                    return
                
                logger.info(
                    f"🚀 [{current_tier.upper()}] Processing {current_offset+1}-{end_offset} "
                    f"of {len(assets_for_tier)}"
                )
                
                # Fetch prices
                async with TwelveDataPriceFetcher() as fetcher:
                    prices, fetch_stats = await fetcher.fetch_prices_batch(batch_assets)
                    ingestion_logs = fetcher.ingestion_logs  # Get per-ticker logs
                
                # Sync prices to Supabase
                inserted, failed, errors = await sync.upsert_prices(prices)
                
                # Sync per-ticker ingestion logs
                if ingestion_logs:
                    logs_inserted, logs_failed, log_errors = await sync.upsert_ingestion_logs(ingestion_logs)
                    logger.info(f"📝 Ingestion logs: {logs_inserted} inserted, {logs_failed} failed")
                    if logs_failed > 0:
                        logger.error(f"❌ price_ingestion_log write failures: {logs_failed} rows failed — errors: {log_errors[:3]}")
                
                # Update tier offset
                tier_stat["offset"] = end_offset
                
                # If tier cycle complete, update last_refresh
                if end_offset >= len(assets_for_tier):
                    tier_stat["last_refresh"] = datetime.now(timezone.utc).isoformat()
                    tier_stat["offset"] = 0
                    tier_stat["cycle_complete"] = True
                    logger.info(f"✅ {current_tier.upper()} tier cycle complete!")
                
                # Update stats
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                
                _scheduler_stats["successful_runs"] += 1
                _scheduler_stats["last_success_at"] = end_time.isoformat()
                _scheduler_stats["total_prices_synced"] += inserted
                _scheduler_stats["credits_used_today"] += symbols_this_run
                
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
                    f"✅ [{current_tier.upper()}] {inserted}/{len(batch_assets)} prices | "
                    f"{duration:.1f}s | Credits today: {_scheduler_stats['credits_used_today']}"
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
            except Exception as log_err:
                logger.warning(f"Failed to log ingestion failure to Supabase: {log_err}")
        finally:
            _is_running = False


def get_scheduler_stats() -> dict:
    """Get current scheduler statistics"""
    global _scheduler_stats, _scheduler
    
    return {
        **_scheduler_stats,
        "scheduler_active": _scheduler is not None and _scheduler.running if _scheduler else False,
        "is_running": _is_running,
        "mode": "credit_budgeted_tiered",
        "config": {
            "batch_size": BATCH_SIZE,
            "cycle_interval_seconds": CYCLE_INTERVAL_SECONDS,
            "tiers": TIER_CONFIG,
            "hot_tickers_count": len(HOT_TICKERS),
            "active_tickers_count": len(ACTIVE_TICKERS),
        },
        "budget": {
            "credits_per_minute": 55,
            "credits_per_day": 79200,
            "credits_used_today": _scheduler_stats.get("credits_used_today", 0),
            "budget_remaining": 79200 - _scheduler_stats.get("credits_used_today", 0),
        },
        "data_provider": "Twelve Data",
    }


def start_scheduler():
    """Start the tiered price scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running")
        return get_scheduler_stats()
    
    _scheduler = AsyncIOScheduler()
    
    _scheduler.add_job(
        _run_tiered_price_batch,
        trigger=IntervalTrigger(seconds=CYCLE_INTERVAL_SECONDS),
        id="twelvedata_price_tiered",
        name="TwelveData Tiered Refresh (Hot=5min, Active=30min, Standard=daily)",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )
    
    _scheduler.start()
    
    logger.info(
        "✅ Price scheduler started: CREDIT-BUDGETED TIERED mode | "
        "Hot(100)=5min, Active(500)=30min, Standard=daily | "
        "Budget: 79,200 credits/day"
    )
    
    return get_scheduler_stats()


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
        _scheduler_stats["tier_stats"][tier]["cycle_complete"] = False
    _scheduler_stats["credits_used_today"] = 0
    logger.info("🔄 All tier cycles reset")
