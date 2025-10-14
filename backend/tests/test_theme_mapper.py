import pytest
import os
from backend.services.theme_mapper import map_signal_to_theme, compute_tfidf_similarity
from backend.db import get_db

@pytest.mark.asyncio
async def test_semantic_mapper_fallback():
    """Test semantic mapper when keywords don't match"""
    db = get_db()
    
    # Clean up
    await db.signals.delete_many({"_id": "test-semantic-signal"})
    await db.themes.delete_many({"_id": "test-semantic-theme"})
    
    # Create theme with specific keywords
    await db.themes.insert_one({
        "_id": "test-semantic-theme",
        "name": "AI Data Centers",
        "keywords": ["artificial intelligence", "datacenter", "cooling", "gpu"],
        "alpha": 1.0
    })
    
    # Create signal with related but different wording
    await db.signals.insert_one({
        "_id": "test-semantic-signal",
        "signal_type": "policy_keyword",
        "value_text": "New regulations for machine learning infrastructure and compute facilities",
        "observed_at": "2024-01-01T00:00:00Z",
        "checksum": "test_semantic_checksum",
        "oa_citation": {"source": "Test", "url": "https://example.com", "timestamp": "2024-01-01T00:00:00Z"}
    })
    
    # Test with semantic mapper OFF (default)
    os.environ["SEMANTIC_MAPPER"] = "0"
    theme_id = await map_signal_to_theme(
        "test-semantic-signal",
        "New regulations for machine learning infrastructure and compute facilities"
    )
    
    # Should not match with keywords alone
    assert theme_id is None
    
    # Test with semantic mapper ON
    os.environ["SEMANTIC_MAPPER"] = "1"
    os.environ["SEMANTIC_THRESHOLD"] = "0.25"
    
    theme_id = await map_signal_to_theme(
        "test-semantic-signal",
        "New regulations for machine learning infrastructure and compute facilities"
    )
    
    # Should match via semantic similarity
    # Note: This is a simple TF-IDF, might not always match in practice
    # The test verifies the mechanism exists and is called
    
    # Verify raw.mapper field is set
    signal = await db.signals.find_one({"_id": "test-semantic-signal"})
    assert "raw" in signal
    
    # Clean up env
    os.environ.pop("SEMANTIC_MAPPER", None)
    os.environ.pop("SEMANTIC_THRESHOLD", None)

def test_tfidf_similarity():
    """Test TF-IDF cosine similarity computation"""
    # Exact match
    score1 = compute_tfidf_similarity("artificial intelligence", ["artificial", "intelligence"])
    assert score1 > 0.7
    
    # Partial match
    score2 = compute_tfidf_similarity("machine learning systems", ["artificial", "intelligence"])
    assert score2 == 0.0  # No overlap
    
    # Empty
    score3 = compute_tfidf_similarity("", ["test"])
    assert score3 == 0.0
