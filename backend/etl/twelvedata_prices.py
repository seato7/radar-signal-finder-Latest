"""
Twelve Data Price ETL - STRICT rate limiting for 55 credits/min plan

CRITICAL: Never exceed 55 credits per minute or Twelve Data will rate limit us.
Each symbol = 1 credit. Max batch = 20 symbols.
"""
import asyncio
import hashlib
import time
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
import httpx
import logging

from backend.config import settings

logger = logging.getLogger(__name__)

# Twelve Data API configuration
TWELVEDATA_BASE_URL = "https://api.twelvedata.com"

# STRICT Rate limiting - Grow plan: 55 credits/min
MAX_CREDITS_PER_MINUTE = 50  # Leave 5 credit buffer (55 limit - 5 buffer = 50 usable)
MAX_SYMBOLS_PER_BATCH = 20   # STRICT: Never more than 20 symbols per request
REQUEST_TIMEOUT = 30.0
MAX_RETRIES = 2
RETRY_DELAY = 3.0

# Minimum seconds between batches to spread load
MIN_BATCH_INTERVAL_SECONDS = 3.0

# Ticker normalization mappings for Twelve Data
TICKER_MAPPINGS = {
    # Commodities
    'CRUDE': 'CL1',
    'BRENT': 'BRN1', 
    'NATGAS': 'NG1',
    'XAUUSD': 'XAU/USD',
    'XAGUSD': 'XAG/USD',
    'XPTUSD': 'XPT/USD',
    'XPDUSD': 'XPD/USD',
    'COPPER': 'HG1',
    'GOLD': 'XAU/USD',
    'SILVER': 'XAG/USD',
    'OIL': 'CL1',
    'WTI': 'CL1',
    'PLATINUM': 'XPT/USD',
    'PALLADIUM': 'XPD/USD',
    'WHEAT': 'ZW1',
    'CORN': 'ZC1',
    'SOYBEANS': 'ZS1',
    'COFFEE': 'KC1',
    'SUGAR': 'SB1',
    'COTTON': 'CT1',
    'VIX': 'VIX',
    # Forex
    'EUR/USD': 'EUR/USD',
    'GBP/USD': 'GBP/USD',
    'USD/JPY': 'USD/JPY',
    'USD/CHF': 'USD/CHF',
    'AUD/USD': 'AUD/USD',
    'USD/CAD': 'USD/CAD',
    'NZD/USD': 'NZD/USD',
}

# Asset class refresh intervals (from settings)
REFRESH_INTERVALS = {
    'crypto': 10,
    'forex': 10,
    'stock': 30,
    'equity': 30,
    'commodity': 30,
    'index': 30,
    'etf': 30,
}


