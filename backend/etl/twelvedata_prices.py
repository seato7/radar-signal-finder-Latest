"""
Twelve Data Price ETL - SIMPLIFIED serial batch processing

No complex rate limiting - just simple sequential batches.
The scheduler controls the rate (40 symbols/min).

Now includes per-ticker ingestion logging to price_ingestion_log table.
"""
import asyncio
import hashlib
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple, Set
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
    # === COMMODITIES - Precious Metals ===
    'XAUUSD': 'XAU/USD',
    'XAGUSD': 'XAG/USD',
    'XPTUSD': 'XPT/USD',
    'XPDUSD': 'XPD/USD',
    'GOLD': 'XAU/USD',
    'SILVER': 'XAG/USD',
    'PLATINUM': 'XPT/USD',
    'PALLADIUM': 'XPD/USD',
    'GC': 'GC1',       # Gold futures
    'SI': 'SI1',       # Silver futures
    'PL': 'PL1',       # Platinum futures
    'PA': 'PA1',       # Palladium futures
    
    # === COMMODITIES - Energy ===
    'CRUDE': 'CL1',
    'BRENT': 'BRN1',
    'NATGAS': 'NG1',
    'OIL': 'CL1',
    'WTI': 'CL1',
    'CL': 'CL1',       # Crude Oil
    'BZ': 'BZ1',       # Brent Crude
    'NG': 'NG1',       # Natural Gas
    'HO': 'HO1',       # Heating Oil
    'RB': 'RB1',       # RBOB Gasoline
    'NG1': 'NG1',
    'CL1': 'CL1',
    'BRN1': 'BRN1',
    
    # === COMMODITIES - Industrial Metals ===
    'COPPER': 'HG1',
    'HG': 'HG1',       # Copper
    'HG1': 'HG1',
    'ALI': 'ALI',      # Aluminum (may not be supported)
    
    # === COMMODITIES - Agricultural ===
    'WHEAT': 'ZW1',
    'CORN': 'ZC1',
    'SOYBEANS': 'ZS1',
    'COFFEE': 'KC1',
    'SUGAR': 'SB1',
    'COTTON': 'CT1',
    'ZW': 'ZW1',       # Wheat
    'ZC': 'ZC1',       # Corn
    'ZS': 'ZS1',       # Soybeans
    'ZL': 'ZL1',       # Soybean Oil
    'ZM': 'ZM1',       # Soybean Meal
    'ZO': 'ZO1',       # Oats
    'ZR': 'ZR1',       # Rice
    'KC': 'KC1',       # Coffee
    'SB': 'SB1',       # Sugar
    'CT': 'CT1',       # Cotton
    'CC': 'CC1',       # Cocoa
    'OJ': 'OJ1',       # Orange Juice
    'LBS': 'LBS1',     # Lumber
    
    # === COMMODITIES - Livestock ===
    'LE': 'LE1',       # Live Cattle
    'HE': 'HE1',       # Lean Hogs
    'GF': 'GF1',       # Feeder Cattle
    
    # === INDEX FUTURES ===
    'ES': 'ES1',       # S&P 500 E-mini
    'NQ': 'NQ1',       # NASDAQ E-mini
    'YM': 'YM1',       # Dow E-mini
    'RTY': 'RTY1',     # Russell 2000 E-mini
    'VIX': 'VIX',      # Volatility Index
    
    # === FOREX - Major Pairs ===
    'EUR/USD': 'EUR/USD',
    'GBP/USD': 'GBP/USD',
    'USD/JPY': 'USD/JPY',
    'USD/CHF': 'USD/CHF',
    'AUD/USD': 'AUD/USD',
    'USD/CAD': 'USD/CAD',
    'NZD/USD': 'NZD/USD',
}

# Crypto cross-pairs that TwelveData does NOT support (skip these)
UNSUPPORTED_CRYPTO_CROSS_PAIRS: Set[str] = {
    'AAVE/ETH', 'AAVEETH', 'AVAX/ETH', 'AVAXETH',
    'BTC/EUR', 'BTCEUR', 'DOT/BTC', 'DOTBTC',
    'ETH/BTC', 'ETHBTC', 'ETH/EUR', 'ETHEUR',
    'LINK/ETH', 'LINKETH', 'LTC/BTC', 'LTCBTC',
    'MATIC/ETH', 'MATICETH', 'SOL/ETH', 'SOLETH',
    'UNI/ETH', 'UNIETH', 'XRP/BTC', 'XRPBTC',
    'XRP/EUR', 'XRPEUR', 'ADA/BTC', 'ADABTC',
}

# Commodities that TwelveData likely doesn't support (exotic/rare)
UNSUPPORTED_COMMODITIES: Set[str] = {
    'COBALT', 'LITHIUM', 'RHODIUM', 'URANIUM', 'STEEL',
    'IRON', 'LEAD', 'NICKEL', 'TIN', 'ZINC',
    'MWE', 'QA', 'DC',  # Exotic futures
}


