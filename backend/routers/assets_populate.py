from fastapi import APIRouter
from backend.db import get_db

router = APIRouter()

# Comprehensive real asset data
COMPREHENSIVE_ASSETS = [
    # Major Tech Stocks
    {"ticker": "AAPL", "name": "Apple Inc", "exchange": "NASDAQ"},
    {"ticker": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ"},
    {"ticker": "GOOGL", "name": "Alphabet Inc Class A", "exchange": "NASDAQ"},
    {"ticker": "GOOG", "name": "Alphabet Inc Class C", "exchange": "NASDAQ"},
    {"ticker": "AMZN", "name": "Amazon.com Inc", "exchange": "NASDAQ"},
    {"ticker": "META", "name": "Meta Platforms Inc", "exchange": "NASDAQ"},
    {"ticker": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ"},
    {"ticker": "TSLA", "name": "Tesla Inc", "exchange": "NASDAQ"},
    {"ticker": "AMD", "name": "Advanced Micro Devices Inc", "exchange": "NASDAQ"},
    {"ticker": "INTC", "name": "Intel Corporation", "exchange": "NASDAQ"},
    {"ticker": "NFLX", "name": "Netflix Inc", "exchange": "NASDAQ"},
    {"ticker": "ADBE", "name": "Adobe Inc", "exchange": "NASDAQ"},
    {"ticker": "CRM", "name": "Salesforce Inc", "exchange": "NYSE"},
    {"ticker": "ORCL", "name": "Oracle Corporation", "exchange": "NYSE"},
    {"ticker": "CSCO", "name": "Cisco Systems Inc", "exchange": "NASDAQ"},
    {"ticker": "AVGO", "name": "Broadcom Inc", "exchange": "NASDAQ"},
    {"ticker": "QCOM", "name": "QUALCOMM Incorporated", "exchange": "NASDAQ"},
    {"ticker": "TXN", "name": "Texas Instruments Inc", "exchange": "NASDAQ"},
    {"ticker": "IBM", "name": "International Business Machines Corporation", "exchange": "NYSE"},
    {"ticker": "NOW", "name": "ServiceNow Inc", "exchange": "NYSE"},
    
    # AI & Cloud
    {"ticker": "PLTR", "name": "Palantir Technologies Inc", "exchange": "NYSE"},
    {"ticker": "SNOW", "name": "Snowflake Inc", "exchange": "NYSE"},
    {"ticker": "NET", "name": "Cloudflare Inc", "exchange": "NYSE"},
    {"ticker": "DDOG", "name": "Datadog Inc", "exchange": "NASDAQ"},
    {"ticker": "CRWD", "name": "CrowdStrike Holdings Inc", "exchange": "NASDAQ"},
    {"ticker": "ZS", "name": "Zscaler Inc", "exchange": "NASDAQ"},
    {"ticker": "PANW", "name": "Palo Alto Networks Inc", "exchange": "NASDAQ"},
    {"ticker": "OKTA", "name": "Okta Inc", "exchange": "NASDAQ"},
    
    # Finance
    {"ticker": "JPM", "name": "JPMorgan Chase & Co", "exchange": "NYSE"},
    {"ticker": "BAC", "name": "Bank of America Corporation", "exchange": "NYSE"},
    {"ticker": "WFC", "name": "Wells Fargo & Company", "exchange": "NYSE"},
    {"ticker": "GS", "name": "Goldman Sachs Group Inc", "exchange": "NYSE"},
    {"ticker": "MS", "name": "Morgan Stanley", "exchange": "NYSE"},
    {"ticker": "C", "name": "Citigroup Inc", "exchange": "NYSE"},
    {"ticker": "BLK", "name": "BlackRock Inc", "exchange": "NYSE"},
    {"ticker": "SCHW", "name": "Charles Schwab Corporation", "exchange": "NYSE"},
    {"ticker": "AXP", "name": "American Express Company", "exchange": "NYSE"},
    {"ticker": "V", "name": "Visa Inc", "exchange": "NYSE"},
    {"ticker": "MA", "name": "Mastercard Incorporated", "exchange": "NYSE"},
    {"ticker": "PYPL", "name": "PayPal Holdings Inc", "exchange": "NASDAQ"},
    {"ticker": "SQ", "name": "Block Inc", "exchange": "NYSE"},
    {"ticker": "COIN", "name": "Coinbase Global Inc", "exchange": "NASDAQ"},
    
    # Energy
    {"ticker": "XOM", "name": "Exxon Mobil Corporation", "exchange": "NYSE"},
    {"ticker": "CVX", "name": "Chevron Corporation", "exchange": "NYSE"},
    {"ticker": "COP", "name": "ConocoPhillips", "exchange": "NYSE"},
    {"ticker": "SLB", "name": "Schlumberger NV", "exchange": "NYSE"},
    {"ticker": "EOG", "name": "EOG Resources Inc", "exchange": "NYSE"},
    {"ticker": "NEE", "name": "NextEra Energy Inc", "exchange": "NYSE"},
    {"ticker": "DUK", "name": "Duke Energy Corporation", "exchange": "NYSE"},
    {"ticker": "SO", "name": "Southern Company", "exchange": "NYSE"},
    
    # Clean Energy
    {"ticker": "ENPH", "name": "Enphase Energy Inc", "exchange": "NASDAQ"},
    {"ticker": "SEDG", "name": "SolarEdge Technologies Inc", "exchange": "NASDAQ"},
    {"ticker": "FSLR", "name": "First Solar Inc", "exchange": "NASDAQ"},
    {"ticker": "RUN", "name": "Sunrun Inc", "exchange": "NASDAQ"},
    {"ticker": "PLUG", "name": "Plug Power Inc", "exchange": "NASDAQ"},
    {"ticker": "BE", "name": "Bloom Energy Corporation", "exchange": "NYSE"},
    
    # Water & Infrastructure
    {"ticker": "AWK", "name": "American Water Works Company Inc", "exchange": "NYSE"},
    {"ticker": "XYL", "name": "Xylem Inc", "exchange": "NYSE"},
    {"ticker": "WTRG", "name": "Essential Utilities Inc", "exchange": "NYSE"},
    {"ticker": "ERII", "name": "Energy Recovery Inc", "exchange": "NASDAQ"},
    {"ticker": "ACM", "name": "AECOM", "exchange": "NYSE"},
    {"ticker": "PWR", "name": "Quanta Services Inc", "exchange": "NYSE"},
    
    # Healthcare
    {"ticker": "UNH", "name": "UnitedHealth Group Incorporated", "exchange": "NYSE"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE"},
    {"ticker": "PFE", "name": "Pfizer Inc", "exchange": "NYSE"},
    {"ticker": "ABBV", "name": "AbbVie Inc", "exchange": "NYSE"},
    {"ticker": "TMO", "name": "Thermo Fisher Scientific Inc", "exchange": "NYSE"},
    {"ticker": "ABT", "name": "Abbott Laboratories", "exchange": "NYSE"},
    {"ticker": "DHR", "name": "Danaher Corporation", "exchange": "NYSE"},
    {"ticker": "BMY", "name": "Bristol-Myers Squibb Company", "exchange": "NYSE"},
    {"ticker": "LLY", "name": "Eli Lilly and Company", "exchange": "NYSE"},
    {"ticker": "AMGN", "name": "Amgen Inc", "exchange": "NASDAQ"},
    {"ticker": "GILD", "name": "Gilead Sciences Inc", "exchange": "NASDAQ"},
    {"ticker": "MRNA", "name": "Moderna Inc", "exchange": "NASDAQ"},
    {"ticker": "BNTX", "name": "BioNTech SE", "exchange": "NASDAQ"},
    
    # Consumer
    {"ticker": "WMT", "name": "Walmart Inc", "exchange": "NYSE"},
    {"ticker": "HD", "name": "Home Depot Inc", "exchange": "NYSE"},
    {"ticker": "PG", "name": "Procter & Gamble Company", "exchange": "NYSE"},
    {"ticker": "KO", "name": "Coca-Cola Company", "exchange": "NYSE"},
    {"ticker": "PEP", "name": "PepsiCo Inc", "exchange": "NASDAQ"},
    {"ticker": "COST", "name": "Costco Wholesale Corporation", "exchange": "NASDAQ"},
    {"ticker": "NKE", "name": "Nike Inc", "exchange": "NYSE"},
    {"ticker": "MCD", "name": "McDonald's Corporation", "exchange": "NYSE"},
    {"ticker": "SBUX", "name": "Starbucks Corporation", "exchange": "NASDAQ"},
    {"ticker": "DIS", "name": "Walt Disney Company", "exchange": "NYSE"},
    
    # Auto
    {"ticker": "F", "name": "Ford Motor Company", "exchange": "NYSE"},
    {"ticker": "GM", "name": "General Motors Company", "exchange": "NYSE"},
    {"ticker": "RIVN", "name": "Rivian Automotive Inc", "exchange": "NASDAQ"},
    {"ticker": "LCID", "name": "Lucid Group Inc", "exchange": "NASDAQ"},
    
    # Industrial
    {"ticker": "BA", "name": "Boeing Company", "exchange": "NYSE"},
    {"ticker": "CAT", "name": "Caterpillar Inc", "exchange": "NYSE"},
    {"ticker": "GE", "name": "General Electric Company", "exchange": "NYSE"},
    {"ticker": "MMM", "name": "3M Company", "exchange": "NYSE"},
    {"ticker": "HON", "name": "Honeywell International Inc", "exchange": "NASDAQ"},
    {"ticker": "UPS", "name": "United Parcel Service Inc", "exchange": "NYSE"},
    {"ticker": "LMT", "name": "Lockheed Martin Corporation", "exchange": "NYSE"},
    {"ticker": "RTX", "name": "RTX Corporation", "exchange": "NYSE"},
    
    # Australian Stocks
    {"ticker": "BHP", "name": "BHP Group Limited", "exchange": "ASX"},
    {"ticker": "CBA", "name": "Commonwealth Bank of Australia", "exchange": "ASX"},
    {"ticker": "CSL", "name": "CSL Limited", "exchange": "ASX"},
    {"ticker": "NAB", "name": "National Australia Bank Limited", "exchange": "ASX"},
    {"ticker": "WBC", "name": "Westpac Banking Corporation", "exchange": "ASX"},
    {"ticker": "ANZ", "name": "Australia and New Zealand Banking Group", "exchange": "ASX"},
    {"ticker": "WES", "name": "Wesfarmers Limited", "exchange": "ASX"},
    {"ticker": "MQG", "name": "Macquarie Group Limited", "exchange": "ASX"},
    {"ticker": "WDS", "name": "Woodside Energy Group Ltd", "exchange": "ASX"},
    {"ticker": "RIO", "name": "Rio Tinto Limited", "exchange": "ASX"},
    {"ticker": "FMG", "name": "Fortescue Metals Group Limited", "exchange": "ASX"},
    {"ticker": "WOW", "name": "Woolworths Group Limited", "exchange": "ASX"},
    {"ticker": "TLS", "name": "Telstra Group Limited", "exchange": "ASX"},
    {"ticker": "GMG", "name": "Goodman Group", "exchange": "ASX"},
    {"ticker": "TCL", "name": "Transurban Group", "exchange": "ASX"},
    
    # Major Cryptocurrencies
    {"ticker": "BTC", "name": "Bitcoin", "exchange": "CRYPTO"},
    {"ticker": "ETH", "name": "Ethereum", "exchange": "CRYPTO"},
    {"ticker": "BNB", "name": "Binance Coin", "exchange": "CRYPTO"},
    {"ticker": "XRP", "name": "Ripple", "exchange": "CRYPTO"},
    {"ticker": "ADA", "name": "Cardano", "exchange": "CRYPTO"},
    {"ticker": "SOL", "name": "Solana", "exchange": "CRYPTO"},
    {"ticker": "DOT", "name": "Polkadot", "exchange": "CRYPTO"},
    {"ticker": "DOGE", "name": "Dogecoin", "exchange": "CRYPTO"},
    {"ticker": "MATIC", "name": "Polygon", "exchange": "CRYPTO"},
    {"ticker": "AVAX", "name": "Avalanche", "exchange": "CRYPTO"},
    {"ticker": "LINK", "name": "Chainlink", "exchange": "CRYPTO"},
    {"ticker": "UNI", "name": "Uniswap", "exchange": "CRYPTO"},
    {"ticker": "ATOM", "name": "Cosmos", "exchange": "CRYPTO"},
    {"ticker": "LTC", "name": "Litecoin", "exchange": "CRYPTO"},
    {"ticker": "XLM", "name": "Stellar", "exchange": "CRYPTO"},
    {"ticker": "ALGO", "name": "Algorand", "exchange": "CRYPTO"},
    {"ticker": "VET", "name": "VeChain", "exchange": "CRYPTO"},
    {"ticker": "ICP", "name": "Internet Computer", "exchange": "CRYPTO"},
    {"ticker": "FIL", "name": "Filecoin", "exchange": "CRYPTO"},
    {"ticker": "AAVE", "name": "Aave", "exchange": "CRYPTO"},
    {"ticker": "MKR", "name": "Maker", "exchange": "CRYPTO"},
    {"ticker": "COMP", "name": "Compound", "exchange": "CRYPTO"},
    {"ticker": "SUSHI", "name": "SushiSwap", "exchange": "CRYPTO"},
    {"ticker": "CRV", "name": "Curve DAO Token", "exchange": "CRYPTO"},
    {"ticker": "APE", "name": "ApeCoin", "exchange": "CRYPTO"},
    {"ticker": "SAND", "name": "The Sandbox", "exchange": "CRYPTO"},
    {"ticker": "MANA", "name": "Decentraland", "exchange": "CRYPTO"},
    {"ticker": "AXS", "name": "Axie Infinity", "exchange": "CRYPTO"},
    {"ticker": "FTM", "name": "Fantom", "exchange": "CRYPTO"},
    {"ticker": "NEAR", "name": "NEAR Protocol", "exchange": "CRYPTO"},
]

async def auto_populate_assets(db):
    """Auto-populate database with comprehensive list of stocks and cryptocurrencies on startup"""
    try:
        # Check if assets already exist
        count = await db.assets.count_documents({})
        if count > 0:
            return
        
        from datetime import datetime
        assets_with_metadata = [
            {
                **asset,
                "metadata": {
                    "auto_populated": True,
                    "created_at": datetime.utcnow()
                }
            }
            for asset in COMPREHENSIVE_ASSETS
        ]
        
        # Insert all assets
        await db.assets.insert_many(assets_with_metadata)
        print(f"✅ Auto-populated {len(COMPREHENSIVE_ASSETS)} assets")
    except Exception as e:
        print(f"⚠️ Error auto-populating assets: {str(e)}")

@router.post("/populate")
async def populate_assets():
    """Manually populate assets collection with comprehensive stock and crypto data"""
    db = get_db()
    
    # Check if assets already exist
    existing_count = await db.assets.count_documents({})
    
    if existing_count > 0:
        return {
            "message": "Assets already populated", 
            "count": existing_count
        }

    # Bulk insert all assets
    from datetime import datetime
    assets_with_metadata = [
        {
            **asset,
            "metadata": {
                "auto_populated": True,
                "created_at": datetime.utcnow()
            }
        }
        for asset in COMPREHENSIVE_ASSETS
    ]

    result = await db.assets.insert_many(assets_with_metadata)

    return {
        "success": True,
        "inserted": len(result.inserted_ids),
        "message": f"Successfully populated {len(result.inserted_ids)} assets"
    }
