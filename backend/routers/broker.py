from fastapi import APIRouter, Depends, HTTPException
from backend.db import get_db
from backend.auth import get_current_user
from backend.models_bots import ApiKey
from backend.utils.encryption import encrypt_secret, decrypt_secret
from typing import Dict, List
from pydantic import BaseModel, Field
import httpx
from datetime import datetime

router = APIRouter(prefix="/api/broker", tags=["broker"])

class BrokerKeyAdd(BaseModel):
    """Input validation for adding broker API keys"""
    exchange: str = Field(..., min_length=1, max_length=50, pattern="^[a-z]+$")
    label: str = Field(..., min_length=1, max_length=100)
    api_key: str = Field(..., min_length=1, max_length=500)
    secret_key: str = Field(..., min_length=1, max_length=500)
    paper_mode: bool = True

async def _validate_broker_credentials(exchange: str, api_key: str, secret_key: str, paper_mode: bool) -> bool:
    """Validate broker credentials by testing connection"""
    try:
        if exchange == "alpaca":
            from backend.services.alpaca_broker import AlpacaAdapter
            adapter = AlpacaAdapter(api_key, secret_key, paper_mode)
            result = await adapter.get_account()
            return "error" not in result
        
        elif exchange == "ibkr":
            from backend.services.ibkr_broker import IBKRAdapter
            adapter = IBKRAdapter(api_key, secret_key, paper_mode)
            result = await adapter.get_account()
            return "error" not in result
        
        elif exchange == "coinbase":
            from backend.services.coinbase_broker import CoinbaseAdapter
            adapter = CoinbaseAdapter(api_key, secret_key, paper_mode)
            result = await adapter.get_account()
            return "error" not in result
        
        elif exchange == "binance":
            from backend.services.binance_broker import BinanceAdapter
            adapter = BinanceAdapter(api_key, secret_key, paper_mode)
            result = await adapter.get_account()
            return "error" not in result
        
        elif exchange == "kraken":
            from backend.services.kraken_broker import KrakenAdapter
            adapter = KrakenAdapter(api_key, secret_key, paper_mode)
            result = await adapter.get_account()
            return "error" not in result
        
        else:
            return False
    except Exception as e:
        return False

