"""
Options Chain ETL Module

Fetches options data from available providers and inserts into Supabase options_flow table.

Provider Strategy:
- TwelveData: Does NOT support options chains (price quotes only)
- Alpha Vantage: Options data requires Premium tier ($149/month)
- Tradier: Requires TRADIER_TOKEN secret (not configured)

This module returns a clean no_data result when no provider is available,
rather than attempting blocked scraping.
"""
import hashlib
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
import httpx

from backend.config import settings
from backend.services.supabase_sync import SupabaseSync

logger = logging.getLogger(__name__)

# Request configuration
REQUEST_TIMEOUT = 15.0


class OptionsChainFetcher:
    """Fetches options chain data from available providers"""
    
    def __init__(self):
        self.session: Optional[httpx.AsyncClient] = None
        self.tradier_token = getattr(settings, 'TRADIER_TOKEN', None)
        self.alpha_vantage_key = getattr(settings, 'ALPHA_VANTAGE_API_KEY', None)
        
    async def __aenter__(self):
        self.session = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "OpportunityRadar/1.0"}
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
    
    def get_available_provider(self) -> Optional[str]:
        """Check which provider is available"""
        if self.tradier_token:
            return "tradier"
        # Note: TwelveData does NOT support options chains
        # Alpha Vantage options requires Premium tier
        return None
    
    async def fetch_tradier_options(self, ticker: str, debug: bool = False) -> List[Dict]:
        """
        Fetch options chain from Tradier API.
        
        Tradier endpoints:
        - GET /v1/markets/options/expirations?symbol={TICKER}
        - GET /v1/markets/options/chains?symbol={TICKER}&expiration={DATE}
        """
        if not self.tradier_token:
            return []
        
        headers = {
            "Authorization": f"Bearer {self.tradier_token}",
            "Accept": "application/json"
        }
        
        options = []
        
        try:
            # Step 1: Get expirations
            exp_response = await self.session.get(
                "https://api.tradier.com/v1/markets/options/expirations",
                params={"symbol": ticker, "includeAllRoots": "true"},
                headers=headers
            )
            
            if exp_response.status_code != 200:
                logger.warning(f"Tradier expirations failed for {ticker}: {exp_response.status_code}")
                return []
            
            exp_data = exp_response.json()
            expirations = exp_data.get("expirations", {}).get("date", [])
            
            if not expirations:
                if debug:
                    logger.info(f"[DEBUG] No expirations found for {ticker}")
                return []
            
            # Use nearest expiration
            expiration = expirations[0] if isinstance(expirations, list) else expirations
            
            if debug:
                logger.info(f"[DEBUG] {ticker}: {len(expirations) if isinstance(expirations, list) else 1} expirations, using {expiration}")
            
            # Step 2: Get options chain for that expiration
            chain_response = await self.session.get(
                "https://api.tradier.com/v1/markets/options/chains",
                params={"symbol": ticker, "expiration": expiration, "greeks": "false"},
                headers=headers
            )
            
            if chain_response.status_code != 200:
                logger.warning(f"Tradier chain failed for {ticker}: {chain_response.status_code}")
                return []
            
            chain_data = chain_response.json()
            contracts = chain_data.get("options", {}).get("option", [])
            
            if not contracts:
                return []
            
            # Ensure contracts is a list
            if isinstance(contracts, dict):
                contracts = [contracts]
            
            for contract in contracts:
                option = self._normalize_tradier_contract(contract, ticker, expiration)
                if option:
                    options.append(option)
            
            if debug:
                logger.info(f"[DEBUG] {ticker}: {len(contracts)} contracts, {len(options)} passed filter")
            
        except Exception as e:
            logger.error(f"Tradier fetch error for {ticker}: {str(e)}")
        
        return options
    
    def _normalize_tradier_contract(self, contract: Dict, ticker: str, expiration: str) -> Optional[Dict]:
        """Normalize Tradier contract to options_flow schema"""
        try:
            volume = contract.get("volume", 0) or 0
            
            # Filter: volume > 50
            if volume <= 50:
                return None
            
            option_type = contract.get("option_type", "call")  # call or put
            strike = contract.get("strike")
            open_interest = contract.get("open_interest")
            
            # Calculate premium from last price
            last_price = contract.get("last")
            premium = None
            if last_price and last_price > 0:
                premium = int(round(last_price * volume * 100))
            
            # Implied volatility (may not be available without greeks)
            iv = contract.get("greeks", {}).get("mid_iv") if contract.get("greeks") else None
            
            # Generate checksum for deduplication
            checksum_data = f"{ticker}|{expiration}|{strike}|{option_type}|{volume}"
            checksum = hashlib.sha256(checksum_data.encode()).hexdigest()[:32]
            
            return {
                "ticker": ticker,
                "option_type": option_type,
                "strike_price": float(strike) if strike else None,
                "expiration_date": expiration,
                "volume": volume,
                "open_interest": open_interest,
                "implied_volatility": iv,
                "premium": premium,
                "flow_type": None,  # Must be null per requirements
                "sentiment": "bullish" if option_type == "call" else "bearish",
                "trade_date": datetime.now(timezone.utc).isoformat(),
                "metadata": {
                    "source": "tradier",
                    "provider_endpoint": "chains",
                    "contract_symbol": contract.get("symbol"),
                    "checksum": checksum,
                }
            }
            
        except Exception as e:
            logger.debug(f"Contract normalization failed: {str(e)}")
            return None


