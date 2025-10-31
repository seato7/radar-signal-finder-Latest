from fastapi import APIRouter, HTTPException
from backend.db import get_db
from backend.services.summarize import get_why_now_summary
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId

router = APIRouter()

class ThemeCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    why_now: Optional[str] = ""
    keywords: List[str]
    tickers: List[str] = []
    confidence: str = "Medium"
    alpha: float = 1.0

@router.post("/create")
async def create_theme(theme: ThemeCreate):
    """Create a new theme discovered by AI"""
    db = get_db()
    
    # Check if theme already exists
    existing = await db.themes.find_one({"name": theme.name})
    if existing:
        return {"id": str(existing["_id"]), "message": "Theme already exists"}
    
    theme_doc = {
        "_id": ObjectId(),
        "name": theme.name,
        "keywords": theme.keywords,
        "alpha": theme.alpha,
        "contributors": [],
        "metadata": {
            "description": theme.description,
            "why_now": theme.why_now,
            "tickers": theme.tickers,
            "confidence": theme.confidence,
            "auto_discovered": True,
        }
    }
    
    await db.themes.insert_one(theme_doc)
    return {"id": str(theme_doc["_id"]), "name": theme.name, "message": "Theme created"}

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
