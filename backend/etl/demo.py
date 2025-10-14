from datetime import datetime, timedelta
from backend.db import get_db
from backend.models import Signal, Citation, Theme, Asset
from bson import ObjectId
import random

async def run_demo_etl():
    """Generate demo signals for testing"""
    db = get_db()
    
    # Create demo themes
    demo_themes = [
        {"name": "DeFi Expansion", "keywords": ["defi", "decentralized", "protocol"]},
        {"name": "Layer 2 Scaling", "keywords": ["layer2", "l2", "scaling", "rollup"]},
        {"name": "Institutional Flow", "keywords": ["institutional", "hedge", "fund"]}
    ]
    
    theme_ids = []
    for theme_data in demo_themes:
        result = await db.themes.update_one(
            {"name": theme_data["name"]},
            {"$set": theme_data},
            upsert=True
        )
        theme_id = result.upserted_id or (await db.themes.find_one({"name": theme_data["name"]}))["_id"]
        theme_ids.append(str(theme_id))
    
    # Create demo assets
    demo_assets = [
        {"ticker": "BTC", "exchange": "CRYPTO", "name": "Bitcoin"},
        {"ticker": "ETH", "exchange": "CRYPTO", "name": "Ethereum"},
        {"ticker": "SOL", "exchange": "CRYPTO", "name": "Solana"},
        {"ticker": "UNI", "exchange": "CRYPTO", "name": "Uniswap"},
        {"ticker": "MATIC", "exchange": "CRYPTO", "name": "Polygon"}
    ]
    
    for asset_data in demo_assets:
        await db.assets.update_one(
            {"ticker": asset_data["ticker"]},
            {"$set": asset_data},
            upsert=True
        )
    
    # Generate demo signals
    signal_types = [
        "policy_keyword",
        "flow_pressure",
        "filing_13f_new",
        "insider_buy",
        "social_mention"
    ]
    
    signals_created = 0
    now = datetime.utcnow()
    
    for i in range(30):
        for theme_id in theme_ids:
            signal_data = {
                "signal_type": random.choice(signal_types),
                "theme_id": theme_id,
                "asset_id": random.choice(["BTC", "ETH", "SOL"]),
                "magnitude": random.uniform(0.5, 2.0),
                "direction": "up",
                "observed_at": now - timedelta(days=random.randint(0, 29))
            }
            
            checksum = Signal.generate_checksum(signal_data)
            
            citation = {
                "source": f"Demo Source {i}",
                "url": f"https://example.com/signal/{i}",
                "timestamp": signal_data["observed_at"].isoformat()
            }
            
            try:
                await db.signals.insert_one({
                    **signal_data,
                    "checksum": checksum,
                    "oa_citation": citation,
                    "created_at": now,
                    "raw": {}
                })
                signals_created += 1
            except Exception:
                # Duplicate checksum, skip
                pass
    
    return {
        "themes_created": len(demo_themes),
        "assets_created": len(demo_assets),
        "signals_created": signals_created,
        "message": "Demo data ingested successfully"
    }
