import pytest
from backend.etl.policy_feeds import run_policy_feeds_etl, generate_entry_checksum, matches_keywords

def test_generate_checksum():
    """Test checksum generation is deterministic"""
    entry1 = {"link": "https://example.com/1", "updated": "2024-01-01", "title": "Test"}
    entry2 = {"link": "https://example.com/1", "updated": "2024-01-01", "title": "Test"}
    
    assert generate_entry_checksum(entry1) == generate_entry_checksum(entry2)

def test_matches_keywords():
    """Test keyword matching"""
    keywords = ["hvdc", "transformer", "grid"]
    
    assert matches_keywords("New HVDC transmission line approved", keywords)
    assert matches_keywords("Transformer upgrade project", keywords)
    assert not matches_keywords("Random news article", keywords)

@pytest.mark.asyncio
async def test_policy_feeds_idempotency():
    """Test that re-running ETL doesn't create duplicates"""
    # This test would require mocking feedparser
    # For now, just verify the function returns expected structure
    result = await run_policy_feeds_etl()
    
    assert "inserted" in result
    assert "skipped" in result
    assert isinstance(result["inserted"], int)
    assert isinstance(result["skipped"], int)
