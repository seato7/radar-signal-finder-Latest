from fastapi import APIRouter, Query
from backend.etl import demo, policy_feeds
from backend.services.theme_mapper import run_theme_mapper

router = APIRouter()

@router.post("/run")
async def run_ingest(mode: str = Query("demo", regex="^(demo|real)$")):
    """Run ETL ingestion pipeline"""
    
    if mode == "demo":
        result = await demo.run_demo_etl()
        return {
            "status": "success",
            "mode": "demo",
            "summary": result
        }
    else:
        # Real mode - run policy feeds ETL + theme mapper
        policy_result = await policy_feeds.run_policy_feeds_etl()
        mapper_result = await run_theme_mapper()
        
        return {
            "status": "success",
            "mode": "real",
            "policy_feeds": policy_result,
            "theme_mapper": mapper_result
        }
