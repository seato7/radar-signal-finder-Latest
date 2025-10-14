import pytest
from backend.db import get_db

@pytest.mark.asyncio
async def test_indexes_exist():
    """Test that all required indexes are created"""
    db = get_db()
    
    # Check signals indexes
    signals_indexes = await db.signals.index_information()
    assert "checksum_1" in signals_indexes
    assert "signal_type_1" in signals_indexes
    assert "observed_at_1" in signals_indexes
    assert "theme_id_1" in signals_indexes
    assert "created_at_1" in signals_indexes
    
    # Check TTL index
    created_at_idx = signals_indexes.get("created_at_1", {})
    assert "expireAfterSeconds" in created_at_idx
    
    # Check assets indexes
    assets_indexes = await db.assets.index_information()
    assert "ticker_1" in assets_indexes
    
    # Check themes indexes
    themes_indexes = await db.themes.index_information()
    assert "name_1" in themes_indexes
    
    # Check prices indexes
    prices_indexes = await db.prices.index_information()
    assert "checksum_1" in prices_indexes
    assert "ticker_1_date_-1" in prices_indexes
    
    # Check alerts indexes
    alerts_indexes = await db.alerts.index_information()
    assert "created_at_1" in alerts_indexes
    assert "theme_id_1" in alerts_indexes
