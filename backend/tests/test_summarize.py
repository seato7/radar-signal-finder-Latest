import pytest
from datetime import datetime, timedelta
from backend.services.summarize import get_why_now_summary
from backend.db import get_db

@pytest.mark.asyncio
async def test_why_now_summary_with_signals():
    """Test summary generation with multiple signal types"""
    db = get_db()
    
    # Clean up
    await db.signals.delete_many({"theme_id": "507f191e810c19729de860ea"})
    await db.themes.delete_many({"_id": "507f191e810c19729de860ea"})
    
    # Create test theme
    await db.themes.insert_one({
        "_id": "507f191e810c19729de860ea",
        "name": "Test Summary Theme",
        "keywords": ["test"],
        "alpha": 1.0
    })
    
    # Create diverse signals
    now = datetime.utcnow()
    signals = [
        {
            "signal_type": "policy_approval",
            "theme_id": "507f191e810c19729de860ea",
            "value_text": "Policy approval signal",
            "observed_at": now - timedelta(days=5),
            "created_at": now,
            "checksum": "test_checksum_1",
            "oa_citation": {
                "source": "Test Policy Source",
                "url": "https://example.com/policy1",
                "timestamp": now.isoformat()
            }
        },
        {
            "signal_type": "bigmoney_hold_new",
            "theme_id": "507f191e810c19729de860ea",
            "value_text": "New institutional position",
            "observed_at": now - timedelta(days=3),
            "created_at": now,
            "checksum": "test_checksum_2",
            "oa_citation": {
                "source": "Test 13F Filing",
                "url": "https://example.com/13f1",
                "timestamp": now.isoformat()
            }
        },
        {
            "signal_type": "insider_buy",
            "theme_id": "507f191e810c19729de860ea",
            "value_text": "Insider purchase",
            "observed_at": now - timedelta(days=1),
            "created_at": now,
            "checksum": "test_checksum_3",
            "oa_citation": {
                "source": "Test Form 4",
                "url": "https://example.com/form4",
                "timestamp": now.isoformat()
            }
        }
    ]
    
    for sig in signals:
        await db.signals.insert_one(sig)
    
    # Get summary
    result = await get_why_now_summary("507f191e810c19729de860ea", days=14)
    
    # Assertions
    assert result["summary"] != ""
    assert "policy signal" in result["summary"].lower()
    assert "institutional position" in result["summary"].lower()
    assert "insider purchase" in result["summary"].lower()
    assert len(result["citations"]) >= 3
    assert "[1]" in result["summary"] or "[2]" in result["summary"]
    
    # Verify citations
    assert all("url" in c and "title" in c for c in result["citations"])

@pytest.mark.asyncio
async def test_why_now_summary_empty():
    """Test summary with no signals returns empty"""
    result = await get_why_now_summary("nonexistent-theme", days=14)
    
    assert result["summary"] == ""
    assert result["citations"] == []
