"""Kraken API integration"""
import httpx
import hmac
import hashlib
import base64
import time
from typing import Dict, Any, Optional, List
from backend.logging_config import get_logger

logger = get_logger(__name__)

class KrakenAdapter:
    """Adapter for Kraken API"""
    
    def __init__(self, api_key: str = None, secret_key: str = None, paper_mode: bool = True):
        self.api_key = api_key
        self.api_secret = secret_key
        self.paper_mode = paper_mode
        
        self.base_url = "https://api.kraken.com"
        
        self.headers = {
            "API-Key": api_key if api_key else ""
        }
    
    def _sign_request(self, endpoint: str, data: Dict) -> str:
        """Sign request for Kraken API"""
        postdata = "&".join([f"{k}={v}" for k, v in data.items()])
        encoded = (str(data["nonce"]) + postdata).encode()
        message = endpoint.encode() + hashlib.sha256(encoded).digest()
        
        signature = hmac.new(
            base64.b64decode(self.api_secret) if self.api_secret else b"",
            message,
            hashlib.sha512
        )
        return base64.b64encode(signature.digest()).decode()
    
    async def get_account(self) -> Dict[str, Any]:
        """Get account balance"""
        if not self.api_key:
            return {"error": "Kraken not configured"}
        
        endpoint = "/0/private/Balance"
        data = {"nonce": int(time.time() * 1000)}
        
        headers = self.headers.copy()
        headers["API-Sign"] = self._sign_request(endpoint, data)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                    data=data,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Kraken account error: {e}")
            return {"error": str(e)}
    
    async def get_positions(self) -> List[Dict[str, Any]]:
        """Get all positions"""
        account = await self.get_account()
        if "error" in account or account.get("error"):
            return []
        
        balances = account.get("result", {})
        return [{"asset": k, "balance": v} for k, v in balances.items() if float(v) > 0]
    
    async def place_order(
        self,
        ticker: str,
        side: str,
        qty: float,
        order_type: str = "market",
        **kwargs
    ) -> Dict[str, Any]:
        """Place order on Kraken"""
        if not self.api_key:
            return {"error": "Kraken not configured"}
        
        endpoint = "/0/private/AddOrder"
        
        # Kraken pair format: XBTUSDT
        pair = ticker.replace("-", "").replace("/", "")
        
        data = {
            "nonce": int(time.time() * 1000),
            "ordertype": order_type,
            "type": side,
            "volume": str(qty),
            "pair": pair
        }
        
        headers = self.headers.copy()
        headers["API-Sign"] = self._sign_request(endpoint, data)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                    data=data,
                    timeout=10.0
                )
                
                if response.status_code in [200, 201]:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Kraken order error: {e}")
            return {"error": str(e)}
    
    async def get_latest_price(self, ticker: str) -> Optional[float]:
        """Get latest price"""
        pair = ticker.replace("-", "").replace("/", "")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/0/public/Ticker",
                    params={"pair": pair},
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    result = response.json().get("result", {})
                    if result:
                        first_pair = list(result.values())[0]
                        return float(first_pair.get("c", [0])[0])
                return None
        except Exception as e:
            logger.error(f"Kraken price error: {e}")
            return None
