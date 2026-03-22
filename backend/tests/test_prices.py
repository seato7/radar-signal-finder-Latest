"""Tests for Twelve Data Price Ingestion Service (Serial Queue)"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from backend.etl.twelvedata_prices import (
    TwelveDataPriceFetcher,
)


class TestTwelveDataPriceFetcher:
    """Test Twelve Data price fetching"""
    
    def test_normalize_ticker_stock(self):
        """Stock tickers should remain unchanged"""
        fetcher = TwelveDataPriceFetcher()
        assert fetcher._normalize_ticker("AAPL", "stock") == "AAPL"
        assert fetcher._normalize_ticker("MSFT", "stock") == "MSFT"
    
    def test_normalize_ticker_crypto(self):
        """Crypto tickers should get /USD format"""
        fetcher = TwelveDataPriceFetcher()
        assert fetcher._normalize_ticker("BTC", "crypto") == "BTC/USD"
        assert fetcher._normalize_ticker("ETH/USDT", "crypto") == "ETH/USD"
        assert fetcher._normalize_ticker("SOL-USD", "crypto") == "SOL/USD"
    
    def test_normalize_ticker_forex(self):
        """Forex tickers should be in XXX/YYY format"""
        fetcher = TwelveDataPriceFetcher()
        assert fetcher._normalize_ticker("EURUSD", "forex") == "EUR/USD"
        assert fetcher._normalize_ticker("EUR/USD", "forex") == "EUR/USD"
        assert fetcher._normalize_ticker("GBPUSD=X", "forex") == "GBP/USD"
    
    def test_normalize_ticker_commodity(self):
        """Commodity tickers should map to Twelve Data symbols"""
        fetcher = TwelveDataPriceFetcher()
        assert fetcher._normalize_ticker("GOLD", "commodity") == "XAU/USD"
        assert fetcher._normalize_ticker("OIL", "commodity") == "CL1"
        assert fetcher._normalize_ticker("SILVER", "commodity") == "XAG/USD"
    
    @pytest.mark.asyncio
    async def test_fetch_single_batch_success(self):
        """Test successful single batch fetch"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "AAPL": {"price": "150.25"},
            "MSFT": {"price": "380.50"}
        }
        
        with patch.dict('os.environ', {'TWELVEDATA_API_KEY': 'test_key'}):
            fetcher = TwelveDataPriceFetcher()
            fetcher.session = AsyncMock()
            fetcher.session.get = AsyncMock(return_value=mock_response)
            
            results = await fetcher._fetch_single_batch(["AAPL", "MSFT"], {})
            
            assert "AAPL" in results
            assert "MSFT" in results
            assert results["AAPL"] == 150.25
            assert results["MSFT"] == 380.50
    
    @pytest.mark.asyncio
    async def test_fetch_prices_batch_integration(self):
        """Test full price fetch flow"""
        test_assets = [
            {"id": "1", "ticker": "AAPL", "asset_class": "stock"},
            {"id": "2", "ticker": "MSFT", "asset_class": "stock"}
        ]
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "AAPL": {"price": "150.0"},
            "MSFT": {"price": "380.0"}
        }
        
        with patch("backend.etl.twelvedata_prices.settings") as mock_settings:
            mock_settings.TWELVEDATA_API_KEY = "test_key"
            with patch("httpx.AsyncClient") as mock_client:
                mock_instance = MagicMock()
                mock_instance.get = AsyncMock(return_value=mock_response)
                mock_client.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
                mock_client.return_value.__aexit__ = AsyncMock()

                async with TwelveDataPriceFetcher() as fetcher:
                    fetcher.session = mock_instance
                    
                    prices, stats = await fetcher.fetch_prices_batch(test_assets)
                    
                    assert len(prices) == 2
                    assert stats["fetched"] == 2


class TestSupabaseSync:
    """Test Supabase sync functionality"""
    
    @pytest.mark.asyncio
    async def test_sync_not_configured(self):
        """Test behavior when Supabase is not configured"""
        from backend.services.supabase_sync import SupabaseSync
        
        with patch("backend.services.supabase_sync.settings") as mock_settings:
            mock_settings.SUPABASE_URL = None
            mock_settings.SUPABASE_SERVICE_KEY = None
            
            sync = SupabaseSync()
            assert not sync.is_configured


class TestPriceRouter:
    """Test price ingestion API endpoints"""
    
    @pytest.mark.asyncio
    async def test_status_endpoint(self):
        """Test /prices/status endpoint returns correct structure"""
        from backend.routers.prices import get_ingestion_status
        
        result = await get_ingestion_status()
        
        assert "status" in result
        assert "started_at" in result
        assert "completed_at" in result
        assert "stats" in result
        assert result["data_provider"] == "Twelve Data"
    
    @pytest.mark.asyncio
    async def test_debug_endpoint_structure(self):
        """Test /prices/debug/price-ingestion-status endpoint"""
        from backend.routers.prices import get_price_ingestion_debug_status
        
        result = await get_price_ingestion_debug_status()
        
        assert "data_provider" in result
        assert result["data_provider"] == "Twelve Data"
        assert "scheduler_active" in result
        assert "mode" in result
        assert result["mode"] == "credit_budgeted_tiered"
        assert "api_key_configured" in result
    
    @pytest.mark.asyncio
    async def test_test_endpoint_no_api_key(self):
        """Test /prices/test endpoint without API key"""
        from backend.routers.prices import test_price_fetch
        
        with patch.dict('os.environ', {'TWELVEDATA_API_KEY': ''}):
            result = await test_price_fetch()
            
            assert not result["success"]
            assert "TWELVEDATA_API_KEY" in result["error"]


class TestSchedulerStats:
    """Test scheduler statistics"""
    
    def test_get_scheduler_stats(self):
        """Test scheduler stats structure"""
        from backend.services.price_scheduler import get_scheduler_stats
        
        stats = get_scheduler_stats()
        
        assert "scheduler_active" in stats
        assert "config" in stats
        assert "mode" in stats
        assert stats["mode"] == "credit_budgeted_tiered"
        assert stats["data_provider"] == "Twelve Data"
