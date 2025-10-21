"""Coinbase Advanced Trade API integration"""
import httpx
from typing import Dict, Any, Optional, List
from backend.logging_config import get_logger

logger = get_logger(__name__)

class CoinbaseAdapter:
    """Adapter for Coinbase Advanced Trade API"""
    
    def __init__(self, api_key: str = None, secret_key: str = None, paper_mode: bool = True):
        self.api_key = api_key
        self.api_secret = secret_key
        self.paper_mode = paper_mode
        
        self.base_url = "https://api.coinbase.com/api/v3/brokerage"
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}" if api_key else ""
        }
    
    async def get_account(self) -> Dict[str, Any]:
        """Get account information"""
        if not self.api_key:
            return {"error": "Coinbase not configured"}
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/accounts",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Coinbase account error: {e}")
            return {"error": str(e)}
    
    async def get_positions(self) -> List[Dict[str, Any]]:
        """Get all account balances"""
        if not self.api_key:
            return []
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/accounts",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    accounts = response.json().get("accounts", [])
                    # Filter to non-zero balances
                    return [acc for acc in accounts if float(acc.get("available_balance", {}).get("value", 0)) > 0]
                else:
                    return []
        except Exception as e:
            logger.error(f"Coinbase positions error: {e}")
            return []
    
    async def place_order(
        self,
        ticker: str,
        side: str,
        qty: Optional[float] = None,
        notional: Optional[float] = None,
        order_type: str = "market",
        **kwargs
    ) -> Dict[str, Any]:
        """Place order on Coinbase"""
        if not self.api_key:
            return {"error": "Coinbase not configured"}
        
        # Ticker format: BTC-USD
        product_id = ticker if "-" in ticker else f"{ticker}-USD"
        
        order_data = {
            "product_id": product_id,
            "side": side.upper(),
            "order_configuration": {}
        }
        
        if order_type == "market":
            if notional:
                order_data["order_configuration"]["market_market_ioc"] = {
                    "quote_size": str(notional)
                }
            elif qty:
                order_data["order_configuration"]["market_market_ioc"] = {
                    "base_size": str(qty)
                }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/orders",
                    headers=self.headers,
                    json=order_data,
                    timeout=10.0
                )
                
                if response.status_code in [200, 201]:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Coinbase order error: {e}")
            return {"error": str(e)}
    
    async def get_latest_price(self, ticker: str) -> Optional[float]:
        """Get latest price"""
        product_id = ticker if "-" in ticker else f"{ticker}-USD"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/products/{product_id}/ticker",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return float(response.json().get("price", 0))
                else:
                    return None
        except Exception as e:
            logger.error(f"Coinbase price error: {e}")
            return None
