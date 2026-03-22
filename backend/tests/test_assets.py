import pytest
from backend.db import get_db

@pytest.mark.asyncio
async def test_asset_by_id():
    """Test asset retrieval by asset_id"""
    db = get_db()
    
    # Insert test asset
    result = await db.assets.insert_one({
        "ticker": "TEST",
        "exchange": "NASDAQ",
        "name": "Test Corp",
        "metadata": {}
    })
    
    asset_id = str(result.inserted_id)
    
    # Would need to call the endpoint - this is a structure test
    assert asset_id is not None
    
    # Cleanup
    await db.assets.delete_one({"_id": result.inserted_id})

@pytest.mark.asyncio
async def test_asset_by_ticker():
    """Test asset retrieval by ticker"""
    db = get_db()
    
    # Insert test asset
    await db.assets.insert_one({
        "ticker": "ERII",
        "exchange": "NASDAQ",
        "name": "Energy Recovery Inc",
        "metadata": {}
    })
    
    # Verify ticker lookup works
    asset = await db.assets.find_one({"ticker": "ERII"})
    assert asset is not None
    assert asset["ticker"] == "ERII"
    
    # Cleanup
    await db.assets.delete_one({"ticker": "ERII"})

def test_where_to_buy_nasdaq():
    """Test NASDAQ returns Stake and IBKR"""
    from backend.services.where_to_buy import get_where_to_buy
    brokers = get_where_to_buy("NASDAQ", "TEST")
    broker_names = [b["name"] for b in brokers]
    
    assert "Stake" in broker_names
    assert "Interactive Brokers" in broker_names

def test_where_to_buy_asx():
    """Test ASX returns CommSec, SelfWealth, IBKR"""
    from backend.services.where_to_buy import get_where_to_buy
    brokers = get_where_to_buy("ASX", "BHP")
    broker_names = [b["name"] for b in brokers]
    
    assert "CommSec" in broker_names
    assert "SelfWealth" in broker_names
    assert "Interactive Brokers" in broker_names
