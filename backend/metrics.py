"""Lightweight metrics tracking for production monitoring"""
from typing import Dict
from datetime import datetime
import threading

class MetricsCollector:
    """Thread-safe in-memory metrics collector"""
    
    def __init__(self):
        self._counters: Dict[str, int] = {}
        self._lock = threading.Lock()
        self._start_time = datetime.utcnow()
    
    def increment(self, metric: str, value: int = 1):
        """Increment a counter metric"""
        with self._lock:
            self._counters[metric] = self._counters.get(metric, 0) + value
    
    def get_metrics(self) -> Dict:
        """Get all metrics with metadata"""
        with self._lock:
            uptime_seconds = (datetime.utcnow() - self._start_time).total_seconds()
            
            return {
                "uptime_seconds": uptime_seconds,
                "counters": self._counters.copy(),
                "timestamp": datetime.utcnow().isoformat()
            }
    
    def reset(self):
        """Reset all counters (use with caution)"""
        with self._lock:
            self._counters.clear()
            self._start_time = datetime.utcnow()

# Global metrics instance
metrics = MetricsCollector()
