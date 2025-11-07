"""
Comprehensive Broker Registry - All supported brokers across all asset classes
"""
from typing import List, Dict, Optional

# FOREX BROKERS
FOREX_BROKERS = [
    {
        "id": "oanda",
        "name": "Oanda",
        "display_name": "Oanda",
        "description": "Leading forex broker with competitive spreads",
        "url": "https://www.oanda.com/",
        "asset_classes": ["forex", "commodity"],
        "regions": ["global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["low_spreads", "api_trading", "mt4_mt5"],
    },
    {
        "id": "forex_com",
        "name": "forex_com",
        "display_name": "Forex.com",
        "description": "Major US-based forex broker",
        "url": "https://www.forex.com/",
        "asset_classes": ["forex", "commodity", "crypto"],
        "regions": ["us", "global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 100,
        "features": ["regulated_us", "api_trading", "low_spreads"],
    },
    {
        "id": "ig",
        "name": "ig",
        "display_name": "IG Markets",
        "description": "UK-based multi-asset broker",
        "url": "https://www.ig.com/",
        "asset_classes": ["forex", "stocks", "commodity", "crypto"],
        "regions": ["uk", "eu", "global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["regulated_uk", "spread_betting", "api_trading"],
    },
    {
        "id": "pepperstone",
        "name": "pepperstone",
        "display_name": "Pepperstone",
        "description": "Australian forex and CFD broker",
        "url": "https://www.pepperstone.com/",
        "asset_classes": ["forex", "commodity", "stocks"],
        "regions": ["au", "global"],
        "api_support": True,
        "paper_trading": False,
        "min_deposit": 0,
        "features": ["low_spreads", "mt4_mt5", "fast_execution"],
    },
    {
        "id": "fxcm",
        "name": "fxcm",
        "display_name": "FXCM",
        "description": "Global forex broker",
        "url": "https://www.fxcm.com/",
        "asset_classes": ["forex", "commodity"],
        "regions": ["global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 50,
        "features": ["api_trading", "trading_station"],
    },
]

# CRYPTO BROKERS (already in system, expanded here)
CRYPTO_BROKERS = [
    {
        "id": "binance",
        "name": "binance",
        "display_name": "Binance",
        "description": "World's largest crypto exchange",
        "url": "https://www.binance.com/",
        "asset_classes": ["crypto"],
        "regions": ["global"],
        "api_support": True,
        "paper_trading": False,
        "min_deposit": 10,
        "features": ["largest_volume", "api_trading", "low_fees"],
    },
    {
        "id": "coinbase",
        "name": "coinbase",
        "display_name": "Coinbase",
        "description": "US-regulated crypto exchange",
        "url": "https://www.coinbase.com/",
        "asset_classes": ["crypto"],
        "regions": ["us", "global"],
        "api_support": True,
        "paper_trading": False,
        "min_deposit": 2,
        "features": ["regulated_us", "user_friendly", "api_trading"],
    },
    {
        "id": "kraken",
        "name": "kraken",
        "display_name": "Kraken",
        "description": "Secure crypto exchange",
        "url": "https://www.kraken.com/",
        "asset_classes": ["crypto"],
        "regions": ["us", "eu", "global"],
        "api_support": True,
        "paper_trading": False,
        "min_deposit": 10,
        "features": ["high_security", "api_trading", "margin_trading"],
    },
    {
        "id": "gemini",
        "name": "gemini",
        "display_name": "Gemini",
        "description": "Regulated US crypto exchange",
        "url": "https://www.gemini.com/",
        "asset_classes": ["crypto"],
        "regions": ["us"],
        "api_support": True,
        "paper_trading": False,
        "min_deposit": 0,
        "features": ["regulated_us", "institutional_grade", "api_trading"],
    },
    {
        "id": "kucoin",
        "name": "kucoin",
        "display_name": "KuCoin",
        "description": "Global crypto exchange with wide selection",
        "url": "https://www.kucoin.com/",
        "asset_classes": ["crypto"],
        "regions": ["global"],
        "api_support": True,
        "paper_trading": False,
        "min_deposit": 1,
        "features": ["wide_selection", "api_trading", "low_fees"],
    },
    {
        "id": "bybit",
        "name": "bybit",
        "display_name": "Bybit",
        "description": "Crypto derivatives exchange",
        "url": "https://www.bybit.com/",
        "asset_classes": ["crypto"],
        "regions": ["global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 10,
        "features": ["derivatives", "api_trading", "demo_account"],
    },
]

# STOCK BROKERS (already in system, expanded here)
STOCK_BROKERS = [
    {
        "id": "alpaca",
        "name": "alpaca",
        "display_name": "Alpaca Markets",
        "description": "Commission-free US stocks and crypto trading",
        "url": "https://alpaca.markets/",
        "asset_classes": ["stocks", "crypto"],
        "regions": ["us", "global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["commission_free", "api_first", "paper_trading"],
    },
    {
        "id": "ibkr",
        "name": "ibkr",
        "display_name": "Interactive Brokers",
        "description": "Professional multi-asset trading platform",
        "url": "https://www.interactivebrokers.com/",
        "asset_classes": ["stocks", "options", "futures", "forex", "bonds"],
        "regions": ["global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["global_markets", "low_fees", "professional_tools"],
    },
    {
        "id": "tastytrade",
        "name": "tastytrade",
        "display_name": "tastytrade",
        "description": "Options-focused broker",
        "url": "https://tastytrade.com/",
        "asset_classes": ["stocks", "options"],
        "regions": ["us"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["options_focused", "education", "api_trading"],
    },
    {
        "id": "tradier",
        "name": "tradier",
        "display_name": "Tradier",
        "description": "API-focused brokerage platform",
        "url": "https://tradier.com/",
        "asset_classes": ["stocks", "options"],
        "regions": ["us"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["api_first", "developer_friendly", "paper_trading"],
    },
    {
        "id": "etrade",
        "name": "etrade",
        "display_name": "E*TRADE",
        "description": "Major US retail broker",
        "url": "https://us.etrade.com/",
        "asset_classes": ["stocks", "options", "etfs"],
        "regions": ["us"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["established", "research_tools", "api_trading"],
    },
    {
        "id": "schwab",
        "name": "schwab",
        "display_name": "Charles Schwab",
        "description": "Full-service US broker",
        "url": "https://www.schwab.com/",
        "asset_classes": ["stocks", "options", "etfs", "futures"],
        "regions": ["us"],
        "api_support": True,
        "paper_trading": False,
        "min_deposit": 0,
        "features": ["full_service", "research", "api_trading"],
    },
]

# MULTI-ASSET BROKERS
MULTI_ASSET_BROKERS = [
    {
        "id": "ibkr",  # Duplicate but important for multi-asset
        "name": "ibkr",
        "display_name": "Interactive Brokers",
        "description": "Trade everything: stocks, forex, crypto, commodities, bonds",
        "url": "https://www.interactivebrokers.com/",
        "asset_classes": ["stocks", "forex", "crypto", "options", "futures", "bonds", "commodity"],
        "regions": ["global"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 0,
        "features": ["all_assets", "global_markets", "professional"],
    },
]

# COMMODITY BROKERS
COMMODITY_BROKERS = [
    {
        "id": "amp_futures",
        "name": "amp_futures",
        "display_name": "AMP Futures",
        "description": "Futures and commodities trading",
        "url": "https://ampfutures.com/",
        "asset_classes": ["futures", "commodity"],
        "regions": ["us"],
        "api_support": True,
        "paper_trading": True,
        "min_deposit": 100,
        "features": ["low_commissions", "api_trading", "futures_focused"],
    },
]

# Combine all brokers
ALL_BROKERS = (
    FOREX_BROKERS +
    CRYPTO_BROKERS +
    STOCK_BROKERS +
    COMMODITY_BROKERS
)

# Remove duplicates (like IBKR) - keep the multi-asset version
seen = set()
UNIQUE_BROKERS = []
for broker in ALL_BROKERS:
    if broker["id"] not in seen:
        seen.add(broker["id"])
        UNIQUE_BROKERS.append(broker)


def get_all_brokers() -> List[Dict]:
    """Get all supported brokers"""
    return UNIQUE_BROKERS


def get_brokers_by_asset_class(asset_class: str) -> List[Dict]:
    """Get brokers that support a specific asset class"""
    return [
        broker for broker in UNIQUE_BROKERS
        if asset_class.lower() in [ac.lower() for ac in broker["asset_classes"]]
    ]


def get_broker_by_id(broker_id: str) -> Optional[Dict]:
    """Get a specific broker by ID"""
    for broker in UNIQUE_BROKERS:
        if broker["id"] == broker_id:
            return broker
    return None


def get_brokers_with_api() -> List[Dict]:
    """Get all brokers with API support"""
    return [broker for broker in UNIQUE_BROKERS if broker["api_support"]]


def get_brokers_with_paper_trading() -> List[Dict]:
    """Get all brokers with paper trading"""
    return [broker for broker in UNIQUE_BROKERS if broker["paper_trading"]]


def get_recommended_brokers(asset_class: str, region: str = "global") -> List[Dict]:
    """
    Get recommended brokers for a specific asset class and region
    Prioritizes: API support, paper trading, regulation, and features
    """
    brokers = get_brokers_by_asset_class(asset_class)
    
    # Filter by region if specified
    if region != "global":
        brokers = [b for b in brokers if region in b["regions"] or "global" in b["regions"]]
    
    # Sort by features (API support, paper trading, min deposit)
    def broker_score(b):
        score = 0
        if b["api_support"]: score += 10
        if b["paper_trading"]: score += 5
        score -= b["min_deposit"] / 100  # Lower deposit = higher score
        return score
    
    return sorted(brokers, key=broker_score, reverse=True)
