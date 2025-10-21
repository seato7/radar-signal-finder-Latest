from datetime import datetime, timedelta
from backend.db import get_db
from backend.models import Signal, Citation
import random

# Canonical theme IDs
THEME_IDS = [
    "theme-ai-liquid-cooling",
    "theme-water-reuse",
    "theme-hvdc-transformers"
]

# Demo assets - mix of stocks and crypto
DEMO_ASSETS = [
    # Stocks - AI & Tech
    {"ticker": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ"},
    {"ticker": "AMD", "name": "Advanced Micro Devices Inc", "exchange": "NASDAQ"},
    {"ticker": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ"},
    {"ticker": "GOOGL", "name": "Alphabet Inc Class A", "exchange": "NASDAQ"},
    {"ticker": "TSLA", "name": "Tesla Inc", "exchange": "NASDAQ"},
    {"ticker": "META", "name": "Meta Platforms Inc", "exchange": "NASDAQ"},
    {"ticker": "AAPL", "name": "Apple Inc", "exchange": "NASDAQ"},
    {"ticker": "AMZN", "name": "Amazon.com Inc", "exchange": "NASDAQ"},
    
    # Stocks - Energy & Infrastructure
    {"ticker": "NEE", "name": "NextEra Energy Inc", "exchange": "NYSE"},
    {"ticker": "ENPH", "name": "Enphase Energy Inc", "exchange": "NASDAQ"},
    {"ticker": "FSLR", "name": "First Solar Inc", "exchange": "NASDAQ"},
    {"ticker": "ABB", "name": "ABB Ltd", "exchange": "NYSE"},
    {"ticker": "SIEGY", "name": "Siemens Energy AG", "exchange": "OTC"},
    
    # Stocks - Water & Environmental
    {"ticker": "AWK", "name": "American Water Works Co Inc", "exchange": "NYSE"},
    {"ticker": "XYL", "name": "Xylem Inc", "exchange": "NYSE"},
    {"ticker": "WTRG", "name": "Essential Utilities Inc", "exchange": "NYSE"},
    {"ticker": "ERII", "name": "Energy Recovery Inc", "exchange": "NASDAQ"},
    
    # Crypto
    {"ticker": "BTC", "name": "Bitcoin", "exchange": "CRYPTO"},
    {"ticker": "ETH", "name": "Ethereum", "exchange": "CRYPTO"},
    {"ticker": "SOL", "name": "Solana", "exchange": "CRYPTO"},
    {"ticker": "BNB", "name": "Binance Coin", "exchange": "CRYPTO"},
    {"ticker": "ADA", "name": "Cardano", "exchange": "CRYPTO"},
    {"ticker": "DOT", "name": "Polkadot", "exchange": "CRYPTO"},
    {"ticker": "AVAX", "name": "Avalanche", "exchange": "CRYPTO"},
    {"ticker": "MATIC", "name": "Polygon", "exchange": "CRYPTO"},
    
    # Australian Stocks
    {"ticker": "BHP", "name": "BHP Group Ltd", "exchange": "ASX"},
    {"ticker": "CBA", "name": "Commonwealth Bank of Australia", "exchange": "ASX"},
    {"ticker": "CSL", "name": "CSL Limited", "exchange": "ASX"},
    {"ticker": "WDS", "name": "Woodside Energy Group Ltd", "exchange": "ASX"},
]

async def run_demo_etl():
    """Generate demo signals and assets for the 3 canonical themes"""
    db = get_db()
    
    # First, seed assets if collection is empty
    assets_count = await db.assets.count_documents({})
    assets_inserted = 0
    
    if assets_count == 0:
        for asset_data in DEMO_ASSETS:
            try:
                await db.assets.insert_one({
                    **asset_data,
                    "metadata": {"demo": True}
                })
                assets_inserted += 1
            except Exception:
                pass  # Skip duplicates
    
    # Verify themes exist
    themes_count = await db.themes.count_documents({"_id": {"$in": THEME_IDS}})
    if themes_count == 0:
        return {
            "error": "No themes found. Run: python backend/scripts/seed_themes.py first",
            "themes_created": 0,
            "signals_created": 0
        }
    
    # Signal types mapped to components
    signal_types = [
        ("policy_keyword", "PolicyMomentum"),
        ("flow_pressure", "FlowPressure"),
        ("filing_13f_new", "BigMoneyConfirm"),
        ("insider_buy", "InsiderPoliticianConfirm"),
        ("social_mention", "Attention"),
    ]
    
    signals_created = 0
    now = datetime.utcnow()
    
    # Generate richer, more balanced signals over the last 45 days
    for theme_id in THEME_IDS:
        # Ensure diverse signal distribution per theme
        signals_per_type = {
            "policy_keyword": 2,
            "policy_approval": 1,
            "flow_pressure": 1,
            "filing_13f_new": 1,
            "bigmoney_hold_increase": 1,
            "insider_buy": 1,
            "social_mention": 2
        }
        
        for signal_type_key, count in signals_per_type.items():
            component = next((comp for st, comp in signal_types if st == signal_type_key), "Unknown")
            
            for i in range(count):
                # Spread signals across 30-45 days with recent bias
                days_ago = random.choices(
                    [random.randint(0, 10), random.randint(11, 30), random.randint(31, 45)],
                    weights=[0.5, 0.3, 0.2]
                )[0]
                
                observed_at = now - timedelta(days=days_ago)
                
                # Vary magnitudes to show decay
                base_magnitude = random.uniform(0.8, 1.5)
                magnitude = base_magnitude * (1.0 if days_ago < 15 else 0.7)
                
                signal_data = {
                    "signal_type": signal_type_key,
                    "theme_id": theme_id,
                    "magnitude": magnitude,
                    "direction": "up",
                    "observed_at": observed_at,
                    "value_text": f"Demo {component} signal for {theme_id}"
                }
            
            checksum = Signal.generate_checksum(signal_data)
            
            citation = {
                "source": f"Demo Source - {component}",
                "url": f"https://example.com/demo/{theme_id}/{checksum[:8]}",
                "timestamp": observed_at.isoformat()
            }
            
            try:
                await db.signals.insert_one({
                    **signal_data,
                    "checksum": checksum,
                    "oa_citation": citation,
                    "created_at": now,
                    "raw": {"demo": True, "component": component}
                })
                signals_created += 1
            except Exception:
                # Duplicate checksum, skip
                pass
    
    return {
        "themes_available": themes_count,
        "signals_created": signals_created,
        "assets_inserted": assets_inserted,
        "message": f"Demo data ingested: {signals_created} signals, {assets_inserted} assets across {themes_count} themes"
    }
