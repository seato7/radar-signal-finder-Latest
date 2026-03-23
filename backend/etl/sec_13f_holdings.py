import httpx
from datetime import datetime
from typing import Dict, List, Optional
from xml.etree import ElementTree as ET
from backend.db import get_db
from backend.config import settings
from backend.models import Signal, Citation

async def fetch_cusip_mappings() -> Dict[str, str]:
    """Load CUSIP->ticker mappings from configured CSV URLs"""
    cusip_map = {}
    
    if not settings.CUSIP_MAP_CSV_URLS:
        return cusip_map
    
    urls = [u.strip() for u in settings.CUSIP_MAP_CSV_URLS.split(",") if u.strip()]
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for url in urls:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                lines = resp.text.strip().split("\n")
                
                # Skip header
                for line in lines[1:]:
                    parts = line.split(",")
                    if len(parts) >= 2:
                        cusip = parts[0].strip()
                        ticker = parts[1].strip()
                        if cusip and ticker:
                            cusip_map[cusip] = ticker
            except Exception as e:
                print(f"Warning: Failed to fetch CUSIP map from {url}: {e}")
    
    return cusip_map

async def lookup_openfigi(cusip: str) -> Optional[str]:
    """Lookup ticker via OpenFIGI API if key is configured"""
    if not settings.OPENFIGI_API_KEY:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.openfigi.com/v3/mapping",
                json=[{"idType": "ID_CUSIP", "idValue": cusip}],
                headers={"X-OPENFIGI-APIKEY": settings.OPENFIGI_API_KEY}
            )
            resp.raise_for_status()
            data = resp.json()
            
            if data and len(data) > 0 and "data" in data[0]:
                for item in data[0]["data"]:
                    if "ticker" in item:
                        return item["ticker"]
        
    except Exception as e:
        print(f"OpenFIGI lookup failed for {cusip}: {e}")
    
    return None

