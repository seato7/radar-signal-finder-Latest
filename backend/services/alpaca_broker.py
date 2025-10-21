"""Alpaca broker integration for live trading (stocks + crypto)"""
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
from backend.logging_config import get_logger

logger = get_logger(__name__)

class AlpacaAdapter:
    """Adapter for Alpaca broker - supports stocks and crypto"""
    
    def __init__(self, api_key: str = None, secret_key: str = None, paper_mode: bool = True):
        self.api_key = api_key or os.getenv("ALPACA_API_KEY", "")
        self.secret_key = secret_key or os.getenv("ALPACA_SECRET_KEY", "")
        self.paper_mode = paper_mode
        
        # Alpaca endpoints
        if paper_mode:
            self.base_url = "https://paper-api.alpaca.markets"
            self.data_url = "https://data.alpaca.markets"
        else:
            self.base_url = "https://api.alpaca.markets"
            self.data_url = "https://data.alpaca.markets"
        
        self.headers = {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
            "Content-Type": "application/json"
        }
        
        # Crypto assets (Alpaca uses BTCUSD format)
        self.crypto_assets = {
            "BTC", "ETH", "LTC", "BCH", "AAVE", "AVAX", "BAT", "LINK",
            "CRV", "DOGE", "DOT", "GRT", "MKR", "SHIB", "UNI", "USDT"
        }
    
    def is_crypto(self, ticker: str) -> bool:
        """Determine if ticker is crypto"""
        # Remove USD suffix if present
        base = ticker.replace("USD", "").replace("/", "")
        return base in self.crypto_assets
    
    async def get_account(self) -> Dict[str, Any]:
        """Get account information"""
        if not self.api_key:
            return {"error": "Alpaca API keys not configured", "mock": True}
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v2/account",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Alpaca account error: {response.text}")
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Error fetching Alpaca account: {e}")
            return {"error": str(e)}
    
    async def get_positions(self) -> List[Dict[str, Any]]:
        """Get all open positions"""
        if not self.api_key:
            return []
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v2/positions",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Alpaca positions error: {response.text}")
                    return []
        except Exception as e:
            logger.error(f"Error fetching positions: {e}")
            return []
    
    async def get_position(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get position for specific ticker"""
        if not self.api_key:
            return None
        
        # Convert ticker format for crypto (BTC -> BTCUSD)
        symbol = ticker
        if self.is_crypto(ticker):
            base = ticker.replace("USD", "").replace("/", "")
            symbol = f"{base}USD"
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v2/positions/{symbol}",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 404:
                    return None  # No position
                else:
                    logger.error(f"Alpaca position error for {symbol}: {response.text}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching position for {ticker}: {e}")
            return None
    
    async def place_order(
        self,
        ticker: str,
        side: str,  # "buy" or "sell"
        qty: Optional[float] = None,
        notional: Optional[float] = None,
        order_type: str = "market",
        time_in_force: str = "day",
        limit_price: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Place an order on Alpaca
        
        Args:
            ticker: Stock ticker or crypto symbol
            side: "buy" or "sell"
            qty: Number of shares/coins (use for stocks, optional for crypto)
            notional: Dollar amount (use for crypto fractional orders)
            order_type: "market" or "limit"
            time_in_force: "day", "gtc", "ioc", "fok"
            limit_price: Required if order_type is "limit"
        """
        if not self.api_key:
            logger.warning("Alpaca not configured - returning mock order")
            return {
                "id": "mock_order_" + str(datetime.utcnow().timestamp()),
                "status": "filled",
                "filled_qty": qty or 0,
                "filled_avg_price": limit_price or 0,
                "mock": True
            }
        
        # Format symbol
        symbol = ticker
        is_crypto = self.is_crypto(ticker)
        if is_crypto:
            base = ticker.replace("USD", "").replace("/", "")
            symbol = f"{base}USD"
        
        # Build order payload
        order_data = {
            "symbol": symbol,
            "side": side,
            "type": order_type,
            "time_in_force": time_in_force if not is_crypto else "gtc"  # crypto must use gtc
        }
        
        # Add quantity or notional
        if qty is not None:
            order_data["qty"] = qty
        elif notional is not None:
            order_data["notional"] = notional
        else:
            return {"error": "Must specify qty or notional"}
        
        if order_type == "limit" and limit_price:
            order_data["limit_price"] = limit_price
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v2/orders",
                    headers=self.headers,
                    json=order_data,
                    timeout=10.0
                )
                
                if response.status_code in [200, 201]:
                    order = response.json()
                    logger.info(f"Order placed: {order['id']} - {side} {qty or notional} {symbol}")
                    return order
                else:
                    logger.error(f"Alpaca order error: {response.text}")
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Error placing order: {e}")
            return {"error": str(e)}
    
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel an open order"""
        if not self.api_key:
            return True  # Mock success
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.base_url}/v2/orders/{order_id}",
                    headers=self.headers,
                    timeout=10.0
                )
                
                return response.status_code == 204
        except Exception as e:
            logger.error(f"Error canceling order: {e}")
            return False
    
    async def get_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Get order status"""
        if not self.api_key:
            return None
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/v2/orders/{order_id}",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return None
        except Exception as e:
            logger.error(f"Error fetching order: {e}")
            return None
    
    async def close_position(self, ticker: str) -> Dict[str, Any]:
        """Close entire position for a ticker"""
        if not self.api_key:
            return {"mock": True, "status": "closed"}
        
        # Format symbol
        symbol = ticker
        if self.is_crypto(ticker):
            base = ticker.replace("USD", "").replace("/", "")
            symbol = f"{base}USD"
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.base_url}/v2/positions/{symbol}",
                    headers=self.headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Error closing position: {response.text}")
                    return {"error": response.text}
        except Exception as e:
            logger.error(f"Error closing position: {e}")
            return {"error": str(e)}
    
    async def get_latest_price(self, ticker: str) -> Optional[float]:
        """Get latest price for a ticker"""
        if not self.api_key:
            return None
        
        # Format symbol
        symbol = ticker
        is_crypto = self.is_crypto(ticker)
        if is_crypto:
            base = ticker.replace("USD", "").replace("/", "")
            symbol = f"{base}USD"
        
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                # Use appropriate endpoint
                if is_crypto:
                    endpoint = f"{self.data_url}/v1beta3/crypto/us/latest/trades"
                    params = {"symbols": symbol}
                else:
                    endpoint = f"{self.data_url}/v2/stocks/{symbol}/trades/latest"
                    params = None
                
                response = await client.get(
                    endpoint,
                    headers=self.headers,
                    params=params,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if is_crypto:
                        return data.get("trades", {}).get(symbol, {}).get("p")
                    else:
                        return data.get("trade", {}).get("p")
                else:
                    logger.error(f"Error fetching price: {response.text}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching price for {ticker}: {e}")
            return None


def get_broker(api_key: str = None, secret_key: str = None, paper_mode: bool = True) -> AlpacaAdapter:
    """Create a broker instance with optional user-specific credentials"""
    return AlpacaAdapter(api_key=api_key, secret_key=secret_key, paper_mode=paper_mode)
