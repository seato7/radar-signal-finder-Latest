import pytest
from backend.scoring import exponential_decay, get_weights
from backend.config import settings

def test_decay_at_half_life():
    """Test decay function returns ~0.5 at one half-life"""
    half_life = settings.HALF_LIFE_DAYS
    decay = exponential_decay(half_life)
    assert 0.49 <= decay <= 0.51

def test_decay_at_zero():
    """Test decay is 1.0 at time zero"""
    assert exponential_decay(0) == 1.0

def test_weights_sum():
    """Test weights are reasonable"""
    weights = get_weights()
    # Positive weights should sum to reasonable value
    positive_sum = sum(v for v in weights.values() if v > 0)
    assert 0.5 <= positive_sum <= 1.2
