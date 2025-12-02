"""Tests for Railway Price Ingestion Service"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone

from backend.etl.yahoo_prices import YahooPriceFetcher, fetch_all_prices


class TestYahooPriceFetcher:
    """Test Yahoo Finance price fetching"""
    
    def test_normalize_ticker_stock(self):
        """Stock tickers should remain unchanged"""
        fetcher = YahooPriceFetcher()
        assert fetcher._normalize_ticker("AAPL", "stock") == "AAPL"
        assert fetcher._normalize_ticker("msft", "stock") == "MSFT"
    
    def test_normalize_ticker_crypto(self):
        """Crypto tickers should get -USD suffix"""
        fetcher = YahooPriceFetcher()
        assert fetcher._normalize_ticker("BTC", "crypto") == "BTC-USD"
        assert fetcher._normalize_ticker("ETH", "crypto") == "ETH-USD"
        assert fetcher._normalize_ticker("BTC-USD", "crypto") == "BTC-USD"
    
    def test_normalize_ticker_forex(self):
        """Forex tickers should get =X suffix"""
        fetcher = YahooPriceFetcher()
        assert fetcher._normalize_ticker("EURUSD", "forex") == "EURUSD=X"
        assert fetcher._normalize_ticker("EUR/USD", "forex") == "EURUSD=X"
        assert fetcher._normalize_ticker("GBPUSD=X", "forex") == "GBPUSD=X"
    
    def test_normalize_ticker_commodity(self):
        """Commodity tickers should map to futures symbols"""
        fetcher = YahooPriceFetcher()
        assert fetcher._normalize_ticker("GOLD", "commodity") == "GC=F"
        assert fetcher._normalize_ticker("OIL", "commodity") == "CL=F"
        assert fetcher._normalize_ticker("SILVER", "commodity") == "SI=F"
    
    @pytest.mark.asyncio
    async def test_fetch_batch_success(self):
        """Test successful batch fetch"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "quoteResponse": {
                "result": [
                    {
                        "symbol": "AAPL",
                        "regularMarketPrice": 150.25,
                        "regularMarketChange": 2.5,
                        "regularMarketChangePercent": 1.69
                    },
                    {
                        "symbol": "MSFT",
                        "regularMarketPrice": 380.50,
                        "regularMarketChange": -1.2,
                        "regularMarketChangePercent": -0.31
                    }
                ]
            }
        }
        
        fetcher = YahooPriceFetcher()
        fetcher.session = AsyncMock()
        fetcher.session.get = AsyncMock(return_value=mock_response)
        
        results = await fetcher._fetch_batch(["AAPL", "MSFT"])
        
        assert "AAPL" in results
        assert "MSFT" in results
        assert results["AAPL"]["price"] == 150.25
        assert results["MSFT"]["price"] == 380.50
    
    @pytest.mark.asyncio
    async def test_fetch_prices_integration(self):
        """Test full price fetch flow"""
        test_assets = [
            {"id": "1", "ticker": "AAPL", "asset_class": "stock"},
            {"id": "2", "ticker": "BTC", "asset_class": "crypto"}
        ]
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "quoteResponse": {
                "result": [
                    {"symbol": "AAPL", "regularMarketPrice": 150.0},
                    {"symbol": "BTC-USD", "regularMarketPrice": 45000.0}
                ]
            }
        }
        
        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(get=AsyncMock(return_value=mock_response))
            )
            mock_client.return_value.__aexit__ = AsyncMock()
            
            async with YahooPriceFetcher() as fetcher:
                fetcher.session = MagicMock()
                fetcher.session.get = AsyncMock(return_value=mock_response)
                
                prices, stats = await fetcher.fetch_prices(test_assets)
                
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
    
    @pytest.mark.asyncio
    async def test_test_endpoint_structure(self):
        """Test /prices/test endpoint returns correct structure"""
        from backend.routers.prices import test_price_fetch
        
        # Mock the fetcher
        with patch("backend.routers.prices.YahooPriceFetcher") as mock_fetcher:
            mock_instance = AsyncMock()
            mock_instance.fetch_prices = AsyncMock(return_value=(
                [{"ticker": "AAPL", "price": 150.0}],
                {"fetched": 1, "failed": 0}
            ))
            mock_fetcher.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_fetcher.return_value.__aexit__ = AsyncMock()
            
            result = await test_price_fetch()
            
            assert "success" in result
            assert "prices_fetched" in result
            assert "stats" in result
