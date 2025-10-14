import pytest
from backend.scoring import exponential_decay, get_weights
from backend.config import settings

def test_decay_at_half_life():
    """Test decay function returns ~0.5 at one half-life"""
    half_life = 30.0  # Spec value
    decay = exponential_decay(half_life)
    assert 0.49 <= decay <= 0.51

def test_decay_at_zero():
    """Test decay is 1.0 at time zero"""
    assert exponential_decay(0) == 1.0

def test_weights_sum():
    """Test weights are spec-compliant"""
    weights = get_weights()
    # Check all required components exist
    required = ["PolicyMomentum", "FlowPressure", "BigMoneyConfirm", 
                "InsiderPoliticianConfirm", "Attention", "TechEdge", 
                "RiskFlags", "CapexMomentum"]
    for comp in required:
        assert comp in weights
    
    # Check spec values
    assert weights["PolicyMomentum"] == 1.0
    assert weights["FlowPressure"] == 1.0
    assert weights["BigMoneyConfirm"] == 1.0
    assert weights["InsiderPoliticianConfirm"] == 0.8
    assert weights["Attention"] == 0.5
    assert weights["TechEdge"] == 0.4
    assert weights["RiskFlags"] == -1.0
    assert weights["CapexMomentum"] == 0.6