async def run_options_chain_etl(
    tickers: List[str],
    debug: bool = False
) -> Dict:
    """
    Main ETL function for options chain ingestion.
    
    Returns:
        {
            inserted: int,
            source: str,
            reason?: str,
            details?: dict
        }
    """
    async with OptionsChainFetcher() as fetcher:
        provider = fetcher.get_available_provider()
        
        if not provider:
            reason = "no_supported_provider"
            details = {
                "explanation": "No options data provider configured",
                "tradier_configured": bool(fetcher.tradier_token),
                "note": "TwelveData does not support options chains. Alpha Vantage options requires Premium tier. Add TRADIER_TOKEN to enable options ingestion."
            }
            logger.warning(f"⚠️ Options ETL: {reason}")
            return {
                "inserted": 0,
                "source": "none",
                "reason": reason,
                "details": details
            }
        
        logger.info(f"📊 Using provider: {provider}")
        
        all_options = []
        per_ticker_stats = {}
        seen_checksums: Set[str] = set()
        duplicates_skipped = 0
        
        for ticker in tickers:
            ticker_options = []
            
            if provider == "tradier":
                ticker_options = await fetcher.fetch_tradier_options(ticker, debug=debug)
            
            # Deduplicate within run
            unique_options = []
            for opt in ticker_options:
                checksum = opt.get("metadata", {}).get("checksum", "")
                if checksum and checksum in seen_checksums:
                    duplicates_skipped += 1
                    continue
                if checksum:
                    seen_checksums.add(checksum)
                unique_options.append(opt)
            
            all_options.extend(unique_options)
            per_ticker_stats[ticker] = {
                "contracts_found": len(ticker_options),
                "contracts_passing_filter": len(unique_options),
            }
        
        if debug:
            logger.info(f"[DEBUG] Total options: {len(all_options)}, duplicates skipped: {duplicates_skipped}")
            logger.info(f"[DEBUG] Per-ticker: {per_ticker_stats}")
        
        if not all_options:
            return {
                "inserted": 0,
                "source": provider,
                "reason": "no contracts passed volume>50 filter",
                "details": {
                    "per_ticker": per_ticker_stats,
                    "duplicates_skipped": duplicates_skipped,
                }
            }
        
        # Insert to Supabase
        inserted = 0
        async with SupabaseSync() as sync:
            if not sync.is_configured:
                return {
                    "inserted": 0,
                    "source": provider,
                    "reason": "supabase_not_configured",
                    "details": {"error": "SUPABASE_URL or SUPABASE_SERVICE_KEY not set"}
                }
            
            # Insert in batches of 50
            for i in range(0, len(all_options), 50):
                batch = all_options[i:i+50]
                
                try:
                    response = await sync.session.post(
                        f"{sync.url}/rest/v1/options_flow",
                        json=batch
                    )
                    
                    if response.status_code in (200, 201, 204):
                        inserted += len(batch)
                    else:
                        logger.error(f"Insert batch failed: {response.status_code} - {response.text[:200]}")
                        
                except Exception as e:
                    logger.error(f"Insert batch error: {str(e)}")
        
        return {
            "inserted": inserted,
            "source": provider,
            "reason": None if inserted > 0 else "insert_failed",
            "details": {
                "per_ticker": per_ticker_stats,
                "total_contracts": len(all_options),
                "duplicates_skipped": duplicates_skipped,
            }
        }
