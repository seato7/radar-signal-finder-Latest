from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.db import init_db, close_db
from backend.routers import health, radar, ingest, alerts, backtest, watchlist, assets
from backend.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown
    await close_db()

app = FastAPI(
    title="Opportunity Radar API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
origins = [settings.FRONTEND_PUBLIC_URL] if settings.FRONTEND_PUBLIC_URL else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

@app.get("/")
async def root():
    return {"message": "Opportunity Radar API", "docs": "/docs"}
