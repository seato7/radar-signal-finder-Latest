import math
from typing import Dict, List, Tuple
from datetime import datetime, timedelta
from backend.config import settings
from backend.models import Signal

# Component weights
WEIGHTS = {
    "PolicyMomentum": 0.15,
    "FlowPressure": 0.20,
    "BigMoneyConfirm": 0.18,
    "InsiderPoliticianConfirm": 0.12,
    "Attention": 0.10,
    "TechEdge": 0.00,  # Future
    "RiskFlags": -0.05,
    "CapexMomentum": 0.00,  # Future (0.6 when live)
}

def exponential_decay(days_ago: float, half_life: float = None) -> float:
    """Calculate exponential decay factor"""
    if half_life is None:
        half_life = settings.HALF_LIFE_DAYS
    if days_ago <= 0:
        return 1.0
    return math.exp(-math.log(2) * days_ago / half_life)

def compute_component_scores(signals: List[Signal], as_of: datetime = None) -> Dict[str, float]:
    """Compute component scores from signals with decay"""
    if as_of is None:
        as_of = datetime.utcnow()
    
    components = {k: 0.0 for k in WEIGHTS.keys()}
    
    for signal in signals:
        days_ago = (as_of - signal.observed_at).total_seconds() / 86400
        decay = exponential_decay(days_ago)
        
        magnitude = signal.magnitude or 1.0
        contribution = magnitude * decay
        
        # Map signal types to components
        if signal.signal_type in ["policy_keyword", "policy_mention"]:
            components["PolicyMomentum"] += contribution
        elif signal.signal_type in ["flow_pressure", "flow_pressure_etf"]:
            components["FlowPressure"] += contribution
        elif signal.signal_type in ["filing_13f_new", "filing_13f_increase"]:
            components["BigMoneyConfirm"] += contribution
        elif signal.signal_type in ["insider_buy", "politician_buy"]:
            components["InsiderPoliticianConfirm"] += contribution
        elif signal.signal_type in ["social_mention", "news_mention"]:
            components["Attention"] += contribution
        elif signal.signal_type.startswith("risk_"):
            components["RiskFlags"] += contribution
    
    return components

def compute_theme_score(signals: List[Signal], as_of: datetime = None) -> Tuple[float, Dict[str, float], List[str]]:
    """
    Compute theme score from signals.
    Returns: (score, components, positives)
    """
    components = compute_component_scores(signals, as_of)
    
    # Calculate weighted score
    score = 0.0
    for component, value in components.items():
        weight = WEIGHTS[component]
        # Normalize to 0-100 scale (cap component contributions)
        normalized = min(value * 10, 100)
        score += weight * normalized
    
    # Ensure score is in 0-100 range
    score = max(0, min(100, score))
    
    # Identify positive components (contributing > threshold)
    positives = [k for k, v in components.items() if v > 0.5 and WEIGHTS[k] > 0]
    
    return score, components, positives

def get_weights() -> Dict[str, float]:
    """Return current scoring weights"""
    return WEIGHTS.copy()
