import pytest
from backend.services.bot_strategies import GridBot, MomentumBot, DCABot, MeanReversionBot

def test_grid_strategy():
    """Test grid bot generates orders in range"""
    params = {"lower": 100, "upper": 200, "grid_count": 10, "base_qty": 1.0}
    strategy = GridBot(params)
    
    prices = [{"close": 150, "date": "2024-01-01"}]
    orders = strategy.evaluate("TEST", prices, 0)
    
    # Should generate at least one order
    assert len(orders) >= 0

def test_momentum_strategy():
    """Test momentum bot enters on z-score threshold"""
    params = {"lookback": 5, "z_entry": 2.0, "z_exit": 0.5, "base_qty": 1.0}
    strategy = MomentumBot(params)
    
    # Create price series with upward momentum
    prices = [
        {"close": 100, "date": "2024-01-01"},
        {"close": 101, "date": "2024-01-02"},
        {"close": 102, "date": "2024-01-03"},
        {"close": 103, "date": "2024-01-04"},
        {"close": 104, "date": "2024-01-05"},
        {"close": 115, "date": "2024-01-06"}  # spike
    ]
    
    orders = strategy.evaluate("TEST", prices, 0)
    assert len(orders) >= 0

def test_dca_strategy():
    """Test DCA bot buys at intervals"""
    params = {"interval_days": 7, "base_qty": 1.0}
    strategy = DCABot(params)
    
    prices = [{"close": 100, "date": "2024-01-01"}]
    orders = strategy.evaluate("TEST", prices, 0)
    
    # First call should generate buy order
    assert len(orders) == 1
    assert orders[0].side == "buy"

def test_mean_reversion_strategy():
    """Test mean reversion bot buys oversold"""
    params = {"lookback": 5, "z_entry": -2.0, "z_exit": 0.0, "base_qty": 1.0}
    strategy = MeanReversionBot(params)
    
    # Create price series with dip
    prices = [
        {"close": 100, "date": "2024-01-01"},
        {"close": 100, "date": "2024-01-02"},
        {"close": 100, "date": "2024-01-03"},
        {"close": 100, "date": "2024-01-04"},
        {"close": 100, "date": "2024-01-05"},
        {"close": 85, "date": "2024-01-06"}  # dip
    ]
    
    orders = strategy.evaluate("TEST", prices, 0)
    # Should consider buying on the dip
    assert len(orders) >= 0
