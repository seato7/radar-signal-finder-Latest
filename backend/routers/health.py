from fastapi import APIRouter
from backend.scoring import get_weights

router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "ok", "service": "opportunity-radar"}

@router.get("/healthz/weights")
async def healthz_weights():
    weights = get_weights()
    return {
        "weights": weights,
        "description": "Scoring component weights (exponential decay applied per signal)"
    }
