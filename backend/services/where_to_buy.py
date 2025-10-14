"""Where to Buy service - AU-friendly broker routing"""
from typing import List, Dict

# Broker URLs configuration
BROKERS = {
    "US": [
        {"name": "Stake", "url": "https://stake.com.au"},
        {"name": "Interactive Brokers", "url": "https://www.interactivebrokers.com.au"}
    ],
    "ASX": [
        {"name": "CommSec", "url": "https://www.commsec.com.au"},
        {"name": "SelfWealth", "url": "https://www.selfwealth.com.au"},
        {"name": "Interactive Brokers", "url": "https://www.interactivebrokers.com.au"}
    ],
    "CRYPTO": [
        {"name": "Binance AU", "url": "https://www.binance.com/en-AU"},
        {"name": "Kraken", "url": "https://www.kraken.com"},
        {"name": "KuCoin", "url": "https://www.kucoin.com"}
    ]
}

def get_where_to_buy(exchange: str, ticker: str = None) -> List[Dict[str, str]]:
    """
    Get list of AU-friendly brokers for a given exchange.
    
    Args:
        exchange: Exchange code (NASDAQ, NYSE, ASX, CRYPTO, etc.)
        ticker: Optional ticker symbol for future customization
    
    Returns:
        List of broker dicts with name and url
    """
    exchange_upper = exchange.upper()
    
    # Map exchanges to broker categories
    if exchange_upper in ["NASDAQ", "NYSE", "US", "AMEX"]:
        return BROKERS["US"]
    elif exchange_upper in ["ASX", "AUS"]:
        return BROKERS["ASX"]
    elif exchange_upper in ["CRYPTO", "BINANCE", "COINBASE", "KRAKEN"]:
        return BROKERS["CRYPTO"]
    else:
        # Default fallback for unknown exchanges
        return [
            {"name": "Interactive Brokers", "url": "https://www.interactivebrokers.com.au"},
            {"name": "Stake", "url": "https://stake.com.au"}
        ]
