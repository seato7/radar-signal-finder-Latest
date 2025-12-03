"""Yahoo Finance Price ETL - Robust price fetching with batching and retries"""
import asyncio
import hashlib
import random
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
import httpx
import logging

logger = logging.getLogger(__name__)

# Yahoo Finance API endpoint - use v8/finance/chart (more reliable)
YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart"

# Rate limiting config
BATCH_SIZE = 50
BATCH_DELAY_SECONDS = 1.0
REQUEST_TIMEOUT = 15.0
MAX_RETRIES = 3
RETRY_DELAY = 2.0

# User agents for rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
]


class YahooPriceFetcher:
    """Fetches prices from Yahoo Finance with batching and error handling"""
    
    def __init__(self):
        self.session: Optional[httpx.AsyncClient] = None
        self.stats = {
            "fetched": 0,
            "failed": 0,
            "retries": 0,
            "start_time": None,
            "end_time": None
        }
    
    async def __aenter__(self):
        self.session = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            headers=self._get_headers()
        )
        self.stats["start_time"] = datetime.now(timezone.utc)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
        self.stats["end_time"] = datetime.now(timezone.utc)
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers with random user agent"""
        return {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://finance.yahoo.com",
            "Origin": "https://finance.yahoo.com"
        }
    
    # Comprehensive ticker mappings for Yahoo Finance
    TICKER_MAPPINGS = {
        # Commodities - Yahoo uses futures symbols
        'CRUDE': 'CL=F',
        'BRENT': 'BZ=F',
        'NATGAS': 'NG=F',
        'XAUUSD': 'GC=F',
        'XAGUSD': 'SI=F',
        'XPTUSD': 'PL=F',
        'XPDUSD': 'PA=F',
        'COPPER': 'HG=F',
        'GOLD': 'GC=F',
        'SILVER': 'SI=F',
        'OIL': 'CL=F',
        'WTI': 'CL=F',
        'PLATINUM': 'PL=F',
        'PALLADIUM': 'PA=F',
        'LITHIUM': 'ALB',
        'COBALT': 'SBSW',
        'NICKEL': 'VALE',
        'URANIUM': 'CCJ',
        'STEEL': 'X',
        'ZINC': 'ZINC.L',
        'TIN': 'TIN.L',
        'RHODIUM': 'SBSW',
        'VIX': '^VIX',
        'LBS': 'LBS=F',
        'MWE': 'MWE=F',
        'ZO': 'ZO=F',
        'ZW': 'ZW=F',
        'WHEAT': 'ZW=F',
        'CORN': 'ZC=F',
        'SOYBEANS': 'ZS=F',
        'COFFEE': 'KC=F',
        'SUGAR': 'SB=F',
        'COTTON': 'CT=F',
        
        # Crypto USDT -> USD mappings
        'BTC/USDT': 'BTC-USD',
        'ETH/USDT': 'ETH-USD',
        'SOL/USDT': 'SOL-USD',
        'XRP/USDT': 'XRP-USD',
        'ADA/USDT': 'ADA-USD',
        'DOGE/USDT': 'DOGE-USD',
        'DOT/USDT': 'DOT-USD',
        'AVAX/USDT': 'AVAX-USD',
        'MATIC/USDT': 'MATIC-USD',
        'LINK/USDT': 'LINK-USD',
        'LTC/USDT': 'LTC-USD',
        'UNI/USDT': 'UNI-USD',
        'ATOM/USDT': 'ATOM-USD',
        'XLM/USDT': 'XLM-USD',
        'ALGO/USDT': 'ALGO-USD',
        'NEAR/USDT': 'NEAR-USD',
        'FIL/USDT': 'FIL-USD',
        'AAVE/USDT': 'AAVE-USD',
        'MANA/USDT': 'MANA-USD',
        'SAND/USDT': 'SAND-USD',
        'AXS/USDT': 'AXS-USD',
        'THETA/USDT': 'THETA-USD',
        'VET/USDT': 'VET-USD',
        'FTM/USDT': 'FTM-USD',
        'HBAR/USDT': 'HBAR-USD',
        'ICP/USDT': 'ICP-USD',
        'GRT/USDT': 'GRT-USD',
        'CRV/USDT': 'CRV-USD',
        'MKR/USDT': 'MKR-USD',
        'SNX/USDT': 'SNX-USD',
        'COMP/USDT': 'COMP-USD',
        'YFI/USDT': 'YFI-USD',
        'SUSHI/USDT': 'SUSHI-USD',
        'ENJ/USDT': 'ENJ-USD',
        'BAT/USDT': 'BAT-USD',
        'ZRX/USDT': 'ZRX-USD',
        'ZEC/USDT': 'ZEC-USD',
        'DASH/USDT': 'DASH-USD',
        'XMR/USDT': 'XMR-USD',
        'WAVES/USDT': 'WAVES-USD',
        'ZIL/USDT': 'ZIL-USD',
        'ONE/USDT': 'ONE-USD',
        'KAVA/USDT': 'KAVA-USD',
        'CELO/USDT': 'CELO-USD',
        'ANKR/USDT': 'ANKR-USD',
        'STORJ/USDT': 'STORJ-USD',
        'SKL/USDT': 'SKL-USD',
        'REN/USDT': 'REN-USD',
        'BAND/USDT': 'BAND-USD',
        'BAL/USDT': 'BAL-USD',
        'APE/USDT': 'APE-USD',
        'OP/USDT': 'OP-USD',
        'ARB/USDT': 'ARB-USD',
        'IMX/USDT': 'IMX-USD',
        'LDO/USDT': 'LDO-USD',
        'APT/USDT': 'APT-USD',
        'SHIB/USDT': 'SHIB-USD',
        'PEPE/USDT': 'PEPE-USD',
        'FLOKI/USDT': 'FLOKI-USD',
        'BNB/USDT': 'BNB-USD',
        'TRX/USDT': 'TRX-USD',
        'EGLD/USDT': 'EGLD-USD',
        'FLOW/USDT': 'FLOW-USD',
        'MINA/USDT': 'MINA-USD',
        'OCEAN/USDT': 'OCEAN-USD',
        'FET/USDT': 'FET-USD',
        'AGIX/USDT': 'AGIX-USD',
        'RUNE/USDT': 'RUNE-USD',
        'GALA/USDT': 'GALA-USD',
        'ROSE/USDT': 'ROSE-USD',
        'CKB/USDT': 'CKB-USD',
        'ICX/USDT': 'ICX-USD',
        'DCR/USDT': 'DCR-USD',
        '1INCH/USDT': '1INCH-USD',
        'STRK/USDT': 'STRK-USD',
    }
    
    def _normalize_ticker(self, ticker: str, asset_class: str) -> str:
        """Convert ticker to Yahoo Finance format"""
        ticker = ticker.upper().strip()
        
        # Check direct mapping first
        if ticker in self.TICKER_MAPPINGS:
            return self.TICKER_MAPPINGS[ticker]
        
        # Crypto: Convert USDT to USD or add -USD suffix
        if asset_class == "crypto":
            if '/USDT' in ticker:
                return ticker.replace('/USDT', '-USD')
            if '/USD' in ticker:
                return ticker.replace('/USD', '-USD')
            if not ticker.endswith("-USD"):
                return f"{ticker}-USD"
            return ticker
        
        # Forex: EUR/USD -> EURUSD=X
        if asset_class == "forex":
            ticker = ticker.replace("/", "")
            if not ticker.endswith("=X"):
                return f"{ticker}=X"
            return ticker
        
        # Commodities - add futures suffix if short ticker
        if asset_class == "commodity" and len(ticker) <= 6 and not ticker.endswith('=F'):
            return f"{ticker}=F"
        
        return ticker
    
    async def _fetch_single_ticker(self, yahoo_ticker: str) -> Optional[Dict]:
        """Fetch price for a single ticker using chart endpoint"""
        url = f"{YAHOO_CHART_URL}/{yahoo_ticker}"
        
        for attempt in range(MAX_RETRIES):
            try:
                # Rotate headers for each request
                self.session.headers.update(self._get_headers())
                
                response = await self.session.get(
                    url,
                    params={"range": "1d", "interval": "1d"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    result = data.get("chart", {}).get("result", [])
                    
                    if result and len(result) > 0:
                        meta = result[0].get("meta", {})
                        indicators = result[0].get("indicators", {})
                        quote = indicators.get("quote", [{}])[0] if indicators.get("quote") else {}
                        
                        # Get the latest close price
                        close_prices = quote.get("close", [])
                        price = meta.get("regularMarketPrice") or (close_prices[-1] if close_prices else None)
                        
                        if price is not None:
                            return {
                                "price": float(price),
                                "change": meta.get("regularMarketChange", 0),
                                "change_percent": meta.get("regularMarketChangePercent", 0),
                                "volume": meta.get("regularMarketVolume"),
                                "market_cap": meta.get("marketCap"),
                                "high_52w": meta.get("fiftyTwoWeekHigh"),
                                "low_52w": meta.get("fiftyTwoWeekLow"),
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }
                    return None
                
                elif response.status_code == 429:
                    # Rate limited - wait and retry
                    self.stats["retries"] += 1
                    await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                    continue
                elif response.status_code == 404:
                    # Ticker not found - don't retry
                    logger.debug(f"Ticker {yahoo_ticker} not found on Yahoo")
                    return None
                else:
                    logger.warning(f"Yahoo API returned {response.status_code} for {yahoo_ticker}")
                    
            except httpx.TimeoutException:
                self.stats["retries"] += 1
                logger.warning(f"Timeout fetching {yahoo_ticker} (attempt {attempt + 1})")
                await asyncio.sleep(RETRY_DELAY)
            except Exception as e:
                logger.error(f"Error fetching {yahoo_ticker}: {str(e)}")
                break
        
        return None
    
    async def _fetch_batch(self, tickers: List[str]) -> Dict[str, Dict]:
        """Fetch prices for a batch of tickers sequentially"""
        results = {}
        
        for ticker in tickers:
            price_data = await self._fetch_single_ticker(ticker)
            if price_data:
                results[ticker] = price_data
                self.stats["fetched"] += 1
            else:
                self.stats["failed"] += 1
            
            # Small delay between individual requests
            await asyncio.sleep(0.1)
        
        return results
    
    async def fetch_prices(
        self, 
        assets: List[Dict[str, str]]
    ) -> Tuple[List[Dict], Dict]:
        """
        Fetch prices for all assets with batching.
        
        Args:
            assets: List of {"ticker": str, "asset_class": str, "id": str}
        
        Returns:
            Tuple of (price_records, stats)
        """
        if not assets:
            return [], self.stats
        
        # Build ticker mapping
        ticker_map = {}  # yahoo_ticker -> original asset
        for asset in assets:
            yahoo_ticker = self._normalize_ticker(
                asset["ticker"], 
                asset.get("asset_class", "stock")
            )
            ticker_map[yahoo_ticker] = asset
        
        yahoo_tickers = list(ticker_map.keys())
        all_prices = {}
        
        # Process in batches
        for i in range(0, len(yahoo_tickers), BATCH_SIZE):
            batch = yahoo_tickers[i:i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(yahoo_tickers) + BATCH_SIZE - 1) // BATCH_SIZE
            logger.info(f"Fetching batch {batch_num}/{total_batches}")
            
            batch_results = await self._fetch_batch(batch)
            all_prices.update(batch_results)
            
            # Rate limit between batches
            if i + BATCH_SIZE < len(yahoo_tickers):
                await asyncio.sleep(BATCH_DELAY_SECONDS)
        
        # Convert to price records
        price_records = []
        for yahoo_ticker, price_data in all_prices.items():
            asset = ticker_map.get(yahoo_ticker)
            if not asset:
                continue
            
            # Generate checksum for deduplication
            checksum_data = f"{asset['ticker']}|{price_data['price']}|{price_data['timestamp'][:10]}"
            checksum = hashlib.sha256(checksum_data.encode()).hexdigest()
            
            price_records.append({
                "asset_id": asset.get("id"),
                "ticker": asset["ticker"],
                "price": price_data["price"],
                "change_24h": price_data.get("change"),
                "change_percent_24h": price_data.get("change_percent"),
                "volume_24h": price_data.get("volume"),
                "market_cap": price_data.get("market_cap"),
                "high_52w": price_data.get("high_52w"),
                "low_52w": price_data.get("low_52w"),
                "source": "yahoo_finance",
                "fetched_at": price_data["timestamp"],
                "checksum": checksum
            })
        
        return price_records, self.stats


async def fetch_all_prices(assets: List[Dict[str, str]]) -> Tuple[List[Dict], Dict]:
    """
    Main entry point for fetching prices.
    
    Args:
        assets: List of asset dictionaries with ticker, asset_class, id
    
    Returns:
        Tuple of (price_records, stats)
    """
    async with YahooPriceFetcher() as fetcher:
        return await fetcher.fetch_prices(assets)
