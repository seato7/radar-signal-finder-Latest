"""Stripe payment integration"""
import os
from typing import Dict, Any, Optional
from backend.logging_config import get_logger

logger = get_logger(__name__)

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

PLANS = {
    "free": {
        "name": "Free",
        "price": 0,
        "currency": "USD",
        "features": {
            "max_bots": 0,
            "max_alerts": 1,
            "paper_bots": 1,
            "exports": ["csv"],
            "backtest_days": 30
        }
    },
    "lite": {
        "name": "Lite",
        "price": 7.99,
        "currency": "USD",
        "stripe_price_id": os.getenv("STRIPE_LITE_PRICE_ID", ""),
        "features": {
            "max_bots": 0,
            "max_alerts": 10,
            "paper_bots": 3,
            "exports": ["csv"],
            "backtest_days": 90
        }
    },
    "starter": {
        "name": "Starter",
        "price": 19.99,
        "currency": "USD",
        "stripe_price_id": os.getenv("STRIPE_STARTER_PRICE_ID", ""),
        "features": {
            "max_bots": 3,
            "max_alerts": 25,
            "live_eligible": True,
            "exports": ["csv", "parquet"],
            "backtest_days": -1
        }
    },
    "pro": {
        "name": "Pro",
        "price": 32.99,
        "currency": "USD",
        "stripe_price_id": os.getenv("STRIPE_PRO_PRICE_ID", ""),
        "features": {
            "max_bots": 10,
            "max_alerts": -1,
            "live_eligible": True,
            "priority_support": True,
            "exports": ["csv", "parquet"],
            "backtest_days": -1
        }
    },
    "premium": {
        "name": "Premium",
        "price": 59.99,
        "currency": "USD",
        "stripe_price_id": os.getenv("STRIPE_PREMIUM_PRICE_ID", ""),
        "features": {
            "max_bots": -1,
            "max_alerts": -1,
            "live_eligible": True,
            "priority_support": True,
            "advanced_analytics": True,
            "exports": ["csv", "parquet"],
            "backtest_days": -1
        }
    },
    "enterprise": {
        "name": "Enterprise",
        "price": "contact",
        "currency": "USD",
        "features": {
            "max_bots": -1,
            "max_alerts": -1,
            "live_eligible": True,
            "dedicated_support": True,
            "custom_integrations": True,
            "api_access": True,
            "exports": ["csv", "parquet"],
            "backtest_days": -1
        }
    }
}

def get_plans():
    """Return all available plans"""
    return PLANS

async def create_checkout_session(user_id: str, plan: str, success_url: str, cancel_url: str) -> Dict[str, Any]:
    """Create Stripe checkout session"""
    if plan not in PLANS or plan == "free":
        raise ValueError("Invalid plan")
    
    plan_info = PLANS[plan]
    
    if not STRIPE_SECRET_KEY:
        logger.warning("Stripe not configured - returning mock session")
        return {
            "session_id": "mock_session_id",
            "url": success_url + "?session_id=mock_session_id"
        }
    
    # TODO: Implement actual Stripe checkout session creation
    # For now, return mock
    return {
        "session_id": "mock_session_id",
        "url": success_url + "?session_id=mock_session_id",
        "plan": plan,
        "price": plan_info["price"]
    }

async def create_portal_session(customer_id: str, return_url: str) -> Dict[str, str]:
    """Create Stripe customer portal session"""
    if not STRIPE_SECRET_KEY:
        return {"url": return_url}
    
    # TODO: Implement actual portal session
    return {"url": return_url}

async def verify_webhook(payload: bytes, signature: str) -> Dict[str, Any]:
    """Verify Stripe webhook signature and parse event"""
    if not STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook secret not configured")
        return {}
    
    # TODO: Implement actual signature verification
    return {}

def check_plan_limit(user_plan: str, feature: str, current_count: int) -> bool:
    """Check if user is within plan limits for a feature"""
    if user_plan not in PLANS:
        user_plan = "free"
    
    plan = PLANS[user_plan]
    limit = plan["features"].get(feature, 0)
    
    if limit == -1:  # unlimited
        return True
    
    return current_count < limit
