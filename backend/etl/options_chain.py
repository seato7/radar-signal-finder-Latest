"""
Options Chain ETL Module

Fetches options data from available providers and inserts into Supabase options_flow table.

Provider Status (as of implementation):
- TwelveData: Does NOT support options chains (price data only)
- Alpha Vantage: Options data requires Premium tier ($149/month) - not available on current plan
- Tradier: Not available (Australia signup blocked)
- Yahoo Finance: Blocked from Edge (401) and unreliable
- Barchart: Requires authenticated browser session (not extractable)

This module returns a clean no_data result when no provider is configured,
rather than attempting blocked/unavailable endpoints.
"""
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)


async def run_options_chain_etl(
    tickers: List[str],
    debug: bool = False
) -> Dict:
    """
    Main ETL function for options chain ingestion.
    
    Currently returns no_supported_provider_configured since:
    - TwelveData does not offer options chain endpoints
    - Alpha Vantage options requires Premium tier not available
    - Tradier is not available (geo-blocked)
    
    Returns:
        {
            success: bool,
            inserted: int,
            source: str,
            reason?: str,
            details?: dict
        }
    """
    if debug:
        logger.info(f"[DEBUG] Options ETL called with {len(tickers)} tickers: {tickers}")
    
    # No supported provider is currently configured
    # This is the correct behavior until a real provider is added
    reason = "no_supported_provider_configured"
    details = {
        "explanation": "No options data provider is currently configured or available",
        "providers_checked": {
            "twelvedata": "Does not support options chains (price data only)",
            "alpha_vantage": "Options data requires Premium tier ($149/month) - not on current plan",
            "tradier": "Not available (geo-blocked in Australia)",
            "yahoo_finance": "Blocked from Edge (401 errors)",
            "barchart": "Requires authenticated browser session (not extractable)",
        },
        "tickers_requested": tickers,
        "action_required": "Add a supported options data provider (e.g., Polygon.io, CBOE DataShop, or upgrade Alpha Vantage to Premium)",
    }
    
    logger.warning(f"⚠️ Options ETL: {reason}")
    if debug:
        logger.info(f"[DEBUG] Details: {details}")
    
    return {
        "success": True,  # The function ran correctly, it just has no provider
        "inserted": 0,
        "source": "none",
        "reason": reason,
        "details": details
    }
