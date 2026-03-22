"""Rate limiting utilities for API and outbound requests"""
import asyncio
import time
from collections import deque
import logging

logger = logging.getLogger(__name__)

class TokenBucketRateLimiter:
    """Token bucket rate limiter for controlling request rates"""
    
    def __init__(self, rate: float = 5.0, burst: int = 10):
        """
        Args:
            rate: Tokens per second
            burst: Maximum burst capacity
        """
        self.rate = rate
        self.capacity = burst
        self.tokens = burst
        self.last_update = time.time()
        self._lock = asyncio.Lock()
    
    async def acquire(self, tokens: int = 1) -> bool:
        """
        Acquire tokens, blocking if necessary.
        
        Returns:
            True when tokens acquired
        """
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_update
            
            # Add tokens based on elapsed time
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            self.last_update = now
            
            # If we have enough tokens, consume them
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            
            # Wait until we have enough tokens
            wait_time = (tokens - self.tokens) / self.rate
            logger.debug(f"Rate limit: waiting {wait_time:.2f}s for {tokens} tokens")
            await asyncio.sleep(wait_time)
            
            self.tokens = 0
            self.last_update = time.time()
            return True

class SlidingWindowRateLimiter:
    """Sliding window rate limiter for discrete events"""
    
    def __init__(self, max_requests: int, window_seconds: float):
        """
        Args:
            max_requests: Maximum requests in window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: deque = deque()
        self._lock = asyncio.Lock()
    
    async def is_allowed(self, key: str = "default") -> bool:
        """
        Check if request is allowed.
        
        Returns:
            True if allowed, False if rate limited
        """
        async with self._lock:
            now = time.time()
            
            # Remove old requests outside window
            while self.requests and self.requests[0] < now - self.window_seconds:
                self.requests.popleft()
            
            # Check if we're under limit
            if len(self.requests) < self.max_requests:
                self.requests.append(now)
                return True
            
            logger.warning(
                f"Rate limit exceeded for {key}",
                extra={
                    "extra_fields": {
                        "requests_in_window": len(self.requests),
                        "max_requests": self.max_requests,
                        "window_seconds": self.window_seconds
                    }
                }
            )
            return False

# Global rate limiters
etl_rate_limiter = TokenBucketRateLimiter(rate=5.0, burst=10)
slack_rate_limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=5.0)
