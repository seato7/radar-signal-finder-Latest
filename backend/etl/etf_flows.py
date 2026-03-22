"""ETF Flows ETL - per-ETF z-scores + sector aggregates"""
import httpx
import csv
import json
from io import StringIO
from datetime import datetime
from typing import List, Dict
from collections import defaultdict
import statistics
from backend.db import get_db
from backend.models import Signal, Citation
from backend.config import settings

async def fetch_csv(url: str) -> str:
    """Fetch CSV content from URL"""
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        return response.text

def parse_etf_flows_csv(csv_content: str) -> List[dict]:
    """Parse ETF flows CSV with flexible column detection"""
    reader = csv.DictReader(StringIO(csv_content))
    
    # Detect columns (case-insensitive)
    headers = {k.lower(): k for k in reader.fieldnames or []}
    
    date_col = headers.get("date") or headers.get("Date") or headers.get("DATE")
    ticker_col = headers.get("ticker") or headers.get("Ticker") or headers.get("TICKER") or headers.get("symbol")
    flow_col = headers.get("flow") or headers.get("Flow") or headers.get("FLOW") or headers.get("net_flow")
    
    if not (date_col and ticker_col and flow_col):
        raise ValueError(f"CSV missing required columns. Found: {list(headers.keys())}")
    
    rows = []
    for row in reader:
        try:
            rows.append({
                "date": row[date_col],
                "ticker": row[ticker_col],
                "flow": float(row[flow_col]),
            })
        except (ValueError, KeyError):
            continue
    
    return rows

def compute_rolling_zscore(flows: List[dict], window_days: int = 60) -> List[dict]:
    """Compute rolling z-score for each ticker"""
    # Group by ticker
    by_ticker = defaultdict(list)
    for row in flows:
        by_ticker[row["ticker"]].append(row)
    
    results = []
    
    for ticker, ticker_flows in by_ticker.items():
        # Sort by date
        ticker_flows.sort(key=lambda x: x["date"])
        
        for i, row in enumerate(ticker_flows):
            # Get trailing window
            start_idx = max(0, i - window_days)
            window = [f["flow"] for f in ticker_flows[start_idx:i+1]]
            
            if len(window) < 2:
                z_score = 0.0
            else:
                mean = statistics.mean(window)
                stdev = statistics.stdev(window)
                z_score = (row["flow"] - mean) / stdev if stdev > 0 else 0.0
            
            results.append({
                "date": row["date"],
                "ticker": ticker,
                "flow": row["flow"],
                "z_score": z_score,
            })
    
    return results

def load_sector_map(json_str: str) -> Dict[str, str]:
    """Load ETF ticker to sector mapping from JSON string"""
    if not json_str:
        return {}
    try:
        return json.loads(json_str)
    except:
        return {}

def aggregate_by_sector(flows_with_z: List[dict], sector_map: Dict[str, str]) -> List[dict]:
    """Aggregate z-scores by sector"""
    by_sector_date = defaultdict(list)
    
    for row in flows_with_z:
        ticker = row["ticker"]
        sector = sector_map.get(ticker)
        if not sector:
            continue
        
        key = (row["date"], sector)
        by_sector_date[key].append(row["z_score"])
    
    results = []
    for (date, sector), z_scores in by_sector_date.items():
        sector_z = statistics.mean(z_scores)
        results.append({
            "date": date,
            "sector": sector,
            "z_score": sector_z,
        })
    
    return results

async def run_etf_flows_etl() -> dict:
    """Run ETF flows ETL pipeline"""
    db = get_db()
    
    # Parse CSV URLs
    csv_urls = [u.strip() for u in settings.ETF_FLOWS_CSV_URLS.split(",") if u.strip()]
    if not csv_urls:
        return {"status": "skipped", "reason": "ETF_FLOWS_CSV_URLS not configured"}
    
    # Load sector map
    sector_map = load_sector_map(settings.ETF_SECTOR_MAP_JSON)
    
    signals_created = 0
    signals_skipped = 0
    
    for csv_url in csv_urls:
        # Fetch and parse CSV
        csv_content = await fetch_csv(csv_url)
        flows = parse_etf_flows_csv(csv_content)
        
        if not flows:
            continue
        
        # Compute z-scores
        flows_with_z = compute_rolling_zscore(flows, window_days=60)
        
        # Create per-ETF signals
        for row in flows_with_z:
            ticker = row["ticker"]
            date = row["date"]
            z_score = row["z_score"]
            
            # Idempotency key
            checksum_data = {
                "date": date,
                "ticker": ticker,
                "url": csv_url,
            }
            checksum = Signal.generate_checksum(checksum_data)
            
            existing = await db.signals.find_one({"checksum": checksum})
            if existing:
                signals_skipped += 1
                continue
            
            # Find asset
            asset = await db.assets.find_one({"ticker": ticker})
            asset_id = str(asset["_id"]) if asset else None
            
            # Create signal
            try:
                observed_at = datetime.strptime(date, "%Y-%m-%d")
            except:
                observed_at = datetime.utcnow()
            
            signal = Signal(
                signal_type="flow_pressure_etf",
                asset_id=asset_id,
                direction="up" if z_score > 0 else "down" if z_score < 0 else "neutral",
                magnitude=abs(z_score),
                observed_at=observed_at,
                created_at=datetime.utcnow(),
                raw={
                    "ticker": ticker,
                    "flow": row["flow"],
                    "z_score": z_score,
                },
                oa_citation=Citation(
                    source="ETF Flows CSV",
                    url=csv_url,
                    timestamp=datetime.utcnow().isoformat(),
                ),
                checksum=checksum,
            )
            
            signal_dict = signal.dict(exclude={"id"})
            await db.signals.insert_one(signal_dict)
            signals_created += 1
        
        # Aggregate by sector
        sector_aggregates = aggregate_by_sector(flows_with_z, sector_map)
        
        for row in sector_aggregates:
            sector = row["sector"]
            date = row["date"]
            z_score = row["z_score"]
            
            # Idempotency key
            checksum_data = {
                "date": date,
                "sector": sector,
                "url": csv_url,
            }
            checksum = Signal.generate_checksum(checksum_data)
            
            existing = await db.signals.find_one({"checksum": checksum})
            if existing:
                signals_skipped += 1
                continue
            
            # Create sector signal
            try:
                observed_at = datetime.strptime(date, "%Y-%m-%d")
            except:
                observed_at = datetime.utcnow()
            
            signal = Signal(
                signal_type="flow_pressure",
                value_text=sector,  # Store sector name for theme mapping
                direction="up" if z_score > 0 else "down" if z_score < 0 else "neutral",
                magnitude=abs(z_score),
                observed_at=observed_at,
                created_at=datetime.utcnow(),
                raw={
                    "sector": sector,
                    "z_score": z_score,
                },
                oa_citation=Citation(
                    source="ETF Flows Sector Aggregate",
                    url=csv_url,
                    timestamp=datetime.utcnow().isoformat(),
                ),
                checksum=checksum,
            )
            
            signal_dict = signal.dict(exclude={"id"})
            await db.signals.insert_one(signal_dict)
            signals_created += 1
    
    return {
        "csv_urls_processed": len(csv_urls),
        "signals_created": signals_created,
        "signals_skipped": signals_skipped,
    }
