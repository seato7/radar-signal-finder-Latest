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
        "stripe_price_id": os.getenv("STRIPE_LITE_PRICE_ID", "price_1SKByaRxVAVJnFJ4PcqG5uaX"),
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
        "stripe_price_id": os.getenv("STRIPE_STARTER_PRICE_ID", "price_1SKBz4RxVAVJnFJ423DRGPZP"),
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
        "stripe_price_id": os.getenv("STRIPE_PRO_PRICE_ID", "price_1SKBzORxVAVJnFJ4Pwee2TOR"),
        "features": {
            "max_bots": 10,
            "max_alerts": -1,
            "live_eligible": True,
            "exports": ["csv", "parquet"],
            "backtest_days": -1
        }
    },
    "premium": {
        "name": "Premium",
        "price": 59.99,
        "currency": "USD",
        "stripe_price_id": os.getenv("STRIPE_PREMIUM_PRICE_ID", "price_1SKBzsRxVAVJnFJ4OMUknOIZ"),
        "features": {
            "max_bots": -1,
            "max_alerts": -1,
            "live_eligible": True,
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
            "exports": ["csv", "parquet"],
            "backtest_days": -1,
            "custom_support": True
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
    
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        
        # Check if customer exists
        customers = stripe.Customer.list(email=user_id, limit=1)
        customer_id = customers.data[0].id if customers.data else None
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer_id,
            customer_email=user_id if not customer_id else None,
            line_items=[{
                'price': plan_info['stripe_price_id'],
                'quantity': 1,
            }],
            mode='subscription',
            success_url=success_url,
            cancel_url=cancel_url,
        )
        
        return {
            "session_id": session.id,
            "url": session.url,
            "plan": plan,
            "price": plan_info["price"]
        }
    except Exception as e:
        logger.error(f"Error creating checkout session: {e}")
        raise

async def create_portal_session(customer_id: str, return_url: str) -> Dict[str, str]:
    """Create Stripe customer portal session"""
    if not STRIPE_SECRET_KEY:
        return {"url": return_url}
    
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return {"url": session.url}
    except Exception as e:
        logger.error(f"Error creating portal session: {e}")
        raise

async def verify_webhook(payload: bytes, signature: str) -> Dict[str, Any]:
    """Verify Stripe webhook signature and parse event"""
    if not STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook secret not configured")
        return {}
    
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        
        event = stripe.Webhook.construct_event(
            payload, signature, STRIPE_WEBHOOK_SECRET
        )
        return event
    except Exception as e:
        logger.error(f"Error verifying webhook: {e}")
        raise

def check_plan_limit(user_plan: str, feature: str, current_count: int) -> bool:
    """Check if user is within plan limits for a feature"""
    if user_plan not in PLANS:
        user_plan = "free"
    
    plan = PLANS[user_plan]
    limit = plan["features"].get(feature, 0)
    
    if limit == -1:  # unlimited
        return True
    
    return current_count < limit
