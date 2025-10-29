from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    MONGO_URL: str  # No default - must be set via environment variable
    DB_NAME: str = "opportunity_radar"
    
    SLACK_WEBHOOK: Optional[str] = None
    FRONTEND_PUBLIC_URL: str = "http://localhost:5173"
    
    SEC_USER_AGENT: str = "Opportunity Radar hello@example.com"
    SEC_ACCEPT_LANGUAGE: str = "en-US,en;q=0.9"
    
    POLICY_FEEDS: str = ""  # comma-separated RSS/Atom URLs
    POLICY_KEYWORDS: str = "regulation,policy,SEC,CFTC,Fed,treasury,banking"
    
    ETF_FLOWS_CSV_URLS: str = ""  # comma-separated CSV URLs
    ETF_SECTOR_MAP_JSON: str = ""  # JSON mapping ETF ticker to sector
    
    PRICE_CSV_URLS: str = ""  # comma-separated price CSV URLs
    CUSIP_MAP_CSV_URLS: str = ""  # comma-separated CUSIP mapping CSVs
    
    OPENFIGI_API_KEY: Optional[str] = None
    
    ALERT_SCORE_THRESHOLD: float = 2.0
    HALF_LIFE_DAYS: float = 30.0
    
    TTL_DAYS: int = 365  # Signal retention (default 1 year)
    
    ETL_TIMEOUT_SECONDS: float = 15.0  # HTTP request timeout for ETLs
    ETL_RATE_LIMIT: float = 5.0  # Requests per second
    
    JWT_SECRET_KEY: str  # REQUIRED - must be set via environment variable
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Supabase configuration (for edge function calls)
    SUPABASE_URL: Optional[str] = None
    
    # Alpaca broker configuration
    ALPACA_API_KEY: Optional[str] = None
    ALPACA_SECRET_KEY: Optional[str] = None
    ALPACA_PAPER_MODE: bool = True  # Safety: default to paper trading
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
