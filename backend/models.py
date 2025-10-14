from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import hashlib
import json

class Citation(BaseModel):
    source: str
    url: Optional[str] = None
    timestamp: str

class Signal(BaseModel):
    id: str = Field(default_factory=lambda: None)
    signal_type: str
    asset_id: Optional[str] = None
    theme_id: Optional[str] = None
    value_text: Optional[str] = None
    direction: Optional[str] = None  # up, down, neutral
    magnitude: Optional[float] = None
    observed_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    raw: Dict[str, Any] = {}
    oa_citation: Citation
    source_id: Optional[str] = None
    checksum: str
    
    @staticmethod
    def generate_checksum(data: Dict[str, Any]) -> str:
        """Generate deterministic checksum for idempotency"""
        canonical = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(canonical.encode()).hexdigest()

class Asset(BaseModel):
    id: str = Field(default_factory=lambda: None)
    ticker: str
    exchange: str
    name: str
    metadata: Dict[str, Any] = {}

class ThemeContributor(BaseModel):
    ticker: str
    weight: float
    score: float
    trend: Optional[str] = None

class Theme(BaseModel):
    id: str = Field(default_factory=lambda: None)
    name: str
    keywords: List[str]
    alpha: float = 1.0
    contributors: List[ThemeContributor] = []

class Alert(BaseModel):
    id: str = Field(default_factory=lambda: None)
    theme_id: str
    theme: str
    score: float
    positives: List[str]
    dont_miss: Optional[Dict[str, str]] = None
    status: str = "active"  # active, dismissed
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Watchlist(BaseModel):
    id: str = "_id"
    userId: str = "default"
    tickers: List[str] = []

class Price(BaseModel):
    asset_id: Optional[str] = None
    ticker: str
    date: str  # YYYY-MM-DD
    close: float
    checksum: str
    
    @staticmethod
    def generate_checksum(ticker: str, date: str, close: float) -> str:
        data = {"ticker": ticker, "date": date, "close": close}
        canonical = json.dumps(data, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

class Source(BaseModel):
    id: str
    type: str  # rss, csv, sec_filing
    url: str
    last_fetched: Optional[datetime] = None
    metadata: Dict[str, Any] = {}
