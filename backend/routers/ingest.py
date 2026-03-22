from fastapi import APIRouter, Query, Body
from backend.etl import demo, policy_feeds
from backend.etl.sec_13f_holdings import run_13f_holdings_etl, diagnose_13f_mappings
from backend.etl.sec_form4 import run_form4_etl
from backend.etl.etf_flows import run_etf_flows_etl
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
        # Real mode - run full ETL pipeline
        policy_result = await policy_feeds.run_policy_feeds_etl()
        
        # Run Form 4 insiders ETL
        form4_result = await run_form4_etl(limit=100)
        
        # Run ETF flows ETL
        etf_flows_result = await run_etf_flows_etl()
        
        # 13F holdings are processed separately via dedicated endpoint
        # since they require specific filing data
        
        # Run theme mapper last to map all new signals
        mapper_result = await run_theme_mapper()
        
        return {
            "status": "success",
            "mode": "real",
            "policy_feeds": policy_result,
            "form4_insiders": form4_result,
            "etf_flows": etf_flows_result,
            "theme_mapper": mapper_result
        }

@router.post("/13f")
async def ingest_13f_filing(
    filing_url: str = Body(...),
    xml_content: str = Body(...),
    manager_name: str = Body(...),
    period_ended: str = Body(...)
):
    """Ingest a single 13F-HR filing with holdings deltas"""
    result = await run_13f_holdings_etl(filing_url, xml_content, manager_name, period_ended)
    
    # Run theme mapper on new signals
    mapper_result = await run_theme_mapper()
    
    return {
        "status": "success",
        "holdings": result,
        "theme_mapper": mapper_result
    }

@router.get("/diagnose/13f")
async def diagnose_13f(limit: int = Query(50, ge=10, le=200)):
    """Diagnose recent 13F CUSIP mapping issues"""
    result = await diagnose_13f_mappings(limit)
    return {
        "status": "success",
        "diagnostics": result
    }

@router.get("/diagnose/policy")
async def diagnose_policy(limit: int = Query(50, ge=10, le=100)):
    """Diagnose recent policy feed parsing"""
    from backend.db import get_db
    
    db = get_db()
    
    # Get recent policy signals
    signals_cursor = db.signals.find({
        "signal_type": {"$in": ["policy_keyword", "policy_approval"]}
    }).sort("created_at", -1).limit(limit)
    
    signals = await signals_cursor.to_list(length=None)
    
    # Aggregate stats
    keyword_matched = sum(1 for s in signals if s.get("theme_id") is not None)
    keyword_unmatched = len(signals) - keyword_matched
    
    samples = []
    for s in signals[:10]:
        samples.append({
            "signal_type": s.get("signal_type"),
            "value_text": s.get("value_text", "")[:80],
            "theme_id": s.get("theme_id"),
            "checksum": s.get("checksum", "")[:16],
            "observed_at": s.get("observed_at").isoformat() if s.get("observed_at") else None
        })
    
    return {
        "status": "success",
        "diagnostics": {
            "counts": {
                "total": len(signals),
                "mapped": keyword_matched,
                "unmapped": keyword_unmatched
            },
            "samples": samples
        }
    }

@router.get("/diagnose/form4")
async def diagnose_form4(limit: int = Query(50, ge=10, le=100)):
    """Diagnose recent Form 4 insider transactions"""
    from backend.db import get_db
    
    db = get_db()
    
    # Get recent insider signals
    signals_cursor = db.signals.find({
        "signal_type": {"$in": ["insider_buy", "insider_sell"]}
    }).sort("created_at", -1).limit(limit)
    
    signals = await signals_cursor.to_list(length=None)
    
    # Aggregate stats
    buys = sum(1 for s in signals if s.get("signal_type") == "insider_buy")
    sells = sum(1 for s in signals if s.get("signal_type") == "insider_sell")
    mapped = sum(1 for s in signals if s.get("theme_id") is not None)
    
    samples = []
    for s in signals[:10]:
        raw = s.get("raw", {})
        samples.append({
            "signal_type": s.get("signal_type"),
            "ticker": s.get("ticker", raw.get("issuer_ticker")),
            "code": raw.get("transaction_code"),
            "shares": raw.get("shares"),
            "theme_id": s.get("theme_id"),
            "checksum": s.get("checksum", "")[:16],
            "observed_at": s.get("observed_at").isoformat() if s.get("observed_at") else None
        })
    
    return {
        "status": "success",
        "diagnostics": {
            "counts": {
                "total": len(signals),
                "buys": buys,
                "sells": sells,
                "mapped": mapped
            },
            "samples": samples
        }
    }