class StrictCreditsGuard:
    """
    STRICT per-minute credit tracking with minute boundary awareness.
    Ensures we NEVER exceed 50 credits in any 60-second window.
    """
    
    def __init__(self, max_credits: int = MAX_CREDITS_PER_MINUTE):
        self.max_credits = max_credits
        self._credits_this_minute = 0
        self._minute_start = self._get_current_minute_start()
        self._lock = asyncio.Lock()
    
    def _get_current_minute_start(self) -> float:
        """Get timestamp of current minute start"""
        now = time.time()
        return now - (now % 60)
    
    def _get_seconds_until_next_minute(self) -> float:
        """Get seconds remaining until next minute boundary + 2s buffer"""
        now = time.time()
        seconds_into_minute = now % 60
        return (60 - seconds_into_minute) + 2.0  # +2s safety buffer
    
    async def acquire(self, credits_needed: int) -> Tuple[bool, float]:
        """
        Try to acquire credits. Returns (success, wait_time).
        If we can't acquire now, returns wait time until next minute.
        """
        async with self._lock:
            current_minute = self._get_current_minute_start()
            
            # Reset if we're in a new minute
            if current_minute > self._minute_start:
                logger.info(f"💰 Credit reset: {self._credits_this_minute} used last minute, resetting to 0")
                self._credits_this_minute = 0
                self._minute_start = current_minute
            
            # Check if we can acquire
            if self._credits_this_minute + credits_needed <= self.max_credits:
                self._credits_this_minute += credits_needed
                logger.debug(f"💰 Acquired {credits_needed} credits. Total this minute: {self._credits_this_minute}/{self.max_credits}")
                return True, 0.0
            
            # Can't acquire - need to wait
            wait_time = self._get_seconds_until_next_minute()
            logger.warning(
                f"⚠️ CREDIT LIMIT: Would exceed {self.max_credits}/min. "
                f"Used: {self._credits_this_minute}, Requested: {credits_needed}. "
                f"Waiting {wait_time:.1f}s for next minute."
            )
            return False, wait_time
    
    async def wait_and_acquire(self, credits_needed: int) -> None:
        """Wait if necessary, then acquire credits"""
        success, wait_time = await self.acquire(credits_needed)
        
        if not success:
            logger.info(f"⏳ Delaying batch by {wait_time:.1f}s to respect credit limit")
            await asyncio.sleep(wait_time)
            # Reset and acquire after wait
            async with self._lock:
                self._credits_this_minute = credits_needed
                self._minute_start = self._get_current_minute_start()
    
    def get_status(self) -> Dict:
        """Get current status"""
        return {
            "credits_used_this_minute": self._credits_this_minute,
            "credits_remaining": self.max_credits - self._credits_this_minute,
            "max_credits_per_minute": self.max_credits,
            "seconds_until_reset": self._get_seconds_until_next_minute()
        }


# Global credit guard - shared across all fetchers
_global_credits_guard: Optional[StrictCreditsGuard] = None


def get_credits_guard() -> StrictCreditsGuard:
    """Get or create global credits guard"""
    global _global_credits_guard
    if _global_credits_guard is None:
        _global_credits_guard = StrictCreditsGuard()
    return _global_credits_guard


