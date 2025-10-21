from fastapi import APIRouter, Depends, HTTPException
from backend.db import get_db
from backend.auth import get_current_user
from backend.services.payments import get_plans
from typing import Dict, Any
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/dashboard")
async def get_analytics_dashboard(
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    """Get advanced analytics dashboard (Premium/Enterprise only)"""
    # Check user's subscription plan
    subscription = await db.subscriptions.find_one({"user_id": user.user_id})
    user_plan = subscription.get("plan", "free") if subscription else "free"
    
    if user_plan not in ["premium", "enterprise"]:
        raise HTTPException(
            status_code=403,
            detail="Advanced Analytics requires Premium or Enterprise plan"
        )
    
    # Fetch user's bots
    bots = await db.bots.find({"user_id": user.user_id}).to_list(100)
    
    # Calculate aggregate metrics
    total_pnl = 0.0
    total_trades = 0
    winning_trades = 0
    max_drawdown = 0.0
    bot_performance = []
    
    for bot in bots:
        bot_id = str(bot["_id"])
        
        # Get bot's simulated positions
        positions = await db.positions_sim.find({"bot_id": bot_id}).to_list(100)
        
        # Calculate bot metrics
        bot_pnl = sum(p.get("realized_pnl", 0) + p.get("unrealized_pnl", 0) for p in positions)
        total_pnl += bot_pnl
        
        # Get bot's orders
        orders = await db.orders_sim.find({"bot_id": bot_id}).to_list(1000)
        total_trades += len(orders)
        
        # Calculate win rate
        wins = 0
        total_closed = 0
        for i in range(1, len(orders)):
            if orders[i]["side"] == "sell" and orders[i-1]["side"] == "buy":
                total_closed += 1
                if orders[i]["price"] > orders[i-1]["price"]:
                    wins += 1
                    winning_trades += 1
        
        win_rate = (wins / total_closed * 100) if total_closed > 0 else 0
        
        bot_performance.append({
            "bot_id": bot_id,
            "name": bot.get("name", "Unnamed Bot"),
            "strategy": bot.get("strategy", "unknown"),
            "pnl": bot_pnl,
            "trades": len(orders),
            "win_rate": win_rate
        })
    
    overall_win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0
    
    # Calculate risk metrics (simplified)
    sharpe_ratio = None
    volatility = None
    profit_factor = None
    
    if total_trades > 10:
        # Calculate returns variance for volatility
        returns = []
        for bot_perf in bot_performance:
            if bot_perf["trades"] > 0:
                returns.append(bot_perf["pnl"] / bot_perf["trades"])
        
        if returns:
            import statistics
            volatility = statistics.stdev(returns) if len(returns) > 1 else 0
            avg_return = statistics.mean(returns)
            sharpe_ratio = (avg_return / volatility) if volatility > 0 else 0
            
            # Profit factor = gross profits / gross losses
            gross_profits = sum(r for r in returns if r > 0)
            gross_losses = abs(sum(r for r in returns if r < 0))
            profit_factor = (gross_profits / gross_losses) if gross_losses > 0 else None
    
    return {
        "total_pnl": total_pnl,
        "total_trades": total_trades,
        "win_rate": overall_win_rate,
        "max_drawdown": max_drawdown,
        "bot_performance": bot_performance,
        "sharpe_ratio": sharpe_ratio,
        "volatility": volatility,
        "profit_factor": profit_factor
    }
