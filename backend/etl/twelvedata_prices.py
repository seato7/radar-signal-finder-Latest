"""Twelve Data Price ETL - Professional price fetching with rate limiting and batching"""
import asyncio
import hashlib
import os
import time
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
import httpx
import logging

logger = logging.getLogger(__name__)

# Twelve Data API configuration
TWELVEDATA_BASE_URL = "https://api.twelvedata.com"
TWELVEDATA_API_KEY = os.getenv("TWELVEDATA_API_KEY")

# Rate limiting: 55 API credits per minute on Grow plan
# Each symbol = 1 credit, so we track credits per minute
MAX_CREDITS_PER_MINUTE = 55
BATCH_SIZE = 50  # Symbols per request (conservative, max is ~120)
REQUEST_TIMEOUT = 30.0
MAX_RETRIES = 3
RETRY_DELAY = 2.0

# Ticker normalization mappings for Twelve Data
TICKER_MAPPINGS = {
    # Commodities - Twelve Data uses specific symbols
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
    
    # Common forex corrections
    'EUR/USD': 'EUR/USD',
    'GBP/USD': 'GBP/USD',
    'USD/JPY': 'USD/JPY',
    'USD/CHF': 'USD/CHF',
    'AUD/USD': 'AUD/USD',
    'USD/CAD': 'USD/CAD',
    'NZD/USD': 'NZD/USD',
}

# Asset class to refresh interval mapping (in minutes)
REFRESH_INTERVALS = {
    'crypto': 10,
    'forex': 10,
    'stock': 30,
    'equity': 30,
    'commodity': 30,
    'index': 30,
    'etf': 30,
}


class TwelveDataCreditsTracker:
    """Track API credits usage to stay within rate limits"""
    
    def __init__(self, max_credits_per_minute: int = MAX_CREDITS_PER_MINUTE):
        self.max_credits = max_credits_per_minute
        self.credits_used = 0
        self.minute_start = time.time()
    
    def _reset_if_new_minute(self):
        """Reset counter if we're in a new minute"""
        now = time.time()
        if now - self.minute_start >= 60:
            self.credits_used = 0
            self.minute_start = now
    
    async def acquire_credits(self, count: int) -> float:
        """
        Request credits. Returns wait time in seconds if we need to wait,
        or 0 if we can proceed immediately.
        """
        self._reset_if_new_minute()
        
        if self.credits_used + count <= self.max_credits:
            self.credits_used += count
            return 0.0
        
        # Need to wait until next minute
        wait_time = 60 - (time.time() - self.minute_start) + 1  # +1s buffer
        return max(0, wait_time)
    
    def record_usage(self, count: int):
        """Record actual credits used"""
        self._reset_if_new_minute()
        self.credits_used += count
    
    def get_status(self) -> Dict:
        """Get current credit usage status"""
        self._reset_if_new_minute()
        return {
            "credits_used_this_minute": self.credits_used,
            "credits_remaining": self.max_credits - self.credits_used,
            "max_credits_per_minute": self.max_credits
        }


