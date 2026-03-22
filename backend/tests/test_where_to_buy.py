from backend.services.where_to_buy import get_where_to_buy

def test_us_exchange():
    """Test US exchange returns Stake and IBKR"""
    brokers = get_where_to_buy("NASDAQ")
    broker_names = [b["name"] for b in brokers]
    
    assert "Stake" in broker_names
    assert "Interactive Brokers" in broker_names

def test_asx_exchange():
    """Test ASX returns CommSec, SelfWealth, IBKR"""
    brokers = get_where_to_buy("ASX")
    broker_names = [b["name"] for b in brokers]
    
    assert "CommSec" in broker_names
    assert "SelfWealth" in broker_names
    assert "Interactive Brokers" in broker_names

def test_crypto_exchange():
    """Test crypto returns Binance AU, Kraken, KuCoin"""
    brokers = get_where_to_buy("CRYPTO")
    broker_names = [b["name"] for b in brokers]
    
    assert "Binance AU" in broker_names
    assert "Kraken" in broker_names
    assert "KuCoin" in broker_names

def test_unknown_exchange_fallback():
    """Test unknown exchange returns fallback brokers"""
    brokers = get_where_to_buy("UNKNOWN")
    
    assert len(brokers) > 0
    assert any("Interactive Brokers" in b["name"] for b in brokers)
