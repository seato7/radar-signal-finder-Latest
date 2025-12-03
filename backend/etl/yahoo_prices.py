"""
DEPRECATED: Yahoo Finance Price ETL

This module has been replaced by Twelve Data (twelvedata_prices.py).
Kept for reference only - DO NOT USE.

Migration date: 2024-12-03
Reason: Yahoo Finance rate limiting (429 errors), unreliable data
Replacement: Twelve Data Grow plan ($79/mo, 55 credits/min)

New refresh schedule:
- Crypto: every 10 minutes
- Forex: every 10 minutes  
- Stocks: every 30 minutes
- Commodities: every 30 minutes
"""

import warnings
from typing import List, Dict, Tuple

warnings.warn(
    "yahoo_prices.py is deprecated. Use twelvedata_prices.py instead.",
    DeprecationWarning,
    stacklevel=2
)


class YahooPriceFetcher:
    """DEPRECATED: Use TwelveDataPriceFetcher from twelvedata_prices.py"""
    
    def __init__(self):
        raise NotImplementedError(
            "YahooPriceFetcher is deprecated. "
            "Use TwelveDataPriceFetcher from backend.etl.twelvedata_prices instead."
        )


async def fetch_all_prices(assets: List[Dict[str, str]]) -> Tuple[List[Dict], Dict]:
    """DEPRECATED: Use fetch_all_prices_twelvedata from twelvedata_prices.py"""
    raise NotImplementedError(
        "fetch_all_prices is deprecated. "
        "Use fetch_all_prices_twelvedata from backend.etl.twelvedata_prices instead."
    )
