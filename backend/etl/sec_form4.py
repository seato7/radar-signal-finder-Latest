"""SEC Form 4 Insider Transactions ETL"""
import feedparser
from datetime import datetime
from typing import List
import httpx
from xml.etree import ElementTree as ET
from backend.db import get_db
from backend.models import Signal, Citation
from backend.config import settings

async def fetch_form4_atom_feed(days_back: int = 7) -> List[dict]:
    """Fetch recent Form 4 filings from SEC Atom feed"""
    url = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=100&output=atom"
    
    headers = {
        "User-Agent": settings.SEC_USER_AGENT,
        "Accept-Language": settings.SEC_ACCEPT_LANGUAGE,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, timeout=30.0)
        response.raise_for_status()
    
    feed = feedparser.parse(response.text)
    filings = []
    
    for entry in feed.entries:
        filings.append({
            "title": entry.title,
            "link": entry.link,
            "summary": entry.summary,
            "updated": entry.updated,
        })
    
    return filings

async def fetch_form4_xml(filing_url: str) -> str:
    """Fetch the XML content of a Form 4 filing"""
    # Convert filing URL to XML URL
    # Example: https://www.sec.gov/cgi-bin/... -> https://www.sec.gov/Archives/edgar/data/.../...xml
    accession = filing_url.split("accession-number=")[-1] if "accession-number=" in filing_url else ""
    
    if not accession:
        return ""
    
    # Build XML URL (simplified - real impl would need CIK parsing)
    xml_url = filing_url.replace("/cgi-bin/browse-edgar?", "/Archives/edgar/data/").replace("accession-number=", "") + ".xml"
    
    headers = {
        "User-Agent": settings.SEC_USER_AGENT,
        "Accept-Language": settings.SEC_ACCEPT_LANGUAGE,
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(xml_url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.text
        except Exception:
            return ""

def parse_form4_xml(xml_content: str) -> dict:
    """Parse Form 4 XML and extract transactions"""
    if not xml_content:
        return {}
    
    try:
        root = ET.fromstring(xml_content)
    except Exception:
        return {}
    
    ns = {"": "http://www.sec.gov/edgar/document/ownership/2006-05-01"}
    
    # Extract issuer info
    issuer = root.find(".//issuer", ns)
    issuer_name = issuer.findtext("issuerName", "", ns) if issuer else ""
    issuer_ticker = issuer.findtext("issuerTradingSymbol", "", ns) if issuer else ""
    
    # Extract reporting owner
    owner = root.find(".//reportingOwner", ns)
    reported_holder = ""
    if owner:
        owner_id = owner.find("reportingOwnerId", ns)
        if owner_id:
            reported_holder = owner_id.findtext("rptOwnerName", "", ns)
    
    # Extract transactions
    transactions = []
    for tx in root.findall(".//nonDerivativeTransaction", ns):
        tx_amounts = tx.find("transactionAmounts", ns)
        if not tx_amounts:
            continue
        
        code = tx.find("transactionCoding", ns)
        tx_code = code.findtext("transactionCode", "", ns) if code else ""
        
        date = tx.findtext("transactionDate/value", "", ns)
        shares = tx_amounts.findtext("transactionShares/value", "0", ns)
        price = tx_amounts.findtext("transactionPricePerShare/value", "0", ns)
        acquired_disposed = tx_amounts.findtext("transactionAcquiredDisposedCode/value", "", ns)
        
        transactions.append({
            "code": tx_code,
            "date": date,
            "shares": float(shares) if shares else 0.0,
            "price": float(price) if price else 0.0,
            "acquired_disposed": acquired_disposed,
        })
    
    return {
        "issuer_name": issuer_name,
        "issuer_ticker": issuer_ticker,
        "reported_holder": reported_holder,
        "transactions": transactions,
    }

async def run_form4_etl(limit: int = 100) -> dict:
    """Run Form 4 ETL pipeline"""
    db = get_db()
    
    # Fetch recent filings
    filings = await fetch_form4_atom_feed(days_back=7)
    filings = filings[:limit]
    
    signals_created = 0
    signals_skipped = 0
    
    for filing in filings:
        filing_url = filing["link"]
        
        # Fetch and parse XML
        xml_content = await fetch_form4_xml(filing_url)
        parsed = parse_form4_xml(xml_content)
        
        if not parsed or not parsed.get("issuer_ticker"):
            continue
        
        ticker = parsed["issuer_ticker"]
        issuer_name = parsed["issuer_name"]
        reported_holder = parsed["reported_holder"]
        
        # Process each transaction
        for tx in parsed.get("transactions", []):
            code = tx["code"]
            date = tx["date"]
            shares = tx["shares"]
            price = tx["price"]
            acquired_disposed = tx["acquired_disposed"]
            
            # Map transaction code to signal type
            if code == "P" or acquired_disposed == "A":  # Purchase or Acquired
                signal_type = "insider_buy"
                direction = "up"
            elif code == "S" or acquired_disposed == "D":  # Sale or Disposed
                signal_type = "insider_sell"
                direction = "down"
            else:
                continue
            
            # Generate idempotency key
            accession = filing_url.split("=")[-1] if "=" in filing_url else filing_url
            checksum_data = {
                "accession": accession,
                "reported_holder": reported_holder,
                "ticker": ticker,
                "transaction_date": date,
                "code": code,
                "shares": shares,
                "price": price,
            }
            checksum = Signal.generate_checksum(checksum_data)
            
            # Check if signal already exists
            existing = await db.signals.find_one({"checksum": checksum})
            if existing:
                signals_skipped += 1
                continue
            
            # Find or create asset
            asset = await db.assets.find_one({"ticker": ticker, "exchange": "US"})
            asset_id = str(asset["_id"]) if asset else None
            
            if not asset_id:
                # Create asset if not exists
                from bson import ObjectId
                asset_doc = {
                    "_id": ObjectId(),
                    "ticker": ticker,
                    "exchange": "US",
                    "name": issuer_name,
                    "metadata": {},
                }
                await db.assets.insert_one(asset_doc)
                asset_id = str(asset_doc["_id"])
            
            # Create signal
            try:
                observed_at = datetime.strptime(date, "%Y-%m-%d")
            except Exception:
                observed_at = datetime.utcnow()
            
            signal = Signal(
                signal_type=signal_type,
                asset_id=asset_id,
                direction=direction,
                magnitude=1.0,
                observed_at=observed_at,
                created_at=datetime.utcnow(),
                raw={
                    "issuer_name": issuer_name,
                    "reported_holder": reported_holder,
                    "code": code,
                    "shares": shares,
                    "price": price,
                    "acquired_disposed": acquired_disposed,
                },
                oa_citation=Citation(
                    source="SEC Form 4",
                    url=filing_url,
                    timestamp=filing.get("updated", ""),
                ),
                checksum=checksum,
            )
            
            signal_dict = signal.dict(exclude={"id"})
            signal_dict["ticker"] = ticker
            await db.signals.insert_one(signal_dict)
            signals_created += 1
    
    return {
        "filings_processed": len(filings),
        "signals_created": signals_created,
        "signals_skipped": signals_skipped,
    }
