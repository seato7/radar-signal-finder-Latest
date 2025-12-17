import math
from typing import Dict, List, Tuple
from datetime import datetime, timedelta
from backend.config import settings
from backend.models import Signal

# Professional Hybrid Component Weights v2.1
# Based on Morningstar, BlackRock, AQR methodologies
# Confirmation-first approach: institutional signals carry more weight
# v2.1: Scoring from available data only - no caps for missing components
WEIGHTS = {
    # CONFIRMATION FACTORS (60% total)
    "BigMoneyConfirm": 1.5,          # 13F holdings - institutional conviction
    "FlowPressure": 1.4,             # ETF/Dark pool flows - capital direction
    "InsiderPoliticianConfirm": 1.2, # Smart money alignment
    "CapexMomentum": 1.0,            # Jobs/patents - growth proxy
    
    # SENTIMENT FACTORS (25%)
    "Attention": 0.6,                # News/social - market awareness
    "TechEdge": 0.7,                 # Technical/options - price action
    "PolicyMomentum": 0.8,           # Policy catalysts
    
    # PENALTY FACTOR (subtractive)
    "RiskFlags": -2.0,               # DOUBLED penalty for risk signals
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
    Returns: (score, normalized_components, positives)
    """
    raw_components = compute_component_scores(signals, as_of)
    
    # Normalize and cap each component individually
    normalized_components = {}
    raw_score = 0.0
    
    for component, raw_value in raw_components.items():
        weight = WEIGHTS[component]
        
        # Normalize using logarithmic scale with adjusted multiplier for better score distribution
        # Multiplier of 30 allows components to reach higher scores while maintaining diminishing returns
        normalized = math.log10(1 + raw_value) * 30 if raw_value > 0 else 0
        
        # Cap each component at 100 after normalization
        capped = min(normalized, 100)
        
        # Store the normalized value
        normalized_components[component] = capped
        
        raw_score += weight * capped
    
    # Final score: normalize based on ACTIVE components only
    # This prevents penalizing themes for missing data sources
    active_max_score = sum(
        WEIGHTS[comp] * 100 
        for comp, val in normalized_components.items() 
        if val > 0 and WEIGHTS[comp] > 0
    )
    
    # Fallback to theoretical max if no components active
    if active_max_score == 0:
        score = 0
    else:
        score = max(0, min(100, (raw_score / active_max_score) * 100))
    
    # Identify positive components (using lower threshold for logarithmic scale)
    positives = [k for k, v in normalized_components.items() if v > 0.1 and WEIGHTS[k] > 0]
    
    return score, normalized_components, positives

def get_weights() -> Dict[str, float]:
    """Return current scoring weights"""
    return WEIGHTS.copy()
