from cryptography.fernet import Fernet
from backend.config import settings
import base64
import hashlib

def get_encryption_key() -> bytes:
    """Derive a consistent encryption key from JWT secret"""
    key_material = settings.JWT_SECRET_KEY.encode()
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
