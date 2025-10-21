"""Binance API integration"""
import httpx
import hmac
import hashlib
import time
from typing import Dict, Any, Optional, List
from backend.logging_config import get_logger

logger = get_logger(__name__)

class BinanceAdapter:
    """Adapter for Binance API"""
    
    def __init__(self, api_key: str = None, secret_key: str = None, paper_mode: bool = True):
        self.api_key = api_key
        self.api_secret = secret_key
        self.paper_mode = paper_mode
        
        # Use testnet if paper mode
        if paper_mode:
            self.base_url = "https://testnet.binance.vision/api"
        else:
            self.base_url = "https://api.binance.com/api"
        
        self.headers = {
            "X-MBX-APIKEY": api_key if api_key else ""
        }
    
    def _sign_request(self, params: Dict) -> Dict:
        """Sign request with HMAC SHA256"""
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        signature = hmac.new(
            self.api_secret.encode() if self.api_secret else b"",
            query_string.encode(),
            hashlib.sha256
        ).hexdigest()
        params["signature"] = signature
        return params
    
    async def get_account(self) -> Dict[str, Any]:
        """Get account information"""
        if not self.api_key:
            return {"error": "Binance not configured"}
        
        params = {"timestamp": int(time.time() * 1000)}
        params = self._sign_request(params)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v3/account",
                    headers=self.headers,
                    params=params,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Binance account error: {e}")
            return {"error": str(e)}
    
    async def get_positions(self) -> List[Dict[str, Any]]:
        """Get all non-zero balances"""
        account = await self.get_account()
        if "error" in account:
            return []
        
        balances = account.get("balances", [])
        return [b for b in balances if float(b.get("free", 0)) > 0 or float(b.get("locked", 0)) > 0]
    
    async def place_order(
        self,
        ticker: str,
        side: str,
        qty: float,
        order_type: str = "MARKET",
        **kwargs
    ) -> Dict[str, Any]:
        """Place order on Binance"""
        if not self.api_key:
            return {"error": "Binance not configured"}
        
        # Symbol format: BTCUSDT
        symbol = ticker.replace("-", "").replace("/", "")
        
        params = {
            "symbol": symbol,
            "side": side.upper(),
            "type": order_type,
            "quantity": qty,
            "timestamp": int(time.time() * 1000)
        }
        
        params = self._sign_request(params)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v3/order",
                    headers=self.headers,
                    params=params,
                    timeout=10.0
                )
                
                if response.status_code in [200, 201]:
                    return response.json()
                else:
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Binance order error: {e}")
            return {"error": str(e)}
    
    async def get_latest_price(self, ticker: str) -> Optional[float]:
        """Get latest price"""
        symbol = ticker.replace("-", "").replace("/", "")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v3/ticker/price",
                    params={"symbol": symbol},
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return float(response.json().get("price", 0))
                else:
                    return None
        except Exception as e:
            logger.error(f"Binance price error: {e}")
            return None
