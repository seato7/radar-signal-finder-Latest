import pytest
from unittest.mock import AsyncMock, patch
import httpx
from backend.utils.http_client import RetryableHTTPClient

@pytest.mark.asyncio
async def test_successful_request():
    """Test successful HTTP request on first attempt"""
    client = RetryableHTTPClient(max_retries=3, timeout=5.0)
    
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = AsyncMock()
        
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client
        
        response = await client.get("https://example.com/test")
        
        assert response.status_code == 200
        assert mock_client.request.call_count == 1

@pytest.mark.asyncio
async def test_retry_on_timeout():
    """Test retry logic on timeout"""
    client = RetryableHTTPClient(max_retries=3, timeout=5.0, backoff_factor=0.1)
    
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        
        # First two attempts timeout, third succeeds
        mock_success = AsyncMock()
        mock_success.status_code = 200
        mock_success.raise_for_status = AsyncMock()
        
        mock_client.request = AsyncMock(
            side_effect=[
                httpx.TimeoutException("Timeout"),
                httpx.TimeoutException("Timeout"),
                mock_success
            ]
        )
        mock_client_class.return_value = mock_client
        
        response = await client.get("https://example.com/test")
        
        assert response.status_code == 200
        assert mock_client.request.call_count == 3

@pytest.mark.asyncio
async def test_exhausted_retries():
    """Test all retries exhausted"""
    client = RetryableHTTPClient(max_retries=2, timeout=5.0, backoff_factor=0.1)
    
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.request = AsyncMock(
            side_effect=httpx.TimeoutException("Timeout")
        )
        mock_client_class.return_value = mock_client
        
        with pytest.raises(httpx.TimeoutException):
            await client.get("https://example.com/test")
        
        assert mock_client.request.call_count == 2
