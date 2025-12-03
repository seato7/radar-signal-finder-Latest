"""Supabase Sync Service - Push data from Railway to Supabase"""
import asyncio
import httpx
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
from backend.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
REQUEST_TIMEOUT = 30.0


class SupabaseSync:
    """Syncs data from Railway backend to Supabase"""
    
    def __init__(self):
        self.url = settings.SUPABASE_URL
        self.key = settings.SUPABASE_SERVICE_KEY
        self.session: Optional[httpx.AsyncClient] = None
        
        if not self.url or not self.key:
            logger.warning("Supabase credentials not configured")
    
    @property
    def is_configured(self) -> bool:
        return bool(self.url and self.key)
    
    async def __aenter__(self):
        if self.is_configured:
            self.session = httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT,
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                }
            )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
    
    async def upsert_prices(self, prices: List[Dict]) -> Tuple[int, int, List[str]]:
        """
        Upsert price records to Supabase prices table.
        
        Returns:
            Tuple of (inserted_count, failed_count, errors)
        """
        if not self.is_configured:
            return 0, len(prices), ["Supabase not configured"]
        
        if not prices:
            return 0, 0, []
        
        inserted = 0
        failed = 0
        errors = []
        
        # Process in batches
        for i in range(0, len(prices), BATCH_SIZE):
            batch = prices[i:i + BATCH_SIZE]
            
            # Records should already have correct schema from yahoo_prices.py:
            # asset_id, ticker, date, close, checksum
            # Just pass them through without transformation
            records = []
            for p in batch:
                records.append({
                    "asset_id": p.get("asset_id"),
                    "ticker": p["ticker"],
                    "date": p["date"],
                    "close": p["close"],
                    "checksum": p["checksum"]
                })
            
            try:
                # Use upsert with on_conflict on checksum (unique constraint)
                response = await self.session.post(
                    f"{self.url}/rest/v1/prices",
                    json=records,
                    params={"on_conflict": "checksum"},
                    headers={"Prefer": "resolution=merge-duplicates,return=minimal"}
                )
                
                if response.status_code in (200, 201, 204):
                    inserted += len(batch)
                    logger.info(f"Upserted {len(batch)} prices to Supabase")
                else:
                    failed += len(batch)
                    error_msg = f"Supabase error {response.status_code}: {response.text[:200]}"
                    errors.append(error_msg)
                    logger.error(error_msg)
                    
            except Exception as e:
                failed += len(batch)
                errors.append(str(e))
                logger.error(f"Failed to upsert batch: {str(e)}")
        
        return inserted, failed, errors
    
    async def log_ingestion(
        self,
        etl_name: str,
        status: str,
        rows_inserted: int = 0,
        rows_skipped: int = 0,
        duration_seconds: int = 0,
        error_message: Optional[str] = None,
        source_used: str = "yahoo_finance",
        metadata: Optional[Dict] = None
    ) -> bool:
        """Log ingestion run to Supabase ingest_logs table"""
        if not self.is_configured:
            return False
        
        now = datetime.now(timezone.utc).isoformat()
        
        record = {
            "etl_name": etl_name,
            "status": status,
            "started_at": now,
            "completed_at": now,
            "duration_seconds": duration_seconds,
            "rows_inserted": rows_inserted,
            "rows_skipped": rows_skipped,
            "source_used": source_used,
            "error_message": error_message,
            "metadata": metadata or {}
        }
        
        try:
            response = await self.session.post(
                f"{self.url}/rest/v1/ingest_logs",
                json=record
            )
            return response.status_code in (200, 201, 204)
        except Exception as e:
            logger.error(f"Failed to log ingestion: {str(e)}")
            return False
    
    async def log_function_status(
        self,
        function_name: str,
        status: str,
        rows_inserted: int = 0,
        duration_ms: int = 0,
        error_message: Optional[str] = None,
        source_used: str = "railway"
    ) -> bool:
        """Log function execution to Supabase function_status table"""
        if not self.is_configured:
            return False
        
        record = {
            "function_name": function_name,
            "status": status,
            "rows_inserted": rows_inserted,
            "duration_ms": duration_ms,
            "source_used": source_used,
            "error_message": error_message
        }
        
        try:
            response = await self.session.post(
                f"{self.url}/rest/v1/function_status",
                json=record
            )
            return response.status_code in (200, 201, 204)
        except Exception as e:
            logger.error(f"Failed to log function status: {str(e)}")
            return False
    
    async def get_assets(self) -> List[Dict]:
        """Fetch all assets from Supabase"""
        if not self.is_configured:
            return []
        
        try:
            response = await self.session.get(
                f"{self.url}/rest/v1/assets",
                params={"select": "id,ticker,asset_class,exchange,name"}
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to fetch assets: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error fetching assets: {str(e)}")
            return []
    
    async def get_stale_assets(self, max_age_minutes: int = 15) -> List[Dict]:
        """Fetch assets that haven't been updated recently"""
        if not self.is_configured:
            return []
        
        try:
            # Get all assets
            assets = await self.get_assets()
            
            # Get recent price updates
            response = await self.session.get(
                f"{self.url}/rest/v1/prices",
                params={
                    "select": "ticker,updated_at",
                    f"updated_at": f"gte.{datetime.now(timezone.utc).isoformat()}"
                }
            )
            
            recent_tickers = set()
            if response.status_code == 200:
                for price in response.json():
                    recent_tickers.add(price["ticker"])
            
            # Return assets without recent prices
            return [a for a in assets if a["ticker"] not in recent_tickers]
            
        except Exception as e:
            logger.error(f"Error fetching stale assets: {str(e)}")
            return await self.get_assets()  # Fallback to all assets


async def sync_prices_to_supabase(prices: List[Dict]) -> Dict:
    """
    Convenience function to sync prices to Supabase.
    
    Returns:
        Dict with inserted, failed, errors
    """
    async with SupabaseSync() as sync:
        inserted, failed, errors = await sync.upsert_prices(prices)
        return {
            "inserted": inserted,
            "failed": failed,
            "errors": errors
        }
