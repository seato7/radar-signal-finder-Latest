from fastapi import APIRouter, Query
from backend.etl import demo

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
        # Real mode would call all ETL modules
        return {
            "status": "success",
            "mode": "real",
            "summary": {
                "message": "Real ETL pipeline not yet implemented",
                "modules": [
                    "policy_feeds",
                    "sec_form4",
                    "sec_13f",
                    "etf_flows",
                    "cusip_map",
                    "prices_csv"
                ]
            }
        }
