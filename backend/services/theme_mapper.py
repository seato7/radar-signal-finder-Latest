"""Theme mapper - assigns theme_id to signals based on keyword matching"""
from typing import Optional
from backend.db import get_db

async def map_signal_to_theme(signal_id: str, value_text: str, allow_multi: bool = False) -> Optional[str]:
    """
    Map a signal to a theme based on keyword matching.
    
    Args:
        signal_id: Signal ID to update
        value_text: Text to match against theme keywords
        allow_multi: If True, can match multiple themes (currently False per spec)
    
    Returns:
        theme_id if matched, None otherwise
    """
    db = get_db()
    
    if not value_text:
        return None
    
    value_lower = value_text.lower()
    
    # Get all themes
    themes_cursor = db.themes.find({})
    themes = await themes_cursor.to_list(length=None)
    
    # Find best matching theme by keyword count
    best_theme_id = None
    max_matches = 0
    
    for theme in themes:
        keywords = [kw.lower() for kw in theme.get("keywords", [])]
        matches = sum(1 for kw in keywords if kw in value_lower)
        
        if matches > max_matches:
            max_matches = matches
            best_theme_id = str(theme["_id"])
    
    # Update signal with theme_id if found
    if best_theme_id and max_matches > 0:
        await db.signals.update_one(
            {"_id": signal_id},
            {"$set": {"theme_id": best_theme_id}}
        )
        return best_theme_id
    
    return None

async def run_theme_mapper() -> dict:
    """Run theme mapper on all unmapped signals"""
    db = get_db()
    
    # Find signals without theme_id
    signals_cursor = db.signals.find({"theme_id": None})
    signals = await signals_cursor.to_list(length=None)
    
    updated_count = 0
    for signal in signals:
        value_text = signal.get("value_text", "")
        if value_text:
            theme_id = await map_signal_to_theme(str(signal["_id"]), value_text, allow_multi=False)
            if theme_id:
                updated_count += 1
    
    return {"updated": updated_count}
