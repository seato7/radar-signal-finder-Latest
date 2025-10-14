"""HTTP client with retry logic and timeout handling"""
import httpx
import asyncio
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from backend.metrics import metrics

logger = logging.getLogger(__name__)

class RetryableHTTPClient:
    """HTTP client with exponential backoff retry logic"""
    
    def __init__(
        self,
        max_retries: int = 3,
        timeout: float = 15.0,
        backoff_factor: float = 2.0
    ):
        self.max_retries = max_retries
        self.timeout = timeout
        self.backoff_factor = backoff_factor
    
    async def get(
        self,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> httpx.Response:
        """
        GET request with retry logic.
        
        Raises:
            httpx.HTTPError: After all retries exhausted
        """
        return await self._request("GET", url, headers=headers, params=params)
    
    async def post(
        self,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        json: Optional[Dict[str, Any]] = None,
        data: Optional[Any] = None
    ) -> httpx.Response:
        """POST request with retry logic"""
        return await self._request("POST", url, headers=headers, json=json, data=data)
    
    async def _request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> httpx.Response:
        """Internal request method with retry logic"""
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                start_time = datetime.utcnow()
                
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.request(method, url, **kwargs)
                    
                    latency = (datetime.utcnow() - start_time).total_seconds()
                    
                    # Log success
                    logger.info(
                        f"HTTP {method} {url} succeeded",
                        extra={
                            "extra_fields": {
                                "status_code": response.status_code,
                                "latency_seconds": latency,
                                "attempt": attempt + 1
                            }
                        }
                    )
                    
                    metrics.increment("http_requests_total")
                    metrics.increment(f"http_requests_{response.status_code}")
                    
                    response.raise_for_status()
                    return response
                    
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                last_exception = e
                latency = (datetime.utcnow() - start_time).total_seconds()
                
                # Log retry attempt
                logger.warning(
                    f"HTTP {method} {url} failed, attempt {attempt + 1}/{self.max_retries}",
                    extra={
                        "extra_fields": {
                            "error": str(e),
                            "latency_seconds": latency,
                            "attempt": attempt + 1
                        }
                    }
                )
                
                metrics.increment("http_requests_failed")
                
                # If not last attempt, sleep with exponential backoff
                if attempt < self.max_retries - 1:
                    sleep_time = self.backoff_factor ** attempt
                    logger.info(f"Retrying after {sleep_time}s...")
                    await asyncio.sleep(sleep_time)
        
        # All retries exhausted
        logger.error(
            f"HTTP {method} {url} failed after {self.max_retries} attempts",
            extra={"extra_fields": {"error": str(last_exception)}}
        )
        metrics.increment("http_requests_exhausted")
        raise last_exception

# Global HTTP client instance
http_client = RetryableHTTPClient()
