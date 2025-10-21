from fastapi import APIRouter, Depends, HTTPException, Header
from backend.db import get_db
from backend.auth import get_current_user
from backend.models_api import ApiKeyCreate, generate_api_key
from backend.services.payments import get_plans
from typing import Optional
from datetime import datetime
from bson import ObjectId
import hashlib

router = APIRouter(prefix="/api/keys", tags=["api_keys"])

@router.post("")
async def create_api_key(
    data: ApiKeyCreate,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Create a new API key (Enterprise only)"""
    # Check if user has Enterprise plan
    subscription = await db.subscriptions.find_one({"user_id": user["email"]})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    
    if user_plan != "enterprise":
        raise HTTPException(
            status_code=403,
            detail="API keys are only available for Enterprise plans. Please upgrade."
        )
    
    # Generate key
    full_key, key_hash, key_prefix = generate_api_key()
    
    # Store in database
    key_doc = {
        "user_id": user["email"],
        "label": data.label,
        "key_hash": key_hash,
        "key_prefix": key_prefix,
        "permissions": data.permissions,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_used": None
    }
    
    result = await db.api_keys_enterprise.insert_one(key_doc)
    key_doc["id"] = str(result.inserted_id)
    key_doc.pop("_id", None)
    key_doc.pop("key_hash", None)  # Don't return hash
    
    return {
        "message": "API key created. Save this key - it won't be shown again!",
        "key": full_key,  # Only time full key is returned
        "key_info": key_doc
    }

@router.get("")
async def list_api_keys(
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """List user's API keys"""
    keys = await db.api_keys_enterprise.find({"user_id": user["email"]}).to_list(100)
    
    for key in keys:
        key["id"] = str(key.pop("_id"))
        key.pop("key_hash", None)  # Never return hash
    
    return keys

@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: str,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Revoke an API key"""
    result = await db.api_keys_enterprise.delete_one({
        "_id": ObjectId(key_id),
        "user_id": user["email"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(404, "API key not found")
    
    return {"message": "API key revoked"}

async def verify_api_key(
    x_api_key: Optional[str] = Header(None),
    db = Depends(get_db)
):
    """Middleware to verify API key authentication"""
    if not x_api_key:
        raise HTTPException(401, "API key required")
    
    # Hash the provided key
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
    
    # Look up key
    key_doc = await db.api_keys_enterprise.find_one({
        "key_hash": key_hash,
        "is_active": True
    })
    
    if not key_doc:
        raise HTTPException(401, "Invalid API key")
    
    # Update last used
    await db.api_keys_enterprise.update_one(
        {"_id": key_doc["_id"]},
        {"$set": {"last_used": datetime.utcnow()}}
    )
    
    # Log usage
    await db.api_key_usage.insert_one({
        "key_id": str(key_doc["_id"]),
        "user_id": key_doc["user_id"],
        "timestamp": datetime.utcnow()
    })
    
    return {"email": key_doc["user_id"], "permissions": key_doc["permissions"]}