class TwelveDataPriceFetcher:
    """Fetches prices from Twelve Data with rate limiting and batching"""
    
    def __init__(self):
        self.session: Optional[httpx.AsyncClient] = None
        self.api_key = TWELVEDATA_API_KEY
        self.credits_tracker = TwelveDataCreditsTracker()
        self.stats = {
            "fetched": 0,
            "failed": 0,
            "retries": 0,
            "rate_limit_waits": 0,
            "start_time": None,
            "end_time": None,
            "errors": []
        }
    
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
        
        # Check direct mapping first
        if ticker in TICKER_MAPPINGS:
            return TICKER_MAPPINGS[ticker]
        
        # Crypto: Convert USDT pairs to USD
        if asset_class == "crypto":
            if '/USDT' in ticker:
                return ticker.replace('/USDT', '/USD')
            if '/USD' not in ticker and '-USD' not in ticker:
                # Add /USD suffix for crypto
                base = ticker.replace('-', '').replace('/', '')
                return f"{base}/USD"
            return ticker.replace('-', '/')
        
        # Forex: Ensure proper format
        if asset_class == "forex":
            ticker = ticker.replace("=X", "")  # Remove Yahoo suffix
            if '/' not in ticker and len(ticker) == 6:
                # Convert EURUSD to EUR/USD
                return f"{ticker[:3]}/{ticker[3:]}"
            return ticker
        
        # Stocks/ETFs: Return as-is
        return ticker
    
    async def _fetch_batch(self, symbols: List[str], asset_class: str) -> Dict[str, Dict]:
        """
        Fetch prices for a batch of symbols.
        Returns dict of symbol -> price data
        """
        if not symbols:
            return {}
        
        # Wait for credits if needed
        credits_needed = len(symbols)
        wait_time = await self.credits_tracker.acquire_credits(credits_needed)
        
        if wait_time > 0:
            self.stats["rate_limit_waits"] += 1
            logger.info(f"Rate limit: waiting {wait_time:.1f}s before batch of {len(symbols)} symbols")
            await asyncio.sleep(wait_time)
            # Re-acquire after waiting
            await self.credits_tracker.acquire_credits(credits_needed)
        
        # Build request
        symbol_str = ",".join(symbols)
        
        # Choose endpoint based on asset class
        if asset_class in ("crypto", "forex"):
            endpoint = "/price"
        else:
            endpoint = "/price"
        
        params = {
            "symbol": symbol_str,
            "apikey": self.api_key
        }
        
        results = {}
        
        for attempt in range(MAX_RETRIES):
            try:
                response = await self.session.get(
                    f"{TWELVEDATA_BASE_URL}{endpoint}",
                    params=params
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Handle single symbol response
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
                        # Multi-symbol response
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
                                    self.stats["errors"].append(f"{symbol}: {price_data['message']}")
                                else:
                                    self.stats["failed"] += 1
                    
                    break
                
                elif response.status_code == 429:
                    # Rate limited - wait and retry
                    self.stats["retries"] += 1
                    wait = RETRY_DELAY * (2 ** attempt)
                    logger.warning(f"Rate limited by Twelve Data, waiting {wait}s")
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
        Fetch prices for a specific asset class.
        Distributes requests to stay within rate limits.
        """
        if not assets:
            return [], self.stats
        
        # Normalize tickers
        ticker_map = {}  # twelvedata_symbol -> original asset
        for asset in assets:
            td_symbol = self._normalize_ticker(asset["ticker"], asset_class)
            if td_symbol:
                ticker_map[td_symbol] = asset
        
        if not ticker_map:
            return [], self.stats
        
        symbols = list(ticker_map.keys())
        all_prices = {}
        
        # Process in batches
        for i in range(0, len(symbols), BATCH_SIZE):
            batch = symbols[i:i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1
            total_batches = (len(symbols) + BATCH_SIZE - 1) // BATCH_SIZE
            
            logger.info(f"Fetching {asset_class} batch {batch_num}/{total_batches} ({len(batch)} symbols)")
            
            batch_results = await self._fetch_batch(batch, asset_class)
            all_prices.update(batch_results)
            
            # Small delay between batches to spread load
            if i + BATCH_SIZE < len(symbols):
                await asyncio.sleep(0.5)
        
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
            
            # Generate checksum
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
        
        return price_records, self.stats
    
    def get_credits_status(self) -> Dict:
        """Get current credit usage"""
        return self.credits_tracker.get_status()


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
    Fetch all prices from Twelve Data with proper rate limiting.
    Groups by asset class and processes sequentially to respect rate limits.
    """
    all_prices = []
    combined_stats = {
        "fetched": 0,
        "failed": 0,
        "retries": 0,
        "rate_limit_waits": 0,
        "by_class": {}
    }
    
    # Group assets by class
    by_class = {}
    for asset in assets:
        ac = asset.get("asset_class", "stock").lower()
        if ac not in by_class:
            by_class[ac] = []
        by_class[ac].append(asset)
    
    # Process each class
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
        combined_stats["errors"] = fetcher.stats["errors"][:10]  # Limit error list
    
    return all_prices, combined_stats
