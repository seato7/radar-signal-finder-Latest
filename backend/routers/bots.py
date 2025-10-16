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
