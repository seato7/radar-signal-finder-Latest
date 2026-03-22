from backend.scoring import exponential_decay, get_weights

def test_decay_at_half_life():
    """Test decay function returns ~0.5 at one half-life"""
    half_life = 30.0  # Spec value
    decay = exponential_decay(half_life)
    assert 0.49 <= decay <= 0.51

def test_decay_at_zero():
    """Test decay is 1.0 at time zero"""
    assert exponential_decay(0) == 1.0

def test_weights_sum():
    """Test weights are v2.1 spec-compliant (professional hybrid model)"""
    weights = get_weights()
    # Check all required components exist
    required = ["PolicyMomentum", "FlowPressure", "BigMoneyConfirm", 
                "InsiderPoliticianConfirm", "Attention", "TechEdge", 
                "RiskFlags", "CapexMomentum"]
    for comp in required:
        assert comp in weights
    
    # Check v2.1 professional hybrid weights
    assert weights["BigMoneyConfirm"] == 1.5  # Institutional conviction (highest)
    assert weights["FlowPressure"] == 1.4     # Capital direction
    assert weights["InsiderPoliticianConfirm"] == 1.2  # Smart money
    assert weights["CapexMomentum"] == 1.0    # Growth proxy
    assert weights["PolicyMomentum"] == 0.8   # Policy catalysts
    assert weights["TechEdge"] == 0.7         # Technical/options
    assert weights["Attention"] == 0.6        # News/social
    assert weights["RiskFlags"] == -2.0       # DOUBLED penalty
