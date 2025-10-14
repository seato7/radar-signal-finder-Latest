import pytest
from backend.cache import SimpleCache
import time

def test_cache_hit_and_miss():
    """Test cache hit and miss"""
    cache = SimpleCache()
    
    # Miss
    assert cache.get("test_key") is None
    
    # Set
    cache.set("test_key", "test_value", ttl_seconds=1)
    
    # Hit
    assert cache.get("test_key") == "test_value"
    
    # Wait for expiry
    time.sleep(1.1)
    
    # Miss after expiry
    assert cache.get("test_key") is None

def test_cache_clear():
    """Test cache clearing"""
    cache = SimpleCache()
    
    cache.set("key1", "value1")
    cache.set("key2", "value2")
    
    assert cache.get("key1") == "value1"
    assert cache.get("key2") == "value2"
    
    cache.clear()
    
    assert cache.get("key1") is None
    assert cache.get("key2") is None