@router.post("/keys")
async def add_broker_key(
    data: BrokerKeyAdd,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Add and validate a new broker API key"""
    
    # Validate credentials with broker
    is_valid = await _validate_broker_credentials(
        data.exchange, 
        data.api_key, 
        data.secret_key, 
        data.paper_mode
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail="Could not validate credentials")
    
    # Check if key already exists
    existing = await db.api_keys.find_one({
        "user_id": user.email,
        "exchange": data.exchange,
        "key_id": data.api_key
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="API key already connected")
    
    # Encrypt and store
    encrypted_secret = encrypt_secret(data.secret_key)
    
    key_doc = {
        "user_id": user.email,
        "label": data.label,
        "exchange": data.exchange,
        "key_id": data.api_key,
        "secret_enc": encrypted_secret,
        "paper_mode": data.paper_mode,
        "created_at": datetime.utcnow()
    }
    
    result = await db.api_keys.insert_one(key_doc)
    key_doc["id"] = str(result.inserted_id)
    key_doc.pop("secret_enc")  # Don't return encrypted secret
    key_doc.pop("_id", None)
    
    return {"message": "Broker connected successfully", "key": key_doc}

@router.get("/keys")
async def list_broker_keys(
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """List user's connected broker accounts"""
    keys = await db.api_keys.find({"user_id": user.email}).to_list(100)
    
    for key in keys:
        key["id"] = str(key.pop("_id"))
        key.pop("secret_enc", None)  # Never return secrets
    
    return keys

@router.delete("/keys/{key_id}")
async def delete_broker_key(
    key_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Remove a broker API key"""
    from bson import ObjectId
    
    result = await db.api_keys.delete_one({
        "_id": ObjectId(key_id),
        "user_id": user.email
    })
    
    if result.deleted_count == 0:
        raise HTTPException(404, "API key not found")
    
    return {"message": "Broker disconnected"}

@router.post("/keys/{key_id}/test")
async def test_broker_key(
    key_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Test if broker API key is still valid"""
    from bson import ObjectId
    
    key_doc = await db.api_keys.find_one({
        "_id": ObjectId(key_id),
        "user_id": user.email
    })
    
    if not key_doc:
        raise HTTPException(404, "API key not found")
    
    # Decrypt and test with appropriate adapter
    secret = decrypt_secret(key_doc["secret_enc"])
    exchange = key_doc["exchange"]
    paper_mode = key_doc.get("paper_mode", True)
    
    try:
        if exchange == "alpaca":
            from backend.services.alpaca_broker import AlpacaAdapter
            adapter = AlpacaAdapter(key_doc["key_id"], secret, paper_mode)
            result = await adapter.get_account()
            
            if "error" not in result:
                return {
                    "status": "connected",
                    "account": {
                        "buying_power": result.get("buying_power"),
                        "cash": result.get("cash"),
                        "portfolio_value": result.get("portfolio_value")
                    }
                }
        
        elif exchange == "coinbase":
            from backend.services.coinbase_broker import CoinbaseAdapter
            adapter = CoinbaseAdapter(key_doc["key_id"], secret, paper_mode)
            result = await adapter.get_account()
            if "error" not in result:
                return {"status": "connected", "account": result}
        
        elif exchange == "binance":
            from backend.services.binance_broker import BinanceAdapter
            adapter = BinanceAdapter(key_doc["key_id"], secret, paper_mode)
            result = await adapter.get_account()
            if "error" not in result:
                return {"status": "connected", "account": result}
        
        elif exchange == "kraken":
            from backend.services.kraken_broker import KrakenAdapter
            adapter = KrakenAdapter(key_doc["key_id"], secret, paper_mode)
            result = await adapter.get_account()
            if "error" not in result:
                return {"status": "connected", "account": result}
        
        elif exchange == "ibkr":
            from backend.services.ibkr_broker import IBKRAdapter
            adapter = IBKRAdapter(key_doc["key_id"], secret, paper_mode)
            result = await adapter.get_account()
            if "error" not in result:
                return {"status": "connected", "account": result}
        
        return {"status": "invalid", "error": "Invalid credentials"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

async def get_user_broker_key(user_id: str, db):
    """Helper to get user's primary broker key with broker adapter factory"""
    key_doc = await db.api_keys.find_one({"user_id": user_id})
    if not key_doc:
        return None
    
    return {
        "exchange": key_doc["exchange"],
        "api_key": key_doc["key_id"],
        "secret_key": decrypt_secret(key_doc["secret_enc"]),
        "paper_mode": key_doc.get("paper_mode", True)
    }

def get_broker_adapter(exchange: str, api_key: str, secret_key: str, paper_mode: bool):
    """Factory to create broker adapter based on exchange"""
    if exchange == "alpaca":
        from backend.services.alpaca_broker import AlpacaAdapter
        return AlpacaAdapter(api_key, secret_key, paper_mode)
    elif exchange == "ibkr":
        from backend.services.ibkr_broker import IBKRAdapter
        return IBKRAdapter(api_key, secret_key, paper_mode)
    elif exchange == "coinbase":
        from backend.services.coinbase_broker import CoinbaseAdapter
        return CoinbaseAdapter(api_key, secret_key, paper_mode)
    elif exchange == "binance":
        from backend.services.binance_broker import BinanceAdapter
        return BinanceAdapter(api_key, secret_key, paper_mode)
    elif exchange == "kraken":
        from backend.services.kraken_broker import KrakenAdapter
        return KrakenAdapter(api_key, secret_key, paper_mode)
    else:
        raise ValueError(f"Unsupported broker: {exchange}")

@router.get("/supported")
async def get_supported_brokers():
    """Get list of supported brokers"""
    return {
        "brokers": [
            {
                "id": "alpaca",
                "name": "Alpaca Markets",
                "description": "US stocks and crypto trading",
                "supports_paper": True,
                "assets": ["stocks", "crypto"]
            },
            {
                "id": "ibkr",
                "name": "Interactive Brokers",
                "description": "Global stocks, options, futures, forex",
                "supports_paper": True,
                "assets": ["stocks", "options", "futures", "forex"]
            },
            {
                "id": "coinbase",
                "name": "Coinbase",
                "description": "Cryptocurrency trading",
                "supports_paper": False,
                "assets": ["crypto"]
            },
            {
                "id": "binance",
                "name": "Binance",
                "description": "Cryptocurrency trading",
                "supports_paper": True,
                "assets": ["crypto"]
            },
            {
                "id": "kraken",
                "name": "Kraken",
                "description": "Cryptocurrency trading",
                "supports_paper": False,
                "assets": ["crypto"]
            }
        ]
    }
