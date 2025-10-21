from fastapi import APIRouter, HTTPException, Depends
from backend.db import get_db
from backend.models_bots import Bot, RiskPolicy
from backend.services.bot_strategies import get_strategy_schemas
from backend.services.bot_engine import get_bot_engine
from backend.auth import get_current_active_user, TokenData
from typing import List, Dict, Any
from datetime import datetime

router = APIRouter()

@router.get("/available")
async def get_available_strategies():
    """Get list of available strategies with parameter schemas"""
    return {
        "strategies": get_strategy_schemas()
    }

@router.post("/create")
async def create_bot(
    bot: Bot, 
    db=Depends(get_db),
    current_user: TokenData = Depends(get_current_active_user)
):
    """Create a new trading bot"""
    from backend.services.payments import get_plans
    
    # Get user's subscription
    user_id = current_user.username
    subscription = await db.subscriptions.find_one({"user_id": user_id})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    plan_features = get_plans()[user_plan]["features"]
    
    # Count user's existing bots by type
    paper_bots_count = await db.bots.count_documents({"user_id": user_id, "mode": "paper"})
    live_bots_count = await db.bots.count_documents({"user_id": user_id, "mode": "live"})
    
    # Check if user is trying to create a live bot
    if bot.mode == "live":
        # Check if plan supports live trading
        if not plan_features.get("live_eligible", False):
            raise HTTPException(
                status_code=403,
                detail=f"Live trading requires Starter plan or higher. Your {user_plan} plan only supports paper trading."
            )
        
        # Check live bot limit
        max_live_bots = plan_features.get("max_bots", 0)
        if max_live_bots != -1 and live_bots_count >= max_live_bots:
            raise HTTPException(
                status_code=403, 
                detail=f"Your {user_plan} plan allows {max_live_bots} live bot{'s' if max_live_bots != 1 else ''}. Upgrade for more."
            )
    else:
        # Paper bot - check paper bot limit
        max_paper_bots = plan_features.get("paper_bots", 0)
        if max_paper_bots != -1 and paper_bots_count >= max_paper_bots:
            raise HTTPException(
                status_code=403, 
                detail=f"Your {user_plan} plan allows {max_paper_bots} paper bot{'s' if max_paper_bots != 1 else ''}. Upgrade for more."
            )
    
    bot.created_at = datetime.utcnow()
    bot.updated_at = datetime.utcnow()
    
    bot_dict = bot.dict(exclude={"id"})
    bot_dict["user_id"] = current_user.user_id  # Link bot to user
    
    result = await db.bots.insert_one(bot_dict)
    bot.id = str(result.inserted_id)
    
    await db.bots.update_one({"_id": result.inserted_id}, {"$set": {"_id": str(result.inserted_id)}})
    
    return {"bot_id": bot.id, "status": "created"}

@router.get("/{bot_id}")
async def get_bot(bot_id: str, db=Depends(get_db)):
    """Get bot details"""
    bot = await db.bots.find_one({"_id": bot_id})
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@router.post("/{bot_id}/simulate")
async def simulate_bot(bot_id: str, params: Dict[str, Any], db=Depends(get_db)):
    """Simulate bot performance over historical data"""
    bot_doc = await db.bots.find_one({"_id": bot_id})
    if not bot_doc:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    bot = Bot(**bot_doc)
    since_days = params.get("since_days", 30)
    
    engine = await get_bot_engine()
    result = await engine.simulate_bot(bot, since_days)
    
    return result

@router.post("/{bot_id}/start")
async def start_bot(bot_id: str, db=Depends(get_db)):
    """Start paper trading bot"""
    engine = await get_bot_engine()
    await engine.start_bot(bot_id)
    return {"status": "running"}

@router.post("/{bot_id}/pause")
async def pause_bot(bot_id: str, db=Depends(get_db)):
    """Pause bot"""
    engine = await get_bot_engine()
    await engine.pause_bot(bot_id)
    return {"status": "paused"}

@router.post("/{bot_id}/stop")
async def stop_bot(bot_id: str, db=Depends(get_db)):
    """Stop bot"""
    engine = await get_bot_engine()
    await engine.stop_bot(bot_id)
    return {"status": "stopped"}

@router.get("/{bot_id}/logs")
async def get_bot_logs(bot_id: str, limit: int = 100, db=Depends(get_db)):
    """Get bot logs"""
    logs = await db.bot_logs.find({"bot_id": bot_id}).sort("ts", -1).limit(limit).to_list(length=limit)
    return {"logs": logs}

@router.get("/{bot_id}/positions")
async def get_bot_positions(bot_id: str, db=Depends(get_db)):
    """Get bot current positions"""
    positions = await db.positions_sim.find({"bot_id": bot_id}).to_list(length=None)
    return {"positions": positions}