class TwelveDataPriceFetcher:
    """Simple price fetcher - no rate limiting logic, just fetch"""
    
    def __init__(self, run_id: Optional[str] = None):
        self.session: Optional[httpx.AsyncClient] = None
        self.api_key = settings.TWELVEDATA_API_KEY
        self.run_id = run_id or str(uuid.uuid4())  # Unique ID for this batch run
        self.stats = {
            "fetched": 0,
            "failed": 0,
            "skipped_unsupported": 0,
            "retries": 0,
            "batches_processed": 0,
            "start_time": None,
            "end_time": None,
            "errors": [],
            "failed_tickers": [],      # Detailed list of failed tickers
            "skipped_tickers": [],     # Tickers skipped as unsupported
        }
        # Per-ticker ingestion logs for price_ingestion_log table
        self.ingestion_logs: List[Dict] = []
    
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
        
        # Log summary of failures
        if self.stats["failed_tickers"]:
            logger.warning(
                f"❌ Failed tickers ({len(self.stats['failed_tickers'])}): "
                f"{self.stats['failed_tickers'][:20]}..."  # Log first 20
            )
        if self.stats["skipped_tickers"]:
            logger.info(
                f"⏭️ Skipped unsupported ({len(self.stats['skipped_tickers'])}): "
                f"{self.stats['skipped_tickers'][:10]}..."
            )
    
    def _normalize_ticker(self, ticker: str, asset_class: str) -> Optional[str]:
        """
        Convert ticker to Twelve Data format.
        Returns None if ticker is known to be unsupported.
        """
        ticker_upper = ticker.upper().strip()
        original_ticker = ticker_upper
        
        # Check if explicitly mapped
        if ticker_upper in TICKER_MAPPINGS:
            return TICKER_MAPPINGS[ticker_upper]
        
        # Handle CRYPTO
        if asset_class == "crypto":
            # Skip known unsupported cross-pairs
            clean_ticker = ticker_upper.replace('/', '').replace('-', '')
            if ticker_upper in UNSUPPORTED_CRYPTO_CROSS_PAIRS or clean_ticker in UNSUPPORTED_CRYPTO_CROSS_PAIRS:
                self.stats["skipped_unsupported"] += 1
                self.stats["skipped_tickers"].append(f"{original_ticker} (cross-pair)")
                return None
            
            # Check for cross-pairs (ETH, BTC, EUR base) - skip them
            if any(cross in ticker_upper for cross in ['/ETH', '/BTC', '/EUR', 'ETH/', 'BTC/']):
                if '/USD' not in ticker_upper:
                    self.stats["skipped_unsupported"] += 1
                    self.stats["skipped_tickers"].append(f"{original_ticker} (cross-pair)")
                    return None
            
            # Convert USDT pairs to USD
            if '/USDT' in ticker_upper:
                return ticker_upper.replace('/USDT', '/USD')
            
            # Add /USD if not present
            if '/USD' not in ticker_upper and '-USD' not in ticker_upper:
                base = ticker_upper.replace('-', '').replace('/', '')
                return f"{base}/USD"
            
            return ticker_upper.replace('-', '/')
        
        # Handle FOREX
        if asset_class == "forex":
            ticker_upper = ticker_upper.replace("=X", "")
            if '/' not in ticker_upper and len(ticker_upper) == 6:
                return f"{ticker_upper[:3]}/{ticker_upper[3:]}"
            return ticker_upper
        
        # Handle COMMODITY
        if asset_class == "commodity":
            # Skip known unsupported commodities
            if ticker_upper in UNSUPPORTED_COMMODITIES:
                self.stats["skipped_unsupported"] += 1
                self.stats["skipped_tickers"].append(f"{original_ticker} (unsupported commodity)")
                return None
            
            # Return as-is for stocks/commodities not in mapping
            return ticker_upper
        
        # STOCK - return as-is
        return ticker_upper
    
    async def _fetch_single_batch(self, symbols: List[str], ticker_map: Dict) -> Dict[str, float]:
        """Fetch prices for a single batch of symbols"""
        if not symbols:
            return {}
        
        symbol_str = ",".join(symbols)
        params = {
            "symbol": symbol_str,
            "apikey": self.api_key
        }
        
        results = {}
        response_code = None
        
        for attempt in range(MAX_RETRIES):
            try:
                response = await self.session.get(
                    f"{TWELVEDATA_BASE_URL}/price",
                    params=params
                )
                response_code = response.status_code
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if len(symbols) == 1:
                        if "price" in data:
                            price = float(data["price"])
                            if price > 0:
                                results[symbols[0]] = price
                                self.stats["fetched"] += 1
                                self._record_ingestion_log(
                                    symbols[0], ticker_map, response_code,
                                    vendor_status="ok", rows_inserted=1,
                                    newest_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                                    raw_excerpt={"price": price}
                                )
                            else:
                                self._record_failure(symbols[0], ticker_map, "zero price", response_code)
                        else:
                            error_msg = data.get("message", "unknown error")
                            vendor_status = "invalid_symbol" if "not found" in error_msg.lower() or "symbol" in error_msg.lower() else "no_data"
                            self._record_failure(symbols[0], ticker_map, error_msg, response_code, vendor_status)
                    else:
                        for symbol, price_data in data.items():
                            if isinstance(price_data, dict):
                                if "price" in price_data:
                                    price = float(price_data["price"])
                                    if price > 0:
                                        results[symbol] = price
                                        self.stats["fetched"] += 1
                                        self._record_ingestion_log(
                                            symbol, ticker_map, response_code,
                                            vendor_status="ok", rows_inserted=1,
                                            newest_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                                            raw_excerpt={"price": price}
                                        )
                                    else:
                                        self._record_failure(symbol, ticker_map, "zero price", response_code)
                                elif "message" in price_data:
                                    error_msg = price_data["message"]
                                    vendor_status = "invalid_symbol" if "not found" in error_msg.lower() or "symbol" in error_msg.lower() else "no_data"
                                    self._record_failure(symbol, ticker_map, error_msg, response_code, vendor_status)
                                else:
                                    self._record_failure(symbol, ticker_map, "no price data", response_code, "no_data")
                    
                    self.stats["batches_processed"] += 1
                    break
                
                elif response.status_code == 429:
                    self.stats["retries"] += 1
                    wait = RETRY_DELAY * (2 ** attempt) + 5
                    logger.warning(f"⚠️ Rate limited! Waiting {wait}s (attempt {attempt + 1})")
                    # Log rate limit for all symbols in batch
                    for sym in symbols:
                        self._record_failure(sym, ticker_map, "rate limited", response_code, "rate_limited")
                    await asyncio.sleep(wait)
                    continue
                
                else:
                    logger.error(f"API error: {response.status_code} - {response.text[:200]}")
                    for sym in symbols:
                        self._record_failure(sym, ticker_map, f"HTTP {response.status_code}", response_code, "error")
                    break
                    
            except httpx.TimeoutException:
                self.stats["retries"] += 1
                logger.warning(f"Timeout (attempt {attempt + 1})")
                for sym in symbols:
                    self._record_failure(sym, ticker_map, "timeout", None, "error")
                await asyncio.sleep(RETRY_DELAY)
            except Exception as e:
                logger.error(f"Error: {str(e)}")
                for sym in symbols:
                    self._record_failure(sym, ticker_map, str(e), None, "error")
                break
        
        return results
    
    def _record_ingestion_log(
        self,
        td_symbol: str,
        ticker_map: Dict,
        response_code: Optional[int],
        vendor_status: str,
        rows_inserted: int = 0,
        newest_date: Optional[str] = None,
        error_message: str = "",
        raw_excerpt: Optional[Dict] = None
    ):
        """Record a per-ticker ingestion log entry"""
        asset = ticker_map.get(td_symbol, {})
        original_ticker = asset.get("ticker", td_symbol) if asset else td_symbol
        
        self.ingestion_logs.append({
            "run_id": self.run_id,
            "vendor": "twelvedata",
            "ticker": original_ticker,
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "response_code": response_code,
            "vendor_status": vendor_status,
            "rows_inserted": rows_inserted,
            "newest_date_returned": newest_date,
            "error_message": error_message[:500] if error_message else "",
            "raw": raw_excerpt or {}
        })
    
    def _record_failure(
        self,
        td_symbol: str,
        ticker_map: Dict,
        error_msg: str,
        response_code: Optional[int] = None,
        vendor_status: str = "error"
    ):
        """Record a failed ticker with details"""
        self.stats["failed"] += 1
        
        # Get original ticker name
        asset = ticker_map.get(td_symbol, {})
        original_ticker = asset.get("ticker", td_symbol) if asset else td_symbol
        asset_class = asset.get("asset_class", "unknown") if asset else "unknown"
        
        # Store detailed failure info
        failure_info = f"{original_ticker}({asset_class}): {error_msg[:50]}"
        
        if len(self.stats["failed_tickers"]) < 100:  # Limit storage
            self.stats["failed_tickers"].append(failure_info)
        
        if len(self.stats["errors"]) < 20:
            self.stats["errors"].append(f"{td_symbol}: {error_msg}")
        
        # Record to ingestion log
        self._record_ingestion_log(
            td_symbol, ticker_map, response_code,
            vendor_status=vendor_status,
            rows_inserted=0,
            error_message=error_msg,
            raw_excerpt={"error": error_msg[:100]}
        )
    
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
        
        # Build ticker mapping (TD symbol -> original asset)
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
            
            batch_results = await self._fetch_single_batch(batch, ticker_map)
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
        
        # Log comprehensive summary
        total_input = len(assets)
        skipped = self.stats["skipped_unsupported"]
        total_input - skipped
        succeeded = len(price_records)
        failed = self.stats["failed"]
        
        logger.info(
            f"✅ Fetch complete: {succeeded}/{total_input} prices "
            f"(skipped {skipped} unsupported, {failed} failed)"
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
