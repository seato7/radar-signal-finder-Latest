"""
Twelve Data Price ETL - SIMPLIFIED serial batch processing

No complex rate limiting - just simple sequential batches.
The scheduler controls the rate (40 symbols/min).
"""
import asyncio
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
import httpx
import logging

from backend.config import settings

logger = logging.getLogger(__name__)

# Twelve Data API configuration
TWELVEDATA_BASE_URL = "https://api.twelvedata.com"

# Simple configuration
MAX_SYMBOLS_PER_BATCH = 20   # Max symbols per API call
REQUEST_TIMEOUT = 30.0
MAX_RETRIES = 2
RETRY_DELAY = 3.0

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
    # Forex (keep as-is mostly)
    'EUR/USD': 'EUR/USD',
    'GBP/USD': 'GBP/USD',
    'USD/JPY': 'USD/JPY',
    'USD/CHF': 'USD/CHF',
    'AUD/USD': 'AUD/USD',
    'USD/CAD': 'USD/CAD',
    'NZD/USD': 'NZD/USD',
}


class TwelveDataPriceFetcher:
    """Simple price fetcher - no rate limiting logic, just fetch"""
    
    def __init__(self):
        self.session: Optional[httpx.AsyncClient] = None
        self.api_key = settings.TWELVEDATA_API_KEY
        self.stats = {
            "fetched": 0,
            "failed": 0,
            "retries": 0,
            "batches_processed": 0,
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
    
    async def _fetch_single_batch(self, symbols: List[str]) -> Dict[str, float]:
        """Fetch prices for a single batch of symbols"""
        if not symbols:
            return {}
        
        symbol_str = ",".join(symbols)
        params = {
            "symbol": symbol_str,
            "apikey": self.api_key
        }
        
        results = {}
        
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
                            price = float(data["price"])
                            if price > 0:
                                results[symbols[0]] = price
                                self.stats["fetched"] += 1
                            else:
                                self.stats["failed"] += 1
                        else:
                            self.stats["failed"] += 1
                            if "message" in data and len(self.stats["errors"]) < 10:
                                self.stats["errors"].append(f"{symbols[0]}: {data['message']}")
                    else:
                        for symbol, price_data in data.items():
                            if isinstance(price_data, dict):
                                if "price" in price_data:
                                    price = float(price_data["price"])
                                    if price > 0:
                                        results[symbol] = price
                                        self.stats["fetched"] += 1
                                    else:
                                        self.stats["failed"] += 1
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
                    wait = RETRY_DELAY * (2 ** attempt) + 5
                    logger.warning(f"⚠️ Rate limited! Waiting {wait}s (attempt {attempt + 1})")
                    await asyncio.sleep(wait)
                    continue
                
                else:
                    logger.error(f"API error: {response.status_code} - {response.text[:200]}")
                    self.stats["failed"] += len(symbols)
                    break
                    
            except httpx.TimeoutException:
                self.stats["retries"] += 1
                logger.warning(f"Timeout (attempt {attempt + 1})")
                await asyncio.sleep(RETRY_DELAY)
            except Exception as e:
                logger.error(f"Error: {str(e)}")
                self.stats["failed"] += len(symbols)
                break
        
        return results
    
    async def fetch_prices_batch(
        self,
        assets: List[Dict[str, str]]
    ) -> Tuple[List[Dict], Dict]:
        """
        Fetch prices for a batch of assets.
        Splits into sub-batches of 20 symbols max.
        """
        if not assets:
            return [], self.stats
        
        # Build ticker mapping (original ticker -> TD symbol)
        ticker_map = {}  # TD symbol -> original asset
        for asset in assets:
            asset_class = asset.get("asset_class", "stock").lower()
            td_symbol = self._normalize_ticker(asset["ticker"], asset_class)
            if td_symbol:
                ticker_map[td_symbol] = asset
        
        if not ticker_map:
            return [], self.stats
        
        symbols = list(ticker_map.keys())
        all_prices = {}
        
        # Process in batches of 20
        for i in range(0, len(symbols), MAX_SYMBOLS_PER_BATCH):
            batch = symbols[i:i + MAX_SYMBOLS_PER_BATCH]
            batch_num = (i // MAX_SYMBOLS_PER_BATCH) + 1
            total_batches = (len(symbols) + MAX_SYMBOLS_PER_BATCH - 1) // MAX_SYMBOLS_PER_BATCH
            
            logger.info(f"📦 Batch {batch_num}/{total_batches}: {len(batch)} symbols")
            
            batch_results = await self._fetch_single_batch(batch)
            all_prices.update(batch_results)
            
            # Small delay between batches (within same minute run)
            if i + MAX_SYMBOLS_PER_BATCH < len(symbols):
                await asyncio.sleep(1.5)
        
        # Convert to price records
        price_records = []
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        for td_symbol, price in all_prices.items():
            asset = ticker_map.get(td_symbol)
            if not asset or price <= 0:
                continue
            
            checksum_data = f"{asset['ticker']}|{today}|{price}"
            checksum = hashlib.sha256(checksum_data.encode()).hexdigest()[:32]
            
            price_records.append({
                "asset_id": asset.get("id"),
                "ticker": asset["ticker"],
                "date": today,
                "close": float(price),
                "checksum": checksum,
            })
        
        logger.info(
            f"✅ Fetch complete: {len(price_records)}/{len(assets)} prices"
        )
        
        return price_records, self.stats


# Convenience functions for backward compatibility
async def fetch_crypto_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch crypto prices"""
    crypto_assets = [a for a in assets if a.get("asset_class", "").lower() == "crypto"]
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_batch(crypto_assets)


async def fetch_forex_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch forex prices"""
    forex_assets = [a for a in assets if a.get("asset_class", "").lower() == "forex"]
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_batch(forex_assets)


async def fetch_stock_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch stock prices"""
    stock_assets = [a for a in assets if a.get("asset_class", "").lower() in ("stock", "equity", "etf", "index")]
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_batch(stock_assets)


async def fetch_commodity_prices(assets: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Fetch commodity prices"""
    commodity_assets = [a for a in assets if a.get("asset_class", "").lower() == "commodity"]
    async with TwelveDataPriceFetcher() as fetcher:
        return await fetcher.fetch_prices_batch(commodity_assets)


# Legacy function for compatibility
def get_credits_guard():
    """Deprecated - no longer using shared credits guard"""
    class DummyGuard:
        def get_status(self):
            return {"mode": "serial_queue", "note": "Rate limiting handled by scheduler"}
    return DummyGuard()
