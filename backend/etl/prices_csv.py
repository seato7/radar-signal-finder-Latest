"""Price CSV ETL - ingest price data for backtesting"""
import hashlib
import csv
from typing import Dict
import httpx
from io import StringIO
from backend.db import get_db
from backend.config import settings

async def fetch_csv(url: str) -> str:
    """Fetch CSV from URL"""
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        return response.text

def parse_price_row(row: Dict[str, str], url: str) -> Dict:
    """Parse a single price row"""
    # Expected columns: ticker, date, close (or similar)
    ticker = row.get("ticker", row.get("symbol", "")).upper()
    date = row.get("date", row.get("Date", ""))
    close = float(row.get("close", row.get("Close", row.get("price", 0))))
    
    # Generate checksum
    checksum_data = f"{ticker}|{date}|{close}|{url}"
    checksum = hashlib.sha256(checksum_data.encode()).hexdigest()
    
    return {
        "ticker": ticker,
        "date": date,
        "close": close,
        "checksum": checksum,
        "asset_id": None  # Can be populated later
    }

async def run_prices_etl() -> Dict[str, int]:
    """
    Run prices CSV ETL pipeline.
    
    Returns:
        Dict with inserted and skipped counts
    """
    db = get_db()
    
    # Parse CSV URLs from config
    csv_urls = [url.strip() for url in settings.PRICE_CSV_URLS.split(",") if url.strip()]
    
    if not csv_urls:
        return {"inserted": 0, "skipped": 0, "error": "No PRICE_CSV_URLS configured"}
    
    inserted = 0
    skipped = 0
    
    for url in csv_urls:
        try:
            csv_text = await fetch_csv(url)
            
            # Parse CSV
            reader = csv.DictReader(StringIO(csv_text))
            
            for row in reader:
                try:
                    price_doc = parse_price_row(row, url)
                    
                    if not price_doc["ticker"] or not price_doc["date"]:
                        skipped += 1
                        continue
                    
                    # Check if already exists
                    existing = await db.prices.find_one({"checksum": price_doc["checksum"]})
                    if existing:
                        skipped += 1
                        continue
                    
                    # Insert
                    await db.prices.insert_one(price_doc)
                    inserted += 1
                    
                except Exception:
                    # Skip bad rows
                    skipped += 1
                    continue
                    
        except Exception as e:
            print(f"Error fetching price CSV {url}: {str(e)}")
            continue
    
    return {"inserted": inserted, "skipped": skipped}
