"""
Tests for Options Flow Ingestion Pipeline

Tests:
1. Router endpoint returns correct response structure
2. ETL returns no_supported_provider when no API keys configured
3. Contract normalization and filtering logic
4. Deduplication within run
"""
import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock, AsyncMock
from backend.main import app
from backend.etl.options_chain import (
    OptionsChainFetcher,
    run_options_chain_etl,
)


class TestOptionsRouter:
    """Tests for /api/options/ingest endpoint"""
    
    @pytest.mark.asyncio
    async def test_options_ingest_endpoint_exists(self):
        """Verify endpoint exists and returns expected structure"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/api/options/ingest",
                json={"tickers": ["SPY"], "debug": True}
            )
        
        # Should return 200 even if no provider configured
        assert response.status_code == 200
        data = response.json()
        
        # Required fields in response
        assert "success" in data
        assert "inserted" in data
        assert "source" in data
        
    @pytest.mark.asyncio
    async def test_options_ingest_default_tickers(self):
        """Verify default tickers are used when none provided"""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/options/ingest", json={})
        
        assert response.status_code == 200
        data = response.json()
        # Should have processed with defaults
        assert "details" in data
        assert data["details"].get("tickers_requested", 0) >= 1


class TestOptionsChainFetcher:
    """Tests for OptionsChainFetcher class"""
    
    def test_get_available_provider_none(self):
        """Should return None when no API keys configured"""
        fetcher = OptionsChainFetcher()
        # Clear any env-based values
        fetcher.tradier_token = None
        fetcher.alpha_vantage_key = None
        
        assert fetcher.get_available_provider() is None
    
    def test_get_available_provider_tradier(self):
        """Should return tradier when TRADIER_TOKEN is set"""
        fetcher = OptionsChainFetcher()
        fetcher.tradier_token = "test-token"
        
        assert fetcher.get_available_provider() == "tradier"
    
    def test_normalize_tradier_contract_filters_low_volume(self):
        """Contracts with volume <= 50 should be filtered out"""
        fetcher = OptionsChainFetcher()
        
        low_volume_contract = {
            "symbol": "SPY250117C00600000",
            "option_type": "call",
            "strike": 600.0,
            "volume": 30,  # Below 50 threshold
            "open_interest": 100,
            "last": 1.50
        }
        
        result = fetcher._normalize_tradier_contract(
            low_volume_contract, "SPY", "2025-01-17"
        )
        
        assert result is None
    
    def test_normalize_tradier_contract_passes_high_volume(self):
        """Contracts with volume > 50 should pass filter"""
        fetcher = OptionsChainFetcher()
        
        high_volume_contract = {
            "symbol": "SPY250117C00600000",
            "option_type": "call",
            "strike": 600.0,
            "volume": 100,  # Above 50 threshold
            "open_interest": 500,
            "last": 2.50
        }
        
        result = fetcher._normalize_tradier_contract(
            high_volume_contract, "SPY", "2025-01-17"
        )
        
        assert result is not None
        assert result["ticker"] == "SPY"
        assert result["option_type"] == "call"
        assert result["strike_price"] == 600.0
        assert result["volume"] == 100
        assert result["sentiment"] == "bullish"  # call = bullish
        assert result["flow_type"] is None  # Required by spec
        
    def test_normalize_tradier_contract_put_sentiment(self):
        """Put options should have bearish sentiment"""
        fetcher = OptionsChainFetcher()
        
        put_contract = {
            "symbol": "SPY250117P00550000",
            "option_type": "put",
            "strike": 550.0,
            "volume": 200,
            "open_interest": 1000,
            "last": 3.00
        }
        
        result = fetcher._normalize_tradier_contract(
            put_contract, "SPY", "2025-01-17"
        )
        
        assert result is not None
        assert result["sentiment"] == "bearish"  # put = bearish
    
    def test_normalize_tradier_contract_premium_calculation(self):
        """Premium should be calculated as price * volume * 100"""
        fetcher = OptionsChainFetcher()
        
        contract = {
            "symbol": "AAPL250117C00200000",
            "option_type": "call",
            "strike": 200.0,
            "volume": 100,
            "open_interest": 500,
            "last": 5.00  # $5 per contract
        }
        
        result = fetcher._normalize_tradier_contract(
            contract, "AAPL", "2025-01-17"
        )
        
        # Premium = 5.00 * 100 * 100 = 50000
        assert result["premium"] == 50000
    
    def test_normalize_tradier_contract_checksum_generated(self):
        """Each contract should have a unique checksum in metadata"""
        fetcher = OptionsChainFetcher()
        
        contract = {
            "symbol": "TSLA250117C00250000",
            "option_type": "call",
            "strike": 250.0,
            "volume": 75,
            "open_interest": 300,
            "last": 10.00
        }
        
        result = fetcher._normalize_tradier_contract(
            contract, "TSLA", "2025-01-17"
        )
        
        assert result is not None
        assert "metadata" in result
        assert "checksum" in result["metadata"]
        assert len(result["metadata"]["checksum"]) == 32


class TestOptionsChainETL:
    """Tests for run_options_chain_etl function"""
    
    @pytest.mark.asyncio
    async def test_etl_no_provider_configured(self):
        """ETL should return no_supported_provider when no API keys set"""
        with patch.object(OptionsChainFetcher, 'get_available_provider', return_value=None):
            result = await run_options_chain_etl(tickers=["SPY"])
        
        assert result["inserted"] == 0
        assert result["source"] == "none"
        assert result["reason"] == "no_supported_provider"
        assert "details" in result
        assert "explanation" in result["details"]
    
    @pytest.mark.asyncio
    async def test_etl_deduplication_within_run(self):
        """Duplicate contracts within same run should be skipped"""
        # Create duplicate options
        duplicate_option = {
            "ticker": "SPY",
            "option_type": "call",
            "strike_price": 600.0,
            "expiration_date": "2025-01-17",
            "volume": 100,
            "metadata": {"checksum": "abc123"}
        }
        
        with patch.object(OptionsChainFetcher, 'get_available_provider', return_value="tradier"), \
             patch.object(OptionsChainFetcher, 'fetch_tradier_options', new_callable=AsyncMock) as mock_fetch:
            
            # Return same option twice for same ticker
            mock_fetch.return_value = [duplicate_option.copy(), duplicate_option.copy()]
            
            # Mock SupabaseSync to avoid actual DB calls
            with patch('backend.etl.options_chain.SupabaseSync') as mock_sync_class:
                mock_sync = AsyncMock()
                mock_sync.is_configured = True
                mock_sync.session = AsyncMock()
                mock_sync.session.post = AsyncMock()
                mock_sync.session.post.return_value = MagicMock(status_code=201)
                mock_sync.url = "https://test.supabase.co"
                
                mock_sync_class.return_value.__aenter__ = AsyncMock(return_value=mock_sync)
                mock_sync_class.return_value.__aexit__ = AsyncMock(return_value=None)
                
                result = await run_options_chain_etl(tickers=["SPY"], debug=True)
        
        # Should report duplicates were skipped
        assert result["details"]["duplicates_skipped"] == 1


class TestOptionsIntegration:
    """Integration tests (requires mocked external services)"""
    
    @pytest.mark.asyncio
    async def test_full_flow_with_mock_tradier(self):
        """Test full flow with mocked Tradier API responses"""
        
        mock_expirations = {
            "expirations": {
                "date": ["2025-01-17", "2025-01-24", "2025-01-31"]
            }
        }
        
        mock_chain = {
            "options": {
                "option": [
                    {
                        "symbol": "SPY250117C00600000",
                        "option_type": "call",
                        "strike": 600.0,
                        "volume": 150,
                        "open_interest": 1000,
                        "last": 2.50
                    },
                    {
                        "symbol": "SPY250117P00580000",
                        "option_type": "put",
                        "strike": 580.0,
                        "volume": 10,  # Should be filtered
                        "open_interest": 500,
                        "last": 1.00
                    },
                    {
                        "symbol": "SPY250117C00610000",
                        "option_type": "call",
                        "strike": 610.0,
                        "volume": 200,
                        "open_interest": 800,
                        "last": 1.75
                    }
                ]
            }
        }
        
        async def mock_get(url, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            
            if "expirations" in url:
                mock_response.json.return_value = mock_expirations
            elif "chains" in url:
                mock_response.json.return_value = mock_chain
            
            return mock_response
        
        with patch.object(OptionsChainFetcher, 'tradier_token', "test-token"):
            fetcher = OptionsChainFetcher()
            fetcher.tradier_token = "test-token"
            fetcher.session = AsyncMock()
            fetcher.session.get = mock_get
            
            options = await fetcher.fetch_tradier_options("SPY", debug=True)
        
        # Should have 2 options (one filtered for low volume)
        assert len(options) == 2
        
        # Verify first option
        assert options[0]["ticker"] == "SPY"
        assert options[0]["strike_price"] == 600.0
        assert options[0]["sentiment"] == "bullish"
