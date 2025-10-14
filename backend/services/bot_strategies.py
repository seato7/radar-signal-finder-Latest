"""Trading bot strategy implementations"""
from typing import List, Dict, Any, Tuple
from datetime import datetime, timedelta
import statistics
from backend.models_bots import OrderSim

class BaseStrategy:
    def __init__(self, params: Dict[str, Any]):
        self.params = params
    
    def evaluate(self, ticker: str, prices: List[Dict], current_position: float) -> List[OrderSim]:
        """Return list of orders to execute"""
        raise NotImplementedError()

class GridBot(BaseStrategy):
    """Place buy/sell orders in a grid between lower and upper price"""
    
    def evaluate(self, ticker: str, prices: List[Dict], current_position: float) -> List[OrderSim]:
        if len(prices) < 2:
            return []
        
        lower = self.params.get("lower", 0)
        upper = self.params.get("upper", 0)
        grid_count = self.params.get("grid_count", 10)
        base_qty = self.params.get("base_qty", 1.0)
        
        current_price = prices[-1]["close"]
        orders = []
        
        # Simple grid: buy at lower levels, sell at upper levels
        grid_step = (upper - lower) / grid_count
        
        for i in range(grid_count):
            level_price = lower + (i * grid_step)
            
            # Buy if price near lower levels and not holding
            if current_position <= 0 and abs(current_price - level_price) < grid_step * 0.5:
                if current_price <= level_price:
                    orders.append(OrderSim(
                        bot_id="",
                        ticker=ticker,
                        side="buy",
                        qty=base_qty,
                        price=current_price,
                        reason=f"Grid buy at {level_price:.2f}"
                    ))
            
            # Sell if price near upper levels and holding
            elif current_position > 0 and abs(current_price - level_price) < grid_step * 0.5:
                if current_price >= level_price and i > grid_count / 2:
                    orders.append(OrderSim(
                        bot_id="",
                        ticker=ticker,
                        side="sell",
                        qty=min(base_qty, current_position),
                        price=current_price,
                        reason=f"Grid sell at {level_price:.2f}"
                    ))
        
        return orders

class MomentumBot(BaseStrategy):
    """Enter on z-score threshold, exit on reversal"""
    
    def evaluate(self, ticker: str, prices: List[Dict], current_position: float) -> List[OrderSim]:
        lookback = self.params.get("lookback", 20)
        z_entry = self.params.get("z_entry", 2.0)
        z_exit = self.params.get("z_exit", 0.5)
        base_qty = self.params.get("base_qty", 1.0)
        
        if len(prices) < lookback + 1:
            return []
        
        recent_prices = [p["close"] for p in prices[-lookback:]]
        current_price = prices[-1]["close"]
        
        mean = statistics.mean(recent_prices)
        stdev = statistics.stdev(recent_prices) if len(recent_prices) > 1 else 0.01
        z_score = (current_price - mean) / stdev if stdev > 0 else 0
        
        orders = []
        
        # Enter long on positive momentum
        if current_position == 0 and z_score > z_entry:
            orders.append(OrderSim(
                bot_id="",
                ticker=ticker,
                side="buy",
                qty=base_qty,
                price=current_price,
                reason=f"Momentum entry z={z_score:.2f}"
            ))
        
        # Exit on reversal
        elif current_position > 0 and z_score < z_exit:
            orders.append(OrderSim(
                bot_id="",
                ticker=ticker,
                side="sell",
                qty=current_position,
                price=current_price,
                reason=f"Momentum exit z={z_score:.2f}"
            ))
        
        return orders

