import pytest
import asyncio
import time
from backend.utils.rate_limiter import TokenBucketRateLimiter, SlidingWindowRateLimiter

@pytest.mark.asyncio
async def test_token_bucket_allows_burst():
    """Test token bucket allows burst up to capacity"""
    limiter = TokenBucketRateLimiter(rate=10.0, burst=5)
    
    # Should allow 5 immediate requests (burst)
    for _ in range(5):
        allowed = await limiter.acquire(1)
        assert allowed is True

@pytest.mark.asyncio
async def test_token_bucket_rate_limiting():
    """Test token bucket enforces rate over time"""
    limiter = TokenBucketRateLimiter(rate=5.0, burst=2)
    
    # Consume burst
    await limiter.acquire(2)
    
    # Next request should wait
    start = time.time()
    await limiter.acquire(1)
    elapsed = time.time() - start
    
    # Should wait approximately 1/rate seconds
    assert elapsed >= 0.15  # Allow some tolerance

@pytest.mark.asyncio
async def test_sliding_window_allows_under_limit():
    """Test sliding window allows requests under limit"""
    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=1.0)
    
    # Should allow 3 requests
    for _ in range(3):
        allowed = await limiter.is_allowed()
        assert allowed is True

@pytest.mark.asyncio
async def test_sliding_window_blocks_over_limit():
    """Test sliding window blocks requests over limit"""
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=1.0)
    
    # First 2 should pass
    assert await limiter.is_allowed() is True
    assert await limiter.is_allowed() is True
    
    # Third should be blocked
    assert await limiter.is_allowed() is False

@pytest.mark.asyncio
async def test_sliding_window_resets():
    """Test sliding window resets after window expires"""
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=0.2)
    
    # Exhaust limit
    assert await limiter.is_allowed() is True
    assert await limiter.is_allowed() is True
    assert await limiter.is_allowed() is False
    
    # Wait for window to expire
    await asyncio.sleep(0.25)
    
    # Should be allowed again
    assert await limiter.is_allowed() is True
