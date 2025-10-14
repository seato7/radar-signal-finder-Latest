from fastapi import APIRouter
from backend.db import get_db
from backend.services.summarize import get_why_now_summary

router = APIRouter()

@router.get("/{theme_id}/why_now")
async def get_theme_why_now(theme_id: str):
    """Get 'why now?' summary for a theme with citations"""
    result = await get_why_now_summary(theme_id, days=14)
    
    return {
        "theme_id": theme_id,
        **result
    }

@router.get("/mapper/config")
async def get_mapper_config():
    """Get current theme mapper configuration"""
    import os
    
    semantic_enabled = os.getenv("SEMANTIC_MAPPER", "0") == "1"
    semantic_threshold = float(os.getenv("SEMANTIC_THRESHOLD", "0.35"))
    
    return {
        "semantic_enabled": semantic_enabled,
        "semantic_threshold": semantic_threshold,
        "allow_multi": False,  # Per spec
        "mode": "semantic" if semantic_enabled else "keyword"
    }
