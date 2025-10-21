"""Interactive Brokers (IBKR) integration via Client Portal API"""
import httpx
from typing import Dict, Any, Optional, List
from backend.logging_config import get_logger

logger = get_logger(__name__)

class IBKRAdapter:
    """Adapter for Interactive Brokers Client Portal API"""
    
    def __init__(self, api_key: str = None, secret_key: str = None, paper_mode: bool = True):
        self.api_key = api_key
        self.secret_key = secret_key  # Gateway session token
        self.paper_mode = paper_mode
        
        # IBKR endpoints
        self.base_url = "https://api.ibkr.com/v1/api"
        
        self.headers = {
            "Content-Type": "application/json"
        }
    
    async def get_account(self) -> Dict[str, Any]:
        """Get account information"""
        if not self.api_key:
            return {"error": "IBKR not configured"}
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/portfolio/accounts",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"IBKR account error: {e}")
            return {"error": str(e)}
    
    async def get_positions(self) -> List[Dict[str, Any]]:
        """Get all open positions"""
        if not self.api_key:
            return []
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/portfolio/positions/0",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return []
        except Exception as e:
            logger.error(f"IBKR positions error: {e}")
            return []
    
    async def place_order(
        self,
        ticker: str,
        side: str,
        qty: float,
        order_type: str = "MKT",
        **kwargs
    ) -> Dict[str, Any]:
        """Place order via IBKR"""
        if not self.api_key:
            return {"error": "IBKR not configured"}
        
        order_data = {
            "conid": ticker,  # IBKR uses contract IDs
            "orderType": order_type,
            "side": "BUY" if side == "buy" else "SELL",
            "quantity": qty
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/iserver/account/orders",
                    headers=self.headers,
                    json=order_data,
                    timeout=10.0
                )
                
                if response.status_code in [200, 201]:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"IBKR order error: {e}")
            return {"error": str(e)}
    
    async def get_latest_price(self, ticker: str) -> Optional[float]:
        """Get latest price"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/iserver/marketdata/snapshot",
                    params={"conids": ticker, "fields": "31"},
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data[0].get("31") if data else None
                else:
                    return None
        except Exception as e:
            logger.error(f"IBKR price error: {e}")
            return None
