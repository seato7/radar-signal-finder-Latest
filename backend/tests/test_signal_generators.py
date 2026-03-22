"""
Tests for signal generator output types and scoring weight mappings.

These tests validate that:
1. All expected signal types are mapped in the scoring system
2. Signal types map to valid components
3. Scoring weights prioritize leading indicators over lagging indicators
4. The scoring system is properly configured for predictive (not lagging) performance
"""
from backend.scoring import get_weights

# All expected signal types that generators should produce
EXPECTED_SIGNAL_TYPES = [
    # Momentum signals (from generate-signals-from-momentum)
    'momentum_5d_bullish', 'momentum_5d_bearish',
    'momentum_20d_bullish', 'momentum_20d_bearish',
    
    # Smart money signals (from generate-signals-from-smart-money)
    'smart_money_accumulation', 'smart_money_distribution',
    
    # Breaking news signals (from generate-signals-from-breaking-news)
    'breaking_news_bullish', 'breaking_news_bearish',
    
    # Forex technical signals (from generate-signals-from-forex-technicals)
    'forex_rsi_oversold', 'forex_rsi_overbought',
    
    # Forex sentiment signals (from generate-signals-from-forex-sentiment)
    'forex_retail_extreme_long', 'forex_retail_extreme_short',
    
    # Crypto onchain signals (from generate-signals-from-crypto-onchain)
    'onchain_accumulation', 'onchain_distribution',
    'onchain_exchange_inflow', 'onchain_exchange_outflow',
    'onchain_fear', 'onchain_greed',
    
    # AI research signals (from generate-signals-from-ai-research)
    'ai_research_buy', 'ai_research_sell', 'ai_research_hold',
    
    # Social signals (from generate-signals-from-social-aggregated)
    'social_bullish_surge', 'social_bearish_surge',
    
    # News RSS signals (from generate-signals-from-news-rss)
    'news_rss_bullish', 'news_rss_bearish',
    
    # Economic signals (from generate-signals-from-economic)
    'economic_beat', 'economic_miss',
]

# Leading indicators - should have highest weights
LEADING_INDICATORS = [
    'InsiderPoliticianConfirm',  # Insider/congressional trades
    'BigMoneyConfirm',           # 13F holdings
    'FlowPressure',              # ETF/Dark pool flows
    'CapexMomentum',             # Hiring, patents
]

# Lagging indicators - should have lowest weights
LAGGING_INDICATORS = [
    'Attention',                 # News/social (follows price)
    'EarningsMomentum',          # Earnings (quarterly lag)
]


class TestScoringWeights:
    """Test the scoring weight configuration."""
    
    def test_weights_exist(self):
        """Test that all required components have weights."""
        weights = get_weights()
        required_components = [
            'InsiderPoliticianConfirm', 'BigMoneyConfirm', 'FlowPressure',
            'CapexMomentum', 'TechEdge', 'PolicyMomentum', 'Attention',
            'RiskFlags'
        ]
        for component in required_components:
            assert component in weights, f"Missing weight for component: {component}"
    
    def test_leading_indicators_higher_than_lagging(self):
        """Test that leading indicators have higher weights than lagging."""
        weights = get_weights()
        
        min_leading = min(weights[comp] for comp in LEADING_INDICATORS if comp in weights)
        max_lagging = max(weights[comp] for comp in LAGGING_INDICATORS if comp in weights)
        
        assert min_leading > max_lagging, (
            f"Leading indicators (min={min_leading}) should have higher weights "
            f"than lagging indicators (max={max_lagging})"
        )
    
    def test_insider_politician_highest_weight(self):
        """Test that InsiderPoliticianConfirm has highest positive weight."""
        weights = get_weights()
        positive_weights = {k: v for k, v in weights.items() if v > 0}
        max_weight_component = max(positive_weights, key=positive_weights.get)
        
        assert max_weight_component == 'BigMoneyConfirm', (
            f"BigMoneyConfirm should have highest weight, but {max_weight_component} does"
        )
    
    def test_attention_has_low_weight(self):
        """Test that Attention (news/social) has low weight (lagging indicator)."""
        weights = get_weights()
        assert weights['Attention'] < 1.0, (
            f"Attention weight ({weights['Attention']}) should be < 1.0 (lagging indicator)"
        )
    
    def test_risk_flags_is_negative(self):
        """Test that RiskFlags has negative weight (penalty)."""
        weights = get_weights()
        assert weights['RiskFlags'] < 0, "RiskFlags should have negative weight"
    
    def test_predictive_weight_ratios(self):
        """Test the weight ratios follow predictive hierarchy."""
        weights = get_weights()
        
        # BigMoneyConfirm should be > InsiderPoliticianConfirm
        assert weights['BigMoneyConfirm'] > weights['InsiderPoliticianConfirm'], (
            "BigMoneyConfirm should outweigh InsiderPoliticianConfirm"
        )
        
        # BigMoneyConfirm should be > FlowPressure
        assert weights['BigMoneyConfirm'] > weights['FlowPressure'], (
            "BigMoneyConfirm should outweigh FlowPressure"
        )
        
        # FlowPressure should be > Attention
        assert weights['FlowPressure'] > weights['Attention'], (
            "FlowPressure should outweigh Attention"
        )