class DCABot(BaseStrategy):
    """Dollar cost averaging - buy fixed amount at intervals"""
    
    def __init__(self, params: Dict[str, Any]):
        super().__init__(params)
        self.last_trade_date = None
    
    def evaluate(self, ticker: str, prices: List[Dict], current_position: float) -> List[OrderSim]:
        interval_days = self.params.get("interval_days", 7)
        base_qty = self.params.get("base_qty", 1.0)
        
        if len(prices) < 1:
            return []
        
        current_price = prices[-1]["close"]
        current_date = datetime.fromisoformat(prices[-1]["date"]) if isinstance(prices[-1]["date"], str) else prices[-1]["date"]
        
        # Check if enough time has passed
        if self.last_trade_date is None or (current_date - self.last_trade_date).days >= interval_days:
            self.last_trade_date = current_date
            return [OrderSim(
                bot_id="",
                ticker=ticker,
                side="buy",
                qty=base_qty,
                price=current_price,
                reason=f"DCA interval buy (every {interval_days}d)"
            )]
        
        return []

class MeanReversionBot(BaseStrategy):
    """Buy oversold, sell overbought"""
    
    def evaluate(self, ticker: str, prices: List[Dict], current_position: float) -> List[OrderSim]:
        lookback = self.params.get("lookback", 20)
        z_entry = self.params.get("z_entry", -2.0)  # negative for oversold
        z_exit = self.params.get("z_exit", 0.0)
        base_qty = self.params.get("base_qty", 1.0)
        
        if len(prices) < lookback + 1:
            return []
        
        recent_prices = [p["close"] for p in prices[-lookback:]]
        current_price = prices[-1]["close"]
        
        mean = statistics.mean(recent_prices)
        stdev = statistics.stdev(recent_prices) if len(recent_prices) > 1 else 0.01
        z_score = (current_price - mean) / stdev if stdev > 0 else 0
        
        orders = []
        
        # Buy when oversold
        if current_position == 0 and z_score < z_entry:
            orders.append(OrderSim(
                bot_id="",
                ticker=ticker,
                side="buy",
                qty=base_qty,
                price=current_price,
                reason=f"Mean reversion entry z={z_score:.2f}"
            ))
        
        # Sell when back to mean
        elif current_position > 0 and z_score > z_exit:
            orders.append(OrderSim(
                bot_id="",
                ticker=ticker,
                side="sell",
                qty=current_position,
                price=current_price,
                reason=f"Mean reversion exit z={z_score:.2f}"
            ))
        
        return orders

STRATEGIES = {
    "grid": GridBot,
    "momentum": MomentumBot,
    "dca": DCABot,
    "meanrev": MeanReversionBot
}

def get_strategy_schemas() -> Dict[str, Dict]:
    """Return parameter schemas for each strategy"""
    return {
        "grid": {
            "description": "Place buy/sell orders in a grid between price levels",
            "params": {
                "lower": {"type": "number", "description": "Lower price bound"},
                "upper": {"type": "number", "description": "Upper price bound"},
                "grid_count": {"type": "integer", "description": "Number of grid levels", "default": 10},
                "base_qty": {"type": "number", "description": "Quantity per order", "default": 1.0}
            }
        },
        "momentum": {
            "description": "Enter on strong momentum (z-score), exit on reversal",
            "params": {
                "lookback": {"type": "integer", "description": "Lookback period", "default": 20},
                "z_entry": {"type": "number", "description": "Z-score entry threshold", "default": 2.0},
                "z_exit": {"type": "number", "description": "Z-score exit threshold", "default": 0.5},
                "base_qty": {"type": "number", "description": "Quantity per trade", "default": 1.0}
            }
        },
        "dca": {
            "description": "Dollar cost average - buy fixed amount at intervals",
            "params": {
                "interval_days": {"type": "integer", "description": "Days between buys", "default": 7},
                "base_qty": {"type": "number", "description": "Quantity per buy", "default": 1.0}
            }
        },
        "meanrev": {
            "description": "Buy oversold, sell when price returns to mean",
            "params": {
                "lookback": {"type": "integer", "description": "Lookback period", "default": 20},
                "z_entry": {"type": "number", "description": "Z-score entry (negative)", "default": -2.0},
                "z_exit": {"type": "number", "description": "Z-score exit", "default": 0.0},
                "base_qty": {"type": "number", "description": "Quantity per trade", "default": 1.0}
            }
        }
    }
