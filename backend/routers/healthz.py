from fastapi import APIRouter
from backend.db import get_db
from backend.metrics import metrics
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("")
async def healthz():
    """Health check endpoint for load balancers"""
    return {"status": "healthy", "service": "opportunity-radar"}

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

@router.get("/metrics")
async def get_metrics():
    """Get production metrics summary"""
    try:
        metrics_data = metrics.get_metrics()
        
        return {
            "status": "healthy",
            **metrics_data
        }
    except Exception as e:
        logger.error(f"Failed to collect metrics: {str(e)}")
        return {
            "status": "error",
            "error": str(e)
        }

@router.get("/ingestion")
async def get_ingestion_health():
    """Get price ingestion health status"""
    from backend.services.price_scheduler import get_scheduler_stats
    from backend.services.supabase_sync import SupabaseSync
    
    stats = get_scheduler_stats()
    success_rate = stats.get("global_success_rate", 0)
    
    # Get recent ingestion logs from Supabase (tiered scheduler uses railway-price-{tier})
    recent_logs = []
    try:
        async with SupabaseSync() as sync:
            if sync.is_configured:
                response = await sync.session.get(
                    f"{sync.url}/rest/v1/ingest_logs",
                    params={
                        "select": "etl_name,status,rows_inserted,duration_seconds,created_at,error_message",
                        "etl_name": "like.railway-price-%",
                        "order": "created_at.desc",
                        "limit": "20"
                    }
                )
                if response.status_code == 200:
                    recent_logs = response.json()
    except Exception as e:
        logger.error(f"Failed to fetch ingestion logs: {str(e)}")
    
    return {
        "status": "healthy" if success_rate >= 90 else "degraded",
        "scheduler": stats,
        "recent_runs": recent_logs,
        "thresholds": {
            "target_success_rate": 95,
            "current_success_rate": success_rate,
            "meets_target": success_rate >= 95
        }
    }
