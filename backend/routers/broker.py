from fastapi import APIRouter, Depends, HTTPException
from backend.db import get_db
from backend.auth import get_current_user
from backend.models_bots import ApiKey
from backend.utils.encryption import encrypt_secret, decrypt_secret
from typing import Dict, List
import httpx
from datetime import datetime

router = APIRouter(prefix="/api/broker", tags=["broker"])

@router.post("/keys")
async def add_broker_key(
    data: Dict[str, str],
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Add and validate a new broker API key"""
    exchange = data.get("exchange", "alpaca")
    label = data.get("label", f"{exchange.title()} Account")
    api_key = data.get("api_key")
    secret_key = data.get("secret_key")
    paper_mode = data.get("paper_mode", True)
    
    if not api_key or not secret_key:
        raise HTTPException(400, "API key and secret are required")
    
    # Validate the keys by testing connection
    base_url = "https://paper-api.alpaca.markets" if paper_mode else "https://api.alpaca.markets"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{base_url}/v2/account",
                headers={
                    "APCA-API-KEY-ID": api_key,
                    "APCA-API-SECRET-KEY": secret_key
                },
                timeout=10.0
            )
            if response.status_code != 200:
                raise HTTPException(400, "Invalid API credentials")
    except httpx.RequestError:
        raise HTTPException(400, "Could not connect to broker")
    
    # Check if key already exists
    existing = await db.api_keys.find_one({
        "user_id": user["email"],
        "exchange": exchange,
        "key_id": api_key
    })
    
    if existing:
        raise HTTPException(400, "This API key is already connected")
    
    # Encrypt and store
    encrypted_secret = encrypt_secret(secret_key)
    
    key_doc = {
        "user_id": user["email"],
        "label": label,
        "exchange": exchange,
        "key_id": api_key,
        "secret_enc": encrypted_secret,
        "paper_mode": paper_mode,
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
    keys = await db.api_keys.find({"user_id": user["email"]}).to_list(100)
    
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
        "user_id": user["email"]
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
        "user_id": user["email"]
    })
    
    if not key_doc:
        raise HTTPException(404, "API key not found")
    
    # Decrypt and test
    secret = decrypt_secret(key_doc["secret_enc"])
    paper_mode = key_doc.get("paper_mode", True)
    base_url = "https://paper-api.alpaca.markets" if paper_mode else "https://api.alpaca.markets"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{base_url}/v2/account",
                headers={
                    "APCA-API-KEY-ID": key_doc["key_id"],
                    "APCA-API-SECRET-KEY": secret
                },
                timeout=10.0
            )
            
            if response.status_code == 200:
                account = response.json()
                return {
                    "status": "connected",
                    "account": {
                        "buying_power": account.get("buying_power"),
                        "cash": account.get("cash"),
                        "portfolio_value": account.get("portfolio_value")
                    }
                }
            else:
                return {"status": "invalid", "error": "Invalid credentials"}
    except httpx.RequestError as e:
        return {"status": "error", "error": str(e)}

async def get_user_broker_key(user_id: str, db):
    """Helper to get user's primary broker key"""
    key_doc = await db.api_keys.find_one({"user_id": user_id})
    if not key_doc:
        return None
    
    return {
        "api_key": key_doc["key_id"],
        "secret_key": decrypt_secret(key_doc["secret_enc"]),
        "paper_mode": key_doc.get("paper_mode", True)
    }
