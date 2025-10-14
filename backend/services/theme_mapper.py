"""Theme mapper - assigns theme_id to signals based on keyword matching"""
from typing import Optional
import os
import math
from collections import Counter
from backend.db import get_db

def compute_tfidf_similarity(text: str, keywords: list[str]) -> float:
    """
    Compute simple TF-IDF cosine similarity between text and keywords.
    Fallback semantic matching when exact keywords don't match.
    """
    if not text or not keywords:
        return 0.0
    
    # Tokenize
    text_lower = text.lower()
    text_tokens = text_lower.split()
    
    # Term frequency in text
    text_tf = Counter(text_tokens)
    
    # Keywords as "document"
    keyword_tokens = [kw.lower() for kw in keywords]
    keyword_tf = Counter(keyword_tokens)
    
    # Compute dot product and magnitudes
    dot_product = 0
    text_magnitude = 0
    keyword_magnitude = 0
    
    all_terms = set(text_tf.keys()) | set(keyword_tf.keys())
    
    for term in all_terms:
        text_val = text_tf.get(term, 0)
        keyword_val = keyword_tf.get(term, 0)
        
        dot_product += text_val * keyword_val
        text_magnitude += text_val ** 2
        keyword_magnitude += keyword_val ** 2
    
    # Cosine similarity
    if text_magnitude == 0 or keyword_magnitude == 0:
        return 0.0
    
    return dot_product / (math.sqrt(text_magnitude) * math.sqrt(keyword_magnitude))

async def map_signal_to_theme(signal_id: str, value_text: str, allow_multi: bool = False) -> Optional[str]:
    """
    Map a signal to a theme based on keyword matching.
    With optional semantic fallback if SEMANTIC_MAPPER=1.
    
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
    
    # Find best matching theme by keyword count (strict)
    best_theme_id = None
    max_matches = 0
    mapper_route = "keyword"
    mapper_score = 0.0
    
    for theme in themes:
        keywords = [kw.lower() for kw in theme.get("keywords", [])]
        matches = sum(1 for kw in keywords if kw in value_lower)
        
        if matches > max_matches:
            max_matches = matches
            best_theme_id = str(theme["_id"])
            mapper_score = float(matches)
    
    # If no keyword match and SEMANTIC_MAPPER=1, try semantic fallback
    semantic_enabled = os.getenv("SEMANTIC_MAPPER", "0") == "1"
    semantic_threshold = float(os.getenv("SEMANTIC_THRESHOLD", "0.35"))
    
    if not best_theme_id and semantic_enabled:
        best_semantic_score = 0.0
        best_semantic_theme = None
        
        for theme in themes:
            keywords = theme.get("keywords", [])
            score = compute_tfidf_similarity(value_text, keywords)
            
            if score > best_semantic_score:
                best_semantic_score = score
                best_semantic_theme = str(theme["_id"])
        
        if best_semantic_score >= semantic_threshold:
            best_theme_id = best_semantic_theme
            mapper_route = "semantic"
            mapper_score = best_semantic_score
    
    # Update signal with theme_id if found
    if best_theme_id and (max_matches > 0 or mapper_route == "semantic"):
        await db.signals.update_one(
            {"_id": signal_id},
            {"$set": {
                "theme_id": best_theme_id,
                "raw.mapper": mapper_route,
                "raw.mapper_score": mapper_score
            }}
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
