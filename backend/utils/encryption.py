from cryptography.fernet import Fernet
from backend.config import settings
import base64
import hashlib

def get_encryption_key() -> bytes:
    """Get encryption key for broker API secrets (separate from JWT secret)"""
    # Use dedicated broker encryption key if available, fallback to JWT secret for backward compatibility
    encryption_key_source = settings.BROKER_ENCRYPTION_KEY or settings.JWT_SECRET_KEY
    
    if encryption_key_source == settings.JWT_SECRET_KEY and settings.BROKER_ENCRYPTION_KEY is None:
        import logging
        logging.warning(
            "BROKER_ENCRYPTION_KEY not set - using JWT_SECRET_KEY for broker encryption. "
            "This is not recommended for production. Set BROKER_ENCRYPTION_KEY environment variable."
        )
    
    key_material = encryption_key_source.encode()
    key = hashlib.sha256(key_material).digest()
    return base64.urlsafe_b64encode(key)

def encrypt_secret(plaintext: str) -> bytes:
    """Encrypt a secret string"""
    f = Fernet(get_encryption_key())
    return f.encrypt(plaintext.encode())

def decrypt_secret(encrypted: bytes) -> str:
    """Decrypt a secret"""
    f = Fernet(get_encryption_key())
    return f.decrypt(encrypted).decode()
