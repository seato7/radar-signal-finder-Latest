"""Yahoo Finance Price ETL - Robust price fetching with batching and retries"""
import asyncio
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
import httpx
import logging

logger = logging.getLogger(__name__)

# Yahoo Finance API endpoints
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart"

# Rate limiting config
BATCH_SIZE = 50
BATCH_DELAY_SECONDS = 1.0
REQUEST_TIMEOUT = 15.0
MAX_RETRIES = 3
RETRY_DELAY = 2.0


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
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        )
        self.stats["start_time"] = datetime.now(timezone.utc)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
        self.stats["end_time"] = datetime.now(timezone.utc)
    
    def _normalize_ticker(self, ticker: str, asset_class: str) -> str:
        """Convert ticker to Yahoo Finance format"""
        ticker = ticker.upper().strip()
        
        # Crypto: BTC -> BTC-USD
        if asset_class == "crypto":
            if not ticker.endswith("-USD"):
                return f"{ticker}-USD"
            return ticker
        
        # Forex: EUR/USD -> EURUSD=X
        if asset_class == "forex":
            ticker = ticker.replace("/", "")
            if not ticker.endswith("=X"):
                return f"{ticker}=X"
            return ticker
        
        # Commodities mapping
        commodity_map = {
            "GOLD": "GC=F",
            "SILVER": "SI=F",
            "OIL": "CL=F",
            "CRUDE": "CL=F",
            "WTI": "CL=F",
            "BRENT": "BZ=F",
            "NATGAS": "NG=F",
            "COPPER": "HG=F",
            "PLATINUM": "PL=F",
            "PALLADIUM": "PA=F",
            "WHEAT": "ZW=F",
            "CORN": "ZC=F",
            "SOYBEANS": "ZS=F",
            "COFFEE": "KC=F",
            "SUGAR": "SB=F",
            "COTTON": "CT=F",
        }
        if asset_class == "commodity" and ticker in commodity_map:
            return commodity_map[ticker]
        
        return ticker
    
    async def _fetch_batch(self, tickers: List[str]) -> Dict[str, Dict]:
        """Fetch prices for a batch of tickers"""
        if not tickers:
            return {}
        
        symbols = ",".join(tickers)
        results = {}
        
        for attempt in range(MAX_RETRIES):
            try:
                response = await self.session.get(
                    YAHOO_QUOTE_URL,
                    params={
                        "symbols": symbols,
                        "fields": "regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketTime,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    quotes = data.get("quoteResponse", {}).get("result", [])
                    
                    for quote in quotes:
                        symbol = quote.get("symbol", "")
                        price = quote.get("regularMarketPrice")
                        
                        if symbol and price is not None:
                            results[symbol] = {
                                "price": float(price),
                                "change": quote.get("regularMarketChange", 0),
                                "change_percent": quote.get("regularMarketChangePercent", 0),
                                "volume": quote.get("regularMarketVolume"),
                                "market_cap": quote.get("marketCap"),
                                "high_52w": quote.get("fiftyTwoWeekHigh"),
                                "low_52w": quote.get("fiftyTwoWeekLow"),
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }
                    
                    self.stats["fetched"] += len(results)
                    return results
                
                elif response.status_code == 429:
                    # Rate limited - wait and retry
                    self.stats["retries"] += 1
                    await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                    continue
                else:
                    logger.warning(f"Yahoo API returned {response.status_code} for batch")
                    
            except httpx.TimeoutException:
                self.stats["retries"] += 1
                logger.warning(f"Timeout fetching batch (attempt {attempt + 1})")
                await asyncio.sleep(RETRY_DELAY)
            except Exception as e:
                logger.error(f"Error fetching batch: {str(e)}")
                break
        
        self.stats["failed"] += len(tickers)
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
            logger.info(f"Fetching batch {i // BATCH_SIZE + 1}/{(len(yahoo_tickers) + BATCH_SIZE - 1) // BATCH_SIZE}")
            
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