@router.post("/{bot_id}/subscribe_theme")
async def subscribe_theme(bot_id: str, subscription: Dict[str, Any], db=Depends(get_db)):
    """Subscribe bot to theme trigger"""
    bot = await db.bots.find_one({"_id": bot_id})
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    await db.bots.update_one(
        {"_id": bot_id},
        {"$push": {"theme_subscriptions": subscription}}
    )
    
    return {"status": "subscribed"}

@router.get("/{bot_id}/subscriptions")
async def get_subscriptions(bot_id: str, db=Depends(get_db)):
    """Get bot theme subscriptions"""
    bot = await db.bots.find_one({"_id": bot_id})
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    return {"subscriptions": bot.get("theme_subscriptions", [])}

@router.get("/broker/test")
async def test_broker_connection(db=Depends(get_db)):
    """Test Alpaca broker connection"""
    from backend.services.alpaca_broker import get_broker
    
    broker = get_broker(paper_mode=True)
    account = await broker.get_account()
    
    if "error" in account:
        return {
            "connected": False,
            "error": account["error"],
            "configured": bool(broker.api_key)
        }
    
    return {
        "connected": True,
        "account_number": account.get("account_number", "N/A"),
        "buying_power": account.get("buying_power", "0"),
        "cash": account.get("cash", "0"),
        "portfolio_value": account.get("portfolio_value", "0"),
        "paper_mode": True
    }

@router.post("/{bot_id}/sync_positions")
async def sync_positions(bot_id: str, db=Depends(get_db)):
    """Sync live positions from broker"""
    bot = await db.bots.find_one({"_id": bot_id})
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    if bot["mode"] != "live":
        raise HTTPException(status_code=400, detail="Bot must be in live mode")
    
    engine = await get_bot_engine()
    await engine.sync_live_positions(bot_id)
    
    return {"status": "synced"}

@router.get("/{bot_id}/live_positions")
async def get_live_positions(bot_id: str, db=Depends(get_db)):
    """Get live positions for bot"""
    bot = await db.bots.find_one({"_id": bot_id})
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    if bot["mode"] != "live":
        # Return paper positions if not live
        positions = await db.positions_sim.find({"bot_id": bot_id}).to_list(length=None)
        return {"mode": "paper", "positions": positions}
    
    positions = await db.positions_live.find({"bot_id": bot_id}).to_list(length=None)
    return {"mode": "live", "positions": positions}

@router.post("/{bot_id}/upgrade_to_live")
async def upgrade_to_live(
    bot_id: str,
    db=Depends(get_db),
    current_user: TokenData = Depends(get_current_active_user)
):
    """Upgrade bot from paper to live mode (with safety checks)"""
    from backend.services.payments import get_plans
    
    # Get bot
    bot = await db.bots.find_one({"_id": bot_id})
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    # Check user subscription
    user_id = current_user.username
    subscription = await db.subscriptions.find_one({"user_id": user_id})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    
    # Verify plan allows live trading
    plan_features = get_plans()[user_plan]["features"]
    if not plan_features.get("live_eligible", False):
        raise HTTPException(
            status_code=403,
            detail=f"Live trading requires Starter plan or higher. Current plan: {user_plan}"
        )
    
    # Check live bot limit
    live_bots_count = await db.bots.count_documents({"user_id": user_id, "mode": "live"})
    max_live_bots = plan_features.get("max_bots", 0)
    if max_live_bots != -1 and live_bots_count >= max_live_bots:
        raise HTTPException(
            status_code=403,
            detail=f"Your {user_plan} plan allows {max_live_bots} live bot{'s' if max_live_bots != 1 else ''}. Upgrade for more."
        )
    
    # Check broker connection
    from backend.services.alpaca_broker import get_broker
    broker = get_broker(paper_mode=True)  # Test with paper first
    account = await broker.get_account()
    
    if "error" in account:
        raise HTTPException(
            status_code=400,
            detail=f"Broker connection failed: {account['error']}. Configure ALPACA_API_KEY and ALPACA_SECRET_KEY."
        )
    
    # Safety check: bot must have been tested in paper mode
    orders_count = await db.orders_sim.count_documents({"bot_id": bot_id})
    if orders_count < 5:
        raise HTTPException(
            status_code=400,
            detail=f"Bot must execute at least 5 paper trades before going live. Current: {orders_count}"
        )
    
    # Upgrade to live
    await db.bots.update_one(
        {"_id": bot_id},
        {"$set": {"mode": "live", "updated_at": datetime.utcnow()}}
    )
    
    engine = await get_bot_engine()
    await engine._log_bot(bot_id, "warning", "Bot upgraded to LIVE TRADING mode")
    
    return {
        "status": "upgraded",
        "mode": "live",
        "warning": "Bot is now trading with real money. Monitor closely."
    }
