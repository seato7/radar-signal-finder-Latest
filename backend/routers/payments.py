from fastapi import APIRouter, HTTPException, Depends, Request
from backend.db import get_db
from backend.services.payments import get_plans, create_checkout_session, create_portal_session, verify_webhook
from datetime import datetime
from typing import Dict
from bson import ObjectId

router = APIRouter()

def convert_objectid_to_str(doc: dict) -> dict:
    """Convert all ObjectId fields in a document to strings for JSON serialization"""
    if not doc:
        return doc
    
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, dict):
            result[key] = convert_objectid_to_str(value)
        elif isinstance(value, list):
            result[key] = [convert_objectid_to_str(item) if isinstance(item, dict) else str(item) if isinstance(item, ObjectId) else item for item in value]
        else:
            result[key] = value
    return result

@router.get("/plans")
async def get_payment_plans():
    """Get all available payment plans"""
    return {"plans": get_plans()}

@router.post("/checkout")
async def create_checkout(
    data: Dict[str, str],
    db=Depends(get_db)
):
    """Create Stripe checkout session"""
    user_id = data.get("user_id", "default")
    plan = data.get("plan")
    success_url = data.get("success_url", "http://localhost:5173/pricing?success=true")
    cancel_url = data.get("cancel_url", "http://localhost:5173/pricing?canceled=true")
    
    if not plan:
        raise HTTPException(status_code=400, detail="Plan is required")
    
    session = await create_checkout_session(user_id, plan, success_url, cancel_url)
    return session

@router.get("/status")
async def get_payment_status(user_id: str = "default", db=Depends(get_db)):
    """Get user's current subscription status"""
    # First try to find user by email (user_id could be email)
    user = await db.users.find_one({"email": user_id})
    
    # If user found, look up subscription by their ObjectId
    if user:
        subscription = await db.subscriptions.find_one({"user_id": str(user["_id"])})
    else:
        # Fallback: try direct lookup by user_id
        subscription = await db.subscriptions.find_one({"user_id": user_id})
    
    if not subscription:
        return {
            "plan": "free",
            "status": "active",
            "features": get_plans()["free"]["features"]
        }
    
    # Convert all ObjectId fields to strings for JSON serialization
    return convert_objectid_to_str(dict(subscription))

@router.post("/webhook")
async def stripe_webhook(request: Request, db=Depends(get_db)):
    """Handle Stripe webhook events"""
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    
    try:
        event = await verify_webhook(payload, signature)
        
        # Handle different event types
        event_type = event.get("type", "")
        
        if event_type == "checkout.session.completed":
            # Update subscription
            session = event.get("data", {}).get("object", {})
            user_id = session.get("client_reference_id", "default")
            
            await db.subscriptions.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "status": "active",
                        "stripe_customer_id": session.get("customer"),
                        "stripe_sub_id": session.get("subscription"),
                        "updated_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
        
        return {"status": "success"}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/portal")
async def customer_portal(user_id: str = "default", db=Depends(get_db)):
    """Get Stripe customer portal URL"""
    subscription = await db.subscriptions.find_one({"user_id": user_id})
    
    if not subscription or not subscription.get("stripe_customer_id"):
        raise HTTPException(status_code=404, detail="No active subscription")
    
    return_url = "http://localhost:5173/pricing"
    session = await create_portal_session(subscription["stripe_customer_id"], return_url)
    
    return session
