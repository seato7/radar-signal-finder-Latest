from fastapi import APIRouter
from backend.db import get_db

router = APIRouter()

@router.get("/indexes")
async def list_indexes():
    """List all active MongoDB indexes"""
    db = get_db()
    
    indexes = {}
    
    # Get indexes for each collection
    for collection_name in ["signals", "assets", "themes", "prices", "alerts"]:
        collection = db[collection_name]
        collection_indexes = await collection.index_information()
        
        indexes[collection_name] = [
            {
                "name": idx_name,
                "keys": list(idx_info.get("key", [])),
                "unique": idx_info.get("unique", False),
                "ttl": idx_info.get("expireAfterSeconds")
            }
            for idx_name, idx_info in collection_indexes.items()
        ]
    
    return {
        "status": "healthy",
        "indexes": indexes
    }
