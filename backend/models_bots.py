from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
import hashlib
import json

class RiskPolicy(BaseModel):
    max_drawdown_pct: float = 20.0
    max_position_value: float = 10000.0
    max_daily_trades: int = 50
    slippage_bps: int = 10  # basis points

class Bot(BaseModel):
    id: str = Field(default_factory=lambda: None)
    user_id: str = "default"
    name: str
    strategy: Literal["grid", "momentum", "dca", "meanrev"]
    params: Dict[str, Any]
    tickers: List[str] = []
    mode: Literal["paper", "live"] = "paper"
    status: Literal["stopped", "running", "paused"] = "stopped"
    risk_policy: RiskPolicy = Field(default_factory=RiskPolicy)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    theme_subscriptions: List[Dict[str, Any]] = []

class OrderSim(BaseModel):
    id: str = Field(default_factory=lambda: None)
    bot_id: str
    ticker: str
    side: Literal["buy", "sell"]
    qty: float
    price: float
    ts: datetime = Field(default_factory=datetime.utcnow)
    reason: str = ""
    slippage_applied: float = 0.0

class PositionSim(BaseModel):
    id: str = Field(default_factory=lambda: None)
    bot_id: str
    ticker: str
    qty: float
    avg_price: float
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    ts: datetime = Field(default_factory=datetime.utcnow)

class BotLog(BaseModel):
    id: str = Field(default_factory=lambda: None)
    bot_id: str
    level: Literal["info", "warning", "error"]
    msg: str
    meta: Dict[str, Any] = {}
    ts: datetime = Field(default_factory=datetime.utcnow)

class ApiKey(BaseModel):
    id: str = Field(default_factory=lambda: None)
    user_id: str
    label: str
    exchange: str
    key_id: str
    secret_enc: bytes
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: None)
    user_id: str
    plan: Literal["free", "lite", "starter", "pro", "enterprise"]
    status: Literal["active", "canceled", "past_due"]
    stripe_customer_id: Optional[str] = None
    stripe_sub_id: Optional[str] = None
    current_period_end: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
