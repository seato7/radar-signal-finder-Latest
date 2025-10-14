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

async def run_demo_etl():
    """Generate demo signals for the 3 canonical themes"""
    db = get_db()
    
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
    
    # Generate signals over the last 45 days
    for theme_id in THEME_IDS:
        # Create 8-12 signals per theme
        num_signals = random.randint(8, 12)
        
        for i in range(num_signals):
            signal_type, component = random.choice(signal_types)
            days_ago = random.randint(0, 45)
            observed_at = now - timedelta(days=days_ago)
            
            signal_data = {
                "signal_type": signal_type,
                "theme_id": theme_id,
                "magnitude": random.uniform(0.6, 1.8),
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
        "message": f"Demo data ingested: {signals_created} signals across {themes_count} themes"
    }
