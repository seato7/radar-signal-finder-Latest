from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import os
from backend.db import init_db, close_db
from backend.routers import health, radar, ingest, alerts, backtest, watchlist, assets, themes, healthz
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
    metrics.increment("app_starts")
    yield
    # Shutdown
    logger.info("Shutting down Opportunity Radar API")
    await close_db()

app = FastAPI(
    title="Opportunity Radar API",
    version="1.0.0",
    lifespan=lifespan
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled exception: {str(exc)}",
        exc_info=True,
        extra={
            "extra_fields": {
                "path": request.url.path,
                "method": request.method
            }
        }
    )
    metrics.increment("unhandled_exceptions")
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# CORS - strict: only FRONTEND_PUBLIC_URL allowed
if not settings.FRONTEND_PUBLIC_URL:
    raise ValueError("FRONTEND_PUBLIC_URL must be set in environment")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_PUBLIC_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(radar.router, prefix="/api/radar", tags=["radar"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(backtest.router, prefix="/api/backtest", tags=["backtest"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(assets.router, prefix="/api/assets", tags=["assets"])
app.include_router(themes.router, prefix="/api/themes", tags=["themes"])
app.include_router(healthz.router, prefix="/api/healthz", tags=["health"])

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
