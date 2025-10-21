from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import secrets
import hashlib

class ApiKeyCreate(BaseModel):
    label: str
    permissions: List[str] = ["read"]  # read, write, admin

class ApiKey(BaseModel):
    id: str = Field(default_factory=lambda: None)
    user_id: str
    label: str
    key_hash: str  # Hashed version of the key
    key_prefix: str  # First 8 chars for display (ok_live_abc...)
    permissions: List[str] = ["read"]
    is_active: bool = True
    last_used: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None

class ApiKeyUsage(BaseModel):
    id: str = Field(default_factory=lambda: None)
    key_id: str
    endpoint: str
    method: str
    status_code: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)

def generate_api_key() -> tuple[str, str, str]:
    """Generate API key, return (full_key, hash, prefix)"""
    # Generate random key
    random_part = secrets.token_urlsafe(32)
    full_key = f"ok_live_{random_part}"
    
    # Hash the key for storage
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    
    # Get prefix for display
    key_prefix = full_key[:15] + "..."
    
    return full_key, key_hash, key_prefix
