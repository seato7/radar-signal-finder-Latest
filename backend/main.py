from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import os
from backend.db import init_db, close_db
from backend.init_admin import init_admin
from backend.routers import health, radar, ingest, alerts, backtest, watchlist, assets, themes, healthz, bots, payments, admin, auth, broker, api_keys, analytics, assets_populate, prices
from backend.config import settings
from backend.logging_config import setup_logging
from backend.metrics import metrics

# Initialize logging
log_level = os.getenv("LOG_LEVEL", "INFO")
setup_logging(log_level=log_level)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Opportunity Radar API")
    await init_db()
    await init_admin()
    
    # Auto-populate assets if empty
    from backend.db import get_db
    from backend.routers.assets_populate import auto_populate_assets
    db = get_db()
    await auto_populate_assets(db)
    
    # Start tiered price scheduler if enabled
    if settings.PRICE_SCHEDULER_ENABLED:
        from backend.services.price_scheduler import start_scheduler, TIER_INTERVALS
        start_scheduler()
        logger.info(f"Tiered price scheduler started: {TIER_INTERVALS}")
    
    metrics.increment("app_starts")
    yield
    # Shutdown
    logger.info("Shutting down Opportunity Radar API")
    
    # Stop scheduler
    if settings.PRICE_SCHEDULER_ENABLED:
        from backend.services.price_scheduler import stop_scheduler
        stop_scheduler()
    
    await close_db()

app = FastAPI(
    title="Opportunity Radar API",
    version="1.0.0",
    lifespan=lifespan
)

# Global exception handler - prevents information leakage
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log detailed error server-side for debugging
    logger.error(
        f"Unhandled exception: {type(exc).__name__}: {str(exc)}",
        exc_info=True,
        extra={
            "extra_fields": {
                "path": request.url.path,
                "method": request.method,
                "client_host": request.client.host if request.client else "unknown"
            }
        }
    )
    metrics.increment("unhandled_exceptions")
    
    # Return generic error to client (no internal details)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An error occurred processing your request",
            "error_code": "INTERNAL_ERROR"
        }
    )

# CORS - strict: only FRONTEND_PUBLIC_URL allowed
if not settings.FRONTEND_PUBLIC_URL:
    raise ValueError("FRONTEND_PUBLIC_URL must be set in environment")

# Parse comma-separated origins to support multiple domains
allowed_origins = [
    origin.strip() 
    for origin in settings.FRONTEND_PUBLIC_URL.split(',')
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(radar.router, prefix="/api/radar", tags=["radar"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(backtest.router, prefix="/api/backtest", tags=["backtest"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(assets.router, prefix="/api/assets", tags=["assets"])
app.include_router(assets_populate.router, prefix="/api/assets", tags=["assets"])
app.include_router(themes.router, prefix="/api/themes", tags=["themes"])
app.include_router(healthz.router, prefix="/api/healthz", tags=["health"])
app.include_router(bots.router, prefix="/api/bots", tags=["bots"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(broker.router)
app.include_router(api_keys.router)
app.include_router(analytics.router)
app.include_router(prices.router, prefix="/api/prices", tags=["prices"])

# Request counting middleware
@app.middleware("http")
async def count_requests(request: Request, call_next):
    metrics.increment("http_requests_total")
    metrics.increment(f"http_requests_{request.method.lower()}")
    
    try:
        response = await call_next(request)
        metrics.increment(f"http_responses_{response.status_code}")
        return response
    except Exception as e:
        metrics.increment("http_errors")
        raise

@app.get("/")
async def root():
    return {"message": "Opportunity Radar API", "docs": "/docs"}
