from fastapi import APIRouter, Query
from datetime import datetime, timedelta
from backend.db import get_db
from backend.scoring import compute_theme_score, get_weights
from typing import List

router = APIRouter()

@router.get("/themes")
async def get_themes(days: int = Query(30, ge=1, le=365)):
    """Get all themes with scores"""
    db = get_db()
    
    since = datetime.utcnow() - timedelta(days=days)
    themes_cursor = db.themes.find({})
    themes = await themes_cursor.to_list(length=None)
    
    results = []
    for theme in themes:
        # Get signals for this theme
        signals_cursor = db.signals.find({
            "theme_id": str(theme["_id"]),
            "observed_at": {"$gte": since}
        })
        signals_raw = await signals_cursor.to_list(length=None)
        
        # Convert to Signal objects (simplified)
        from backend.models import Signal, Citation
        signals = []
        for s in signals_raw:
            signals.append(Signal(
                id=str(s["_id"]),
                signal_type=s["signal_type"],
                observed_at=s["observed_at"],
                magnitude=s.get("magnitude", 1.0),
                oa_citation=Citation(**s["oa_citation"]),
                checksum=s["checksum"]
            ))
        
        score, components, positives = compute_theme_score(signals)
        
        results.append({
            "id": str(theme["_id"]),
            "name": theme["name"],
            "score": round(score, 2),
            "components": {k: round(v, 2) for k, v in components.items()},
            "as_of": datetime.utcnow().isoformat(),
            "weights": get_weights(),
        })
    
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return results

@router.get("/theme/{theme_id}")
async def get_theme(theme_id: str, days: int = Query(30, ge=1, le=365)):
    """Get detailed theme with signals"""
    db = get_db()
    from bson import ObjectId
    
    theme = await db.themes.find_one({"_id": ObjectId(theme_id)})
    if not theme:
        return {"error": "Theme not found"}, 404
    
    since = datetime.utcnow() - timedelta(days=days)
    signals_cursor = db.signals.find({
        "theme_id": theme_id,
        "observed_at": {"$gte": since}
    })
    signals_raw = await signals_cursor.to_list(length=None)
    
    from backend.models import Signal, Citation
    signals = []
    for s in signals_raw:
        signals.append(Signal(
            id=str(s["_id"]),
            signal_type=s["signal_type"],
            observed_at=s["observed_at"],
            magnitude=s.get("magnitude", 1.0),
            oa_citation=Citation(**s["oa_citation"]),
            checksum=s["checksum"]
        ))
    
    score, components, positives = compute_theme_score(signals)
    
    return {
        "id": str(theme["_id"]),
        "name": theme["name"],
        "score": round(score, 2),
        "components": {k: round(v, 2) for k, v in components.items()},
        "positives": positives,
        "weights": get_weights(),
        "signal_count": len(signals),
        "signals": [
            {
                "id": s.id,
                "type": s.signal_type,
                "observed_at": s.observed_at.isoformat(),
                "citation": s.oa_citation.dict()
            }
            for s in signals[:50]  # Limit to 50 for performance
        ]
    }