def normalize_period_ended(period_str: str) -> str:
    """Normalize period_ended to YYYY-MM-DD format"""
    # Try ISO format first
    try:
        dt = datetime.fromisoformat(period_str.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    
    # Try common date formats
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%Y%m%d"]:
        try:
            dt = datetime.strptime(period_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    
    # If all else fails, return as-is
    return period_str

async def parse_infotable_xml(xml_content: str, filing_url: str, manager_name: str, period_ended: str) -> List[Dict]:
    """Parse 13F infoTable XML and extract positions"""
    positions = []
    
    try:
        root = ET.fromstring(xml_content)
        
        # Try to extract period from XML if not provided or if XML has it
        if not period_ended or period_ended == "":
            period_elem = root.find(".//{*}periodOfReport")
            if period_elem is not None and period_elem.text:
                period_ended = normalize_period_ended(period_elem.text.strip())
        else:
            period_ended = normalize_period_ended(period_ended)
        
        # Handle namespaces
        ns = {"ns": "http://www.sec.gov/edgar/document/thirteenf/informationtable"}
        info_tables = root.findall(".//ns:infoTable", ns)
        
        # Fallback without namespace
        if not info_tables:
            info_tables = root.findall(".//infoTable")
        
        for table in info_tables:
            try:
                cusip_elem = table.find(".//cusip") or table.find(".//{*}cusip")
                value_elem = table.find(".//value") or table.find(".//{*}value")
                shares_elem = table.find(".//shrsOrPrnAmt/sshPrnamt") or table.find(".//{*}sshPrnamt")
                
                if cusip_elem is not None and value_elem is not None:
                    cusip = cusip_elem.text.strip()
                    value = float(value_elem.text) if value_elem.text else 0.0
                    shares = float(shares_elem.text) if shares_elem is not None and shares_elem.text else 0.0
                    
                    positions.append({
                        "cusip": cusip,
                        "value": value,
                        "shares": shares,
                        "manager": manager_name,
                        "period_ended": period_ended,
                        "filing_url": filing_url
                    })
            except Exception as e:
                print(f"Warning: Failed to parse position in 13F: {e}")
                continue
    
    except Exception as e:
        print(f"Error parsing 13F XML: {e}")
    
    return positions

async def get_prior_position(manager: str, cusip: str, period_ended: str) -> Optional[Dict]:
    """Retrieve the prior quarter position for comparison"""
    db = get_db()
    
    # Query signals collection for previous holdings
    prior = await db.signals.find_one({
        "signal_type": {"$regex": "^bigmoney_hold"},
        "raw.manager": manager,
        "raw.cusip": cusip,
        "raw.period_ended": {"$lt": period_ended}
    }, sort=[("raw.period_ended", -1)])
    
    if prior:
        return {
            "value": prior["raw"].get("value", 0.0),
            "shares": prior["raw"].get("shares", 0.0)
        }
    
    return None

def classify_delta(prior_value: Optional[float], current_value: float) -> str:
    """Classify position change: new, increase, decrease, unchanged"""
    if prior_value is None or prior_value == 0:
        return "bigmoney_hold_new"
    
    if current_value > prior_value * 1.05:  # >5% increase
        return "bigmoney_hold_increase"
    elif current_value < prior_value * 0.95:  # >5% decrease
        return "bigmoney_hold_decrease"
    else:
        return "bigmoney_hold"

async def handle_amendment(filing_url: str, manager_name: str, period_ended: str) -> None:
    """Mark prior filings for same period as superseded by amendment"""
    db = get_db()
    
    # If this is an amendment (contains /A in accession), mark prior signals as superseded
    if "/A" in filing_url or "-A" in filing_url:
        await db.signals.update_many(
            {
                "signal_type": {"$regex": "^bigmoney_hold"},
                "raw.manager": manager_name,
                "raw.period_ended": period_ended,
                "raw.superseded": {"$ne": True}
            },
            {"$set": {"raw.superseded": True}}
        )

async def run_13f_holdings_etl(filing_url: str, xml_content: str, manager_name: str, period_ended: str) -> Dict:
    """Process a single 13F-HR filing with delta computation"""
    db = get_db()
    
    # Handle amendments
    await handle_amendment(filing_url, manager_name, period_ended)
    
    # Load CUSIP mappings
    cusip_map = await fetch_cusip_mappings()
    
    # Parse positions (also normalizes period_ended)
    positions = await parse_infotable_xml(xml_content, filing_url, manager_name, period_ended)
    
    inserted = 0
    skipped = 0
    unmapped_cusips = []
    
    for pos in positions:
        cusip = pos["cusip"]
        
        # Get prior position for delta
        prior = await get_prior_position(pos["manager"], cusip, period_ended)
        prior_value = prior["value"] if prior else None
        
        # Classify delta
        signal_type = classify_delta(prior_value, pos["value"])
        
        # Map CUSIP to ticker with diagnostics
        ticker = cusip_map.get(cusip)
        map_status = "mapped"
        
        if not ticker:
            if cusip not in cusip_map:
                map_status = "not_in_csv"
            
            # Try OpenFIGI if not found
            ticker = await lookup_openfigi(cusip)
            if ticker:
                map_status = "openfigi_mapped"
            elif not settings.OPENFIGI_API_KEY:
                map_status = "no_openfigi_key"
            else:
                map_status = "openfigi_error"
        
        if not ticker:
            unmapped_cusips.append({"cusip": cusip, "value": pos["value"], "map_status": map_status})
        
        # Generate checksum for idempotency (filing_url included so amendments get unique checksums)
        checksum_data = {
            "manager": pos["manager"],
            "period_ended": pos["period_ended"],
            "cusip": cusip,
            "value": pos["value"],
            "shares": pos["shares"],
            "filing_url": filing_url
        }
        checksum = Signal.generate_checksum(checksum_data)

        # Check if already exists
        existing = await db.signals.find_one({"checksum": checksum})
        if existing:
            skipped += 1
            continue
        
        # Create signal
        signal = Signal(
            signal_type=signal_type,
            asset_id=None,  # Will be linked if ticker resolves
            theme_id=None,  # Will be mapped by theme_mapper
            value_text=f"{pos['manager']} - {cusip}",
            direction="up" if "increase" in signal_type or "new" in signal_type else "neutral",
            magnitude=pos["value"] / 1000.0,  # Scale down for scoring
            observed_at=datetime.fromisoformat(period_ended),
            raw={
                "manager": pos["manager"],
                "cusip": cusip,
                "ticker": ticker,
                "value": pos["value"],
                "shares": pos["shares"],
                "period_ended": pos["period_ended"],
                "prior_value": prior_value,
                "map_status": map_status,
                "superseded": False
            },
            oa_citation=Citation(
                source=f"SEC 13F-HR: {pos['manager']}",
                url=filing_url,
                timestamp=period_ended
            ),
            source_id=filing_url,
            checksum=checksum
        )
        
        # Insert
        await db.signals.insert_one(signal.model_dump(exclude={"id"}))
        inserted += 1
        
        # Update asset if ticker resolved
        if ticker:
            await db.assets.update_one(
                {"ticker": ticker},
                {"$set": {"metadata.cusip": cusip}},
                upsert=False
            )
    
    return {
        "inserted": inserted,
        "skipped": skipped,
        "total_positions": len(positions),
        "unmapped_cusips": unmapped_cusips[:10]  # Top 10 unmapped
    }

async def diagnose_13f_mappings(limit: int = 50) -> Dict:
    """Diagnose recent 13F CUSIP mapping issues"""
    db = get_db()
    
    # Get recent 13F signals
    recent_signals = await db.signals.find(
        {"signal_type": {"$regex": "^bigmoney_hold"}},
        sort=[("observed_at", -1)],
        limit=limit
    ).to_list(None)
    
    # Count map statuses
    status_counts = {}
    unmapped_cusips = {}
    
    for sig in recent_signals:
        map_status = sig.get("raw", {}).get("map_status", "unknown")
        status_counts[map_status] = status_counts.get(map_status, 0) + 1
        
        if map_status != "mapped" and map_status != "openfigi_mapped":
            cusip = sig.get("raw", {}).get("cusip", "unknown")
            value = sig.get("raw", {}).get("value", 0)
            if cusip not in unmapped_cusips or unmapped_cusips[cusip]["value"] < value:
                unmapped_cusips[cusip] = {
                    "value": value,
                    "map_status": map_status,
                    "manager": sig.get("raw", {}).get("manager", "unknown")
                }
    
    # Sort by value and take top 10
    top_unmapped = sorted(
        [{"cusip": k, **v} for k, v in unmapped_cusips.items()],
        key=lambda x: x["value"],
        reverse=True
    )[:10]
    
    return {
        "total_signals_checked": len(recent_signals),
        "status_counts": status_counts,
        "top_unmapped_cusips": top_unmapped
    }