class TwelveDataPriceFetcher:
    """Fetches prices from Twelve Data with STRICT rate limiting"""
    
    def __init__(self):
        self.session: Optional[httpx.AsyncClient] = None
        self.api_key = settings.TWELVEDATA_API_KEY
        self.credits_guard = get_credits_guard()
        self.stats = {
            "fetched": 0,
            "failed": 0,
            "retries": 0,
            "rate_limit_waits": 0,
            "batches_processed": 0,
            "total_credits_used": 0,
            "start_time": None,
            "end_time": None,
            "errors": []
        }
        self._last_batch_time = 0.0
    
    async def __aenter__(self):
        if not self.api_key:
            raise ValueError("TWELVEDATA_API_KEY environment variable not set")
        
        self.session = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "OpportunityRadar/1.0"}
        )
        self.stats["start_time"] = datetime.now(timezone.utc).isoformat()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
        self.stats["end_time"] = datetime.now(timezone.utc).isoformat()
    
    def _normalize_ticker(self, ticker: str, asset_class: str) -> Optional[str]:
        """Convert ticker to Twelve Data format"""
        ticker = ticker.upper().strip()
        
        if ticker in TICKER_MAPPINGS:
            return TICKER_MAPPINGS[ticker]
        
        if asset_class == "crypto":
            if '/USDT' in ticker:
                return ticker.replace('/USDT', '/USD')
            if '/USD' not in ticker and '-USD' not in ticker:
                base = ticker.replace('-', '').replace('/', '')
                return f"{base}/USD"
            return ticker.replace('-', '/')
        
        if asset_class == "forex":
            ticker = ticker.replace("=X", "")
            if '/' not in ticker and len(ticker) == 6:
                return f"{ticker[:3]}/{ticker[3:]}"
            return ticker
        
        return ticker
    
    async def _enforce_batch_interval(self):
        """Ensure minimum time between batches"""
        now = time.time()
        elapsed = now - self._last_batch_time
        
        if elapsed < MIN_BATCH_INTERVAL_SECONDS:
            wait = MIN_BATCH_INTERVAL_SECONDS - elapsed
            logger.debug(f"⏱️ Batch interval: waiting {wait:.1f}s")
            await asyncio.sleep(wait)
        
        self._last_batch_time = time.time()
    
    async def _fetch_batch(self, symbols: List[str], asset_class: str) -> Dict[str, Dict]:
        """Fetch prices for a batch with strict credit enforcement"""
        if not symbols:
            return {}
        
        # Enforce batch size limit
        if len(symbols) > MAX_SYMBOLS_PER_BATCH:
            logger.error(f"❌ BATCH TOO LARGE: {len(symbols)} > {MAX_SYMBOLS_PER_BATCH}. Truncating!")
            symbols = symbols[:MAX_SYMBOLS_PER_BATCH]
        
        credits_needed = len(symbols)
        
        # Wait for credits
        await self.credits_guard.wait_and_acquire(credits_needed)
        self.stats["total_credits_used"] += credits_needed
        
        # Enforce minimum batch interval
        await self._enforce_batch_interval()
        
        # Build request
        symbol_str = ",".join(symbols)
        params = {
            "symbol": symbol_str,
            "apikey": self.api_key
        }
        
        results = {}
        
        logger.info(
            f"📊 Fetching batch: {len(symbols)} symbols | "
            f"Credits: {credits_needed} | "
            f"Status: {self.credits_guard.get_status()}"
        )
        
        for attempt in range(MAX_RETRIES):
            try:
                response = await self.session.get(
                    f"{TWELVEDATA_BASE_URL}/price",
                    params=params
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if len(symbols) == 1:
                        if "price" in data:
                            results[symbols[0]] = {
                                "price": float(data["price"]),
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }
                            self.stats["fetched"] += 1
                        else:
                            self.stats["failed"] += 1
                            if "message" in data:
                                self.stats["errors"].append(f"{symbols[0]}: {data['message']}")
                    else:
                        for symbol, price_data in data.items():
                            if isinstance(price_data, dict):
                                if "price" in price_data:
                                    results[symbol] = {
                                        "price": float(price_data["price"]),
                                        "timestamp": datetime.now(timezone.utc).isoformat()
                                    }
                                    self.stats["fetched"] += 1
                                elif "message" in price_data:
                                    self.stats["failed"] += 1
                                    if len(self.stats["errors"]) < 10:
                                        self.stats["errors"].append(f"{symbol}: {price_data['message']}")
                                else:
                                    self.stats["failed"] += 1
                    
                    self.stats["batches_processed"] += 1
                    break
                
                elif response.status_code == 429:
                    self.stats["retries"] += 1
                    self.stats["rate_limit_waits"] += 1
                    wait = RETRY_DELAY * (2 ** attempt) + 5  # Longer wait on rate limit
                    logger.warning(f"⚠️ RATE LIMITED by Twelve Data! Waiting {wait}s (attempt {attempt + 1})")
                    await asyncio.sleep(wait)
                    continue
                
                else:
                    logger.error(f"Twelve Data API error: {response.status_code} - {response.text[:200]}")
                    self.stats["failed"] += len(symbols)
                    break
                    
            except httpx.TimeoutException:
                self.stats["retries"] += 1
                logger.warning(f"Timeout fetching batch (attempt {attempt + 1})")
                await asyncio.sleep(RETRY_DELAY)
            except Exception as e:
                logger.error(f"Error fetching batch: {str(e)}")
                self.stats["failed"] += len(symbols)
                break
        
        return results
    
    async def fetch_prices_for_class(
        self,
        assets: List[Dict[str, str]],
        asset_class: str
    ) -> Tuple[List[Dict], Dict]:
        """
        Fetch prices for a specific asset class with STRICT batching.
        Max 20 symbols per batch, max 50 credits per minute.
        """
        if not assets:
            return [], self.stats
        
        # Normalize tickers
        ticker_map = {}
        for asset in assets:
            td_symbol = self._normalize_ticker(asset["ticker"], asset_class)
            if td_symbol:
                ticker_map[td_symbol] = asset
        
        if not ticker_map:
            return [], self.stats
        
        symbols = list(ticker_map.keys())
        all_prices = {}
        
        # Calculate batching
        total_symbols = len(symbols)
        total_batches = (total_symbols + MAX_SYMBOLS_PER_BATCH - 1) // MAX_SYMBOLS_PER_BATCH
        
        logger.info(
            f"🚀 Starting {asset_class} fetch: {total_symbols} symbols in {total_batches} batches "
            f"(max {MAX_SYMBOLS_PER_BATCH}/batch, max {MAX_CREDITS_PER_MINUTE} credits/min)"
        )
        
        # Process in strict batches
        for i in range(0, len(symbols), MAX_SYMBOLS_PER_BATCH):
            batch = symbols[i:i + MAX_SYMBOLS_PER_BATCH]
            batch_num = (i // MAX_SYMBOLS_PER_BATCH) + 1
            
            logger.info(f"📦 Batch {batch_num}/{total_batches}: {len(batch)} symbols")
            
            batch_results = await self._fetch_batch(batch, asset_class)
            all_prices.update(batch_results)
        
        # Convert to price records
        price_records = []
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        for td_symbol, price_data in all_prices.items():
            asset = ticker_map.get(td_symbol)
            if not asset:
                continue
            
            price = price_data.get("price")
            if price is None or price <= 0:
                continue
            
            checksum_data = f"{asset['ticker']}|{today}"
            checksum = hashlib.sha256(checksum_data.encode()).hexdigest()
            
            price_records.append({
                "asset_id": asset.get("id"),
                "ticker": asset["ticker"],
                "date": today,
                "close": float(price),
                "checksum": checksum,
                "provider": "twelvedata",
                "refresh_interval_minutes": REFRESH_INTERVALS.get(asset_class, 30)
            })
        
        logger.info(
            f"✅ {asset_class} complete: {len(price_records)}/{total_symbols} prices | "
            f"Credits used: {self.stats['total_credits_used']} | "
            f"Rate limit waits: {self.stats['rate_limit_waits']}"
        )
        
        return price_records, self.stats
    
    def get_credits_status(self) -> Dict:
        """Get current credit usage"""
        return self.credits_guard.get_status()


async def fetch_crypto_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch crypto prices from Twelve Data"""
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_for_class(assets, "crypto")


async def fetch_forex_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch forex prices from Twelve Data"""
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_for_class(assets, "forex")


async def fetch_stock_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch stock prices from Twelve Data"""
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_for_class(assets, "stock")


async def fetch_commodity_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch commodity prices from Twelve Data"""
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_for_class(assets, "commodity")


async def fetch_all_prices_twelvedata(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """
    Fetch all prices with strict rate limiting.
    Groups by asset class and processes with proper credit management.
    """
    all_prices = []
    combined_stats = {
        "fetched": 0,
        "failed": 0,
        "retries": 0,
        "rate_limit_waits": 0,
        "total_credits_used": 0,
        "by_class": {}
    }
    
    by_class = {}
    for asset in assets:
        ac = asset.get("asset_class", "stock").lower()
        if ac not in by_class:
            by_class[ac] = []
        by_class[ac].append(asset)
    
    async with TwelveDataPriceFetcher() as fetcher:
        for asset_class, class_assets in by_class.items():
            prices, stats = await fetcher.fetch_prices_for_class(class_assets, asset_class)
            all_prices.extend(prices)
            combined_stats["by_class"][asset_class] = {
                "total": len(class_assets),
                "fetched": len(prices),
                "failed": len(class_assets) - len(prices)
            }
        
        combined_stats["fetched"] = fetcher.stats["fetched"]
        combined_stats["failed"] = fetcher.stats["failed"]
        combined_stats["retries"] = fetcher.stats["retries"]
        combined_stats["rate_limit_waits"] = fetcher.stats["rate_limit_waits"]
        combined_stats["total_credits_used"] = fetcher.stats["total_credits_used"]
        combined_stats["errors"] = fetcher.stats["errors"][:10]
    
    return all_prices, combined_stats
