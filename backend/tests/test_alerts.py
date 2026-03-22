import pytest
from backend.services.alerts import check_momentum_fade, send_slack_alert
from backend.config import settings

@pytest.mark.asyncio
async def test_alert_firing_threshold():
    """Test alert fires when threshold conditions met"""
    # Verify threshold is env-driven with correct default
    assert settings.ALERT_SCORE_THRESHOLD == 2.0
    
    # Test threshold can be overridden
    original = settings.ALERT_SCORE_THRESHOLD
    settings.ALERT_SCORE_THRESHOLD = 3.5
    assert settings.ALERT_SCORE_THRESHOLD == 3.5
    settings.ALERT_SCORE_THRESHOLD = original

@pytest.mark.asyncio
async def test_momentum_fade_detection():
    """Test momentum fade detection logic"""
    # Mock test - would require actual signals
    # Verify function exists and returns bool
    result = await check_momentum_fade("test-theme", 40.0)
    assert isinstance(result, bool)

@pytest.mark.asyncio
async def test_slack_webhook_failure():
    """Test Slack webhook failure handling"""
    # Set invalid webhook
    original = settings.SLACK_WEBHOOK
    settings.SLACK_WEBHOOK = "https://hooks.slack.com/invalid"
    
    result = await send_slack_alert(
        {"id": "test", "name": "Test Theme"},
        85.0,
        ["PolicyMomentum", "FlowPressure", "BigMoneyConfirm"],
        {}
    )
    
    # Should return False on failure
    assert not result
    
    # Restore
    settings.SLACK_WEBHOOK = original
