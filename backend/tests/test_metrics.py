from backend.metrics import MetricsCollector

def test_metrics_increment():
    """Test metrics counter increment"""
    metrics = MetricsCollector()
    
    metrics.increment("test_counter", 5)
    metrics.increment("test_counter", 3)
    
    data = metrics.get_metrics()
    assert data["counters"]["test_counter"] == 8

def test_metrics_multiple_counters():
    """Test multiple independent counters"""
    metrics = MetricsCollector()
    
    metrics.increment("counter_a", 10)
    metrics.increment("counter_b", 5)
    metrics.increment("counter_a", 2)
    
    data = metrics.get_metrics()
    assert data["counters"]["counter_a"] == 12
    assert data["counters"]["counter_b"] == 5

def test_metrics_uptime():
    """Test uptime tracking"""
    metrics = MetricsCollector()
    
    data = metrics.get_metrics()
    assert "uptime_seconds" in data
    assert data["uptime_seconds"] >= 0

def test_metrics_reset():
    """Test metrics reset"""
    metrics = MetricsCollector()
    
    metrics.increment("test", 100)
    metrics.reset()
    
    data = metrics.get_metrics()
    assert data["counters"] == {}
