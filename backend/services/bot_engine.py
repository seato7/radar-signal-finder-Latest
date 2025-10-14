"""Trading bot simulation and execution engine"""
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from backend.db import get_db
from backend.models_bots import Bot, OrderSim, PositionSim, BotLog, RiskPolicy
from backend.services.bot_strategies import STRATEGIES
from backend.logging_config import get_logger
from backend.metrics import increment_counter

logger = get_logger(__name__)

class BotEngine:
    """Manages bot execution and simulation"""
    
    def __init__(self, db):
        self.db = db
        self.running_bots = {}
    
    async def simulate_bot(self, bot: Bot, since_days: int = 30) -> Dict[str, Any]:
        """Simulate bot performance over historical data"""
        logger.info(f"Simulating bot {bot.id} for {since_days} days")
        
        # Get historical prices for bot tickers
        cutoff_date = (datetime.utcnow() - timedelta(days=since_days)).strftime("%Y-%m-%d")
        
        all_trades = []
        positions = {}
        total_pnl = 0.0
        max_drawdown = 0.0
        peak_value = 0.0
        
        for ticker in bot.tickers:
            prices_cursor = self.db.prices.find({
                "ticker": ticker,
                "date": {"$gte": cutoff_date}
            }).sort("date", 1)
            
            prices = await prices_cursor.to_list(length=None)
            
            if len(prices) < 2:
                continue
            
            # Initialize strategy
            strategy_class = STRATEGIES.get(bot.strategy)
            if not strategy_class:
                continue
            
            strategy = strategy_class(bot.params)
            current_position = 0.0
            position_value = 0.0
            
            # Simulate each day
            for i in range(len(prices)):
                window_prices = prices[:i+1]
                current_price = prices[i]["close"]
                
                # Evaluate strategy
                orders = strategy.evaluate(ticker, window_prices, current_position)
                
                # Execute orders with slippage
                for order in orders:
                    slippage = (bot.risk_policy.slippage_bps / 10000.0) * order.price
                    if order.side == "buy":
                        fill_price = order.price + slippage
                        current_position += order.qty
                        position_value += order.qty * fill_price
                    else:
                        fill_price = order.price - slippage
                        realized = (fill_price - (position_value / current_position if current_position > 0 else 0)) * order.qty
                        total_pnl += realized
                        current_position -= order.qty
                        if current_position > 0:
                            position_value = current_position * (position_value / (current_position + order.qty))
                        else:
                            position_value = 0
                    
                    order.bot_id = bot.id
                    order.ticker = ticker
                    order.price = fill_price
                    order.slippage_applied = slippage
                    all_trades.append(order.dict())
                
                # Track drawdown
                unrealized = (current_price * current_position) - position_value if current_position > 0 else 0
                current_value = position_value + unrealized + total_pnl
                peak_value = max(peak_value, current_value)
                if peak_value > 0:
                    drawdown = ((peak_value - current_value) / peak_value) * 100
                    max_drawdown = max(max_drawdown, drawdown)
            
            if current_position > 0:
                positions[ticker] = {
                    "qty": current_position,
                    "avg_price": position_value / current_position,
                    "unrealized_pnl": (prices[-1]["close"] * current_position) - position_value
                }
        
        return {
            "trades": all_trades,
            "pnl": total_pnl,
            "max_drawdown": max_drawdown,
            "win_rate": self._calculate_win_rate(all_trades),
            "positions": positions
        }
    
    def _calculate_win_rate(self, trades: List[Dict]) -> float:
        """Calculate win rate from closed trades"""
        if len(trades) < 2:
            return 0.0
        
        wins = 0
        total = 0
        
        for i in range(1, len(trades)):
            if trades[i]["side"] == "sell" and trades[i-1]["side"] == "buy":
                if trades[i]["price"] > trades[i-1]["price"]:
                    wins += 1
                total += 1
        
        return (wins / total * 100) if total > 0 else 0.0
    
    async def start_bot(self, bot_id: str):
        """Start paper trading bot scheduler"""
        bot = await self.db.bots.find_one({"_id": bot_id})
        if not bot:
            raise ValueError("Bot not found")
        
        if bot["status"] == "running":
            return
        
        await self.db.bots.update_one(
            {"_id": bot_id},
            {"$set": {"status": "running", "updated_at": datetime.utcnow()}}
        )
        
        self.running_bots[bot_id] = True
        logger.info(f"Started bot {bot_id}")
        increment_counter("bot_started")
        
        await self._log_bot(bot_id, "info", "Bot started")
    
    async def stop_bot(self, bot_id: str):
        """Stop bot"""
        await self.db.bots.update_one(
            {"_id": bot_id},
            {"$set": {"status": "stopped", "updated_at": datetime.utcnow()}}
        )
        
        if bot_id in self.running_bots:
            del self.running_bots[bot_id]
        
        logger.info(f"Stopped bot {bot_id}")
        increment_counter("bot_stopped")
        
        await self._log_bot(bot_id, "info", "Bot stopped")
    
    async def pause_bot(self, bot_id: str):
        """Pause bot"""
        await self.db.bots.update_one(
            {"_id": bot_id},
            {"$set": {"status": "paused", "updated_at": datetime.utcnow()}}
        )
        
        logger.info(f"Paused bot {bot_id}")
        await self._log_bot(bot_id, "info", "Bot paused")
    
    async def tick_bot(self, bot_id: str):
        """Execute one tick of bot strategy"""
        bot_doc = await self.db.bots.find_one({"_id": bot_id})
        if not bot_doc or bot_doc["status"] != "running":
            return
        
        bot = Bot(**bot_doc)
        
        # Check circuit breaker
        positions = await self.db.positions_sim.find({"bot_id": bot_id}).to_list(length=None)
        total_value = sum(p["qty"] * p["avg_price"] for p in positions)
        total_pnl = sum(p.get("realized_pnl", 0) + p.get("unrealized_pnl", 0) for p in positions)
        
        if total_value > 0:
            drawdown_pct = abs(min(0, total_pnl) / total_value) * 100
            if drawdown_pct > bot.risk_policy.max_drawdown_pct:
                await self.pause_bot(bot_id)
                await self._log_bot(bot_id, "warning", f"Circuit breaker triggered: drawdown {drawdown_pct:.2f}%")
                increment_counter("bot_circuit_breaker")
                return
        
        # Check theme subscriptions
        for sub in bot.theme_subscriptions:
            await self._check_theme_trigger(bot, sub)
        
        # Execute strategy for each ticker
        strategy_class = STRATEGIES.get(bot.strategy)
        if not strategy_class:
            return
        
        strategy = strategy_class(bot.params)
        
        for ticker in bot.tickers:
            # Get recent prices
            prices_cursor = self.db.prices.find({
                "ticker": ticker
            }).sort("date", -1).limit(100)
            
            prices = await prices_cursor.to_list(length=100)
            prices.reverse()
            
            if len(prices) < 2:
                continue
            
            # Get current position
            position = await self.db.positions_sim.find_one({"bot_id": bot_id, "ticker": ticker})
            current_qty = position["qty"] if position else 0.0
            
            # Evaluate strategy
            orders = strategy.evaluate(ticker, prices, current_qty)
            
            # Execute orders
            for order in orders:
                await self._execute_order(bot, order)
    
    async def _execute_order(self, bot: Bot, order: OrderSim):
        """Execute simulated order and update positions"""
        order.bot_id = bot.id
        
        # Apply slippage
        slippage = (bot.risk_policy.slippage_bps / 10000.0) * order.price
        if order.side == "buy":
            order.price += slippage
        else:
            order.price -= slippage
        
        order.slippage_applied = slippage
        
        # Save order
        await self.db.orders_sim.insert_one(order.dict())
        
        # Update position
        position = await self.db.positions_sim.find_one({"bot_id": bot.id, "ticker": order.ticker})
        
        if order.side == "buy":
            if position:
                new_qty = position["qty"] + order.qty
                new_avg = ((position["qty"] * position["avg_price"]) + (order.qty * order.price)) / new_qty
                await self.db.positions_sim.update_one(
                    {"_id": position["_id"]},
                    {"$set": {"qty": new_qty, "avg_price": new_avg, "ts": datetime.utcnow()}}
                )
            else:
                await self.db.positions_sim.insert_one({
                    "bot_id": bot.id,
                    "ticker": order.ticker,
                    "qty": order.qty,
                    "avg_price": order.price,
                    "unrealized_pnl": 0.0,
                    "realized_pnl": 0.0,
                    "ts": datetime.utcnow()
                })
        else:  # sell
            if position and position["qty"] >= order.qty:
                realized = (order.price - position["avg_price"]) * order.qty
                new_qty = position["qty"] - order.qty
                
                if new_qty > 0:
                    await self.db.positions_sim.update_one(
                        {"_id": position["_id"]},
                        {
                            "$set": {"qty": new_qty, "ts": datetime.utcnow()},
                            "$inc": {"realized_pnl": realized}
                        }
                    )
                else:
                    await self.db.positions_sim.delete_one({"_id": position["_id"]})
        
        await self._log_bot(bot.id, "info", f"Executed {order.side} {order.qty} {order.ticker} @ {order.price:.2f}")
        increment_counter(f"bot_order_{order.side}")
    
    async def _check_theme_trigger(self, bot: Bot, subscription: Dict):
        """Check if theme subscription should trigger action"""
        theme_id = subscription.get("theme_id")
        score_threshold = subscription.get("score_threshold", 0)
        
        # Get theme score (simplified - in production would call radar endpoint)
        theme = await self.db.themes.find_one({"_id": theme_id})
        if not theme:
            return
        
        # TODO: Calculate actual score using scoring service
        # For now, just log
        await self._log_bot(bot.id, "info", f"Checking theme {theme['name']} subscription")
    
    async def _log_bot(self, bot_id: str, level: str, msg: str, meta: Dict = None):
        """Add bot log entry"""
        await self.db.bot_logs.insert_one({
            "bot_id": bot_id,
            "level": level,
            "msg": msg,
            "meta": meta or {},
            "ts": datetime.utcnow()
        })

# Global bot engine instance
bot_engine: Optional[BotEngine] = None

async def get_bot_engine():
    global bot_engine
    if bot_engine is None:
        bot_engine = BotEngine(get_db())
    return bot_engine