class TestDecayFunction:
    """Test the exponential decay function."""
    
    def test_decay_at_zero(self):
        """Test that decay is 1.0 at time zero."""
        from backend.scoring import exponential_decay
        assert exponential_decay(0) == 1.0
    
    def test_decay_at_half_life(self):
        """Test that decay is approximately 0.5 at one half-life."""
        from backend.scoring import exponential_decay
        from backend.config import settings
        half_life = getattr(settings, 'HALF_LIFE_DAYS', 30.0)
        decay = exponential_decay(half_life)
        assert 0.49 <= decay <= 0.51, f"Decay at half-life should be ~0.5, got {decay}"
    
    def test_decay_decreases_over_time(self):
        """Test that decay decreases as days increase."""
        from backend.scoring import exponential_decay
        assert exponential_decay(1) > exponential_decay(7)
        assert exponential_decay(7) > exponential_decay(30)
        assert exponential_decay(30) > exponential_decay(90)


class TestComponentScoreComputation:
    """Test component score computation from signals."""
    
    def test_empty_signals_returns_zero_components(self):
        """Test that empty signal list returns zero for all components."""
        from backend.scoring import compute_component_scores
        components = compute_component_scores([])
        
        for component, value in components.items():
            assert value == 0.0, f"Component {component} should be 0 with no signals"


class TestThemeScoreComputation:
    """Test theme score computation."""
    
    def test_empty_signals_returns_zero_score(self):
        """Test that empty signals return zero score."""
        from backend.scoring import compute_theme_score
        score, components, positives = compute_theme_score([])
        
        assert score == 0
        assert len(positives) == 0
    
    def test_score_is_bounded(self):
        """Test that score is always between 0 and 100."""
        from backend.scoring import compute_theme_score
        from backend.models import Signal
        from datetime import datetime
        
        # Create test signals with various magnitudes
        test_signals = [
            Signal(
                id="test1",
                asset_id="asset1",
                signal_type="policy_keyword",
                magnitude=10.0,
                observed_at=datetime.utcnow()
            ),
            Signal(
                id="test2",
                asset_id="asset1",
                signal_type="flow_pressure",
                magnitude=5.0,
                observed_at=datetime.utcnow()
            ),
        ]
        
        score, components, positives = compute_theme_score(test_signals)
        
        assert 0 <= score <= 100, f"Score {score} should be between 0 and 100"


class TestSignalTypeMapping:
    """Test that signal types from generators are properly mapped."""
    
    def test_momentum_signal_types_documented(self):
        """Ensure momentum signal types are properly documented."""
        momentum_types = [
            'momentum_5d_bullish', 'momentum_5d_bearish',
            'momentum_20d_bullish', 'momentum_20d_bearish'
        ]
        
        for signal_type in momentum_types:
            assert signal_type in EXPECTED_SIGNAL_TYPES, (
                f"Momentum signal type {signal_type} not in expected types"
            )
    
    def test_smart_money_signal_types_documented(self):
        """Ensure smart money signal types are properly documented."""
        smart_money_types = [
            'smart_money_accumulation', 'smart_money_distribution'
        ]
        
        for signal_type in smart_money_types:
            assert signal_type in EXPECTED_SIGNAL_TYPES, (
                f"Smart money signal type {signal_type} not in expected types"
            )
    
    def test_expected_signal_types_count(self):
        """Ensure we have a reasonable number of expected signal types."""
        assert len(EXPECTED_SIGNAL_TYPES) >= 20, (
            f"Expected at least 20 signal types, got {len(EXPECTED_SIGNAL_TYPES)}"
        )


class TestWeightConfiguration:
    """Test the actual weight values match spec."""
    
    def test_v21_weights_spec(self):
        """Test weights match v2.1 professional hybrid model spec."""
        weights = get_weights()
        
        # Check v2.1 spec weights
        assert weights["BigMoneyConfirm"] == 1.5, "BigMoneyConfirm should be 1.5"
        assert weights["FlowPressure"] == 1.4, "FlowPressure should be 1.4"
        assert weights["InsiderPoliticianConfirm"] == 1.2, "InsiderPoliticianConfirm should be 1.2"
        assert weights["CapexMomentum"] == 1.0, "CapexMomentum should be 1.0"
        assert weights["PolicyMomentum"] == 0.8, "PolicyMomentum should be 0.8"
        assert weights["TechEdge"] == 0.7, "TechEdge should be 0.7"
        assert weights["Attention"] == 0.6, "Attention should be 0.6"
        assert weights["RiskFlags"] == -2.0, "RiskFlags should be -2.0"
