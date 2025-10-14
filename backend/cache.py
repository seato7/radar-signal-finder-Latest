"""Simple in-memory cache with TTL"""
from typing import Any, Optional
from datetime import datetime, timedelta
import threading

class SimpleCache:
    """Thread-safe in-memory cache with TTL"""
    
    def __init__(self):
        self._cache = {}
        self._lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired"""
        with self._lock:
            if key in self._cache:
                value, expires_at = self._cache[key]
                if datetime.utcnow() < expires_at:
                    return value
                else:
                    # Expired, remove
                    del self._cache[key]
        return None
    
    def set(self, key: str, value: Any, ttl_seconds: int = 60):
        """Set value in cache with TTL"""
        with self._lock:
            expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
            self._cache[key] = (value, expires_at)
    
    def clear(self):
        """Clear all cache"""
        with self._lock:
            self._cache.clear()

# Global cache instance
cache = SimpleCache()
