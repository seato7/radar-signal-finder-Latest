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
        "message": f"Demo data ingested: {signals_created} signals across {themes_count} themes"
    }
