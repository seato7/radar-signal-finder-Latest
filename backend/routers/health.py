from fastapi import APIRouter
from backend.scoring import get_weights
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health")
async def health():
    return {"status": "ok", "service": "opportunity-radar"}

@router.get("/test-supabase-write")
async def test_supabase_write():
    """
    Diagnostic endpoint: attempts a direct INSERT into price_ingestion_log and returns
    the exact success or error from Supabase. Use this to diagnose RLS, auth, URL, or
    schema issues without waiting for a price sync cycle.
    """
    from backend.services.supabase_sync import SupabaseSync
    from backend.config import settings
    import datetime

    result = {
        "supabase_url_configured": bool(settings.SUPABASE_URL),
        "supabase_key_configured": bool(settings.SUPABASE_SERVICE_KEY),
        "url_used": None,
        "status_code": None,
        "response_body": None,
        "error": None,
        "inserted": False,
    }

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        result["error"] = "SUPABASE_URL or SUPABASE_SERVICE_KEY not set in Railway env vars"
        return result

    # Show the URL that will actually be used (after trailing-slash strip)
    result["url_used"] = settings.SUPABASE_URL.rstrip('/') + "/rest/v1/price_ingestion_log"

    test_row = {
        "run_id": str(uuid.uuid4()),
        "vendor": "twelvedata",
        "ticker": "_TEST_WRITE_DIAGNOSTIC_",
        "requested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "response_code": 200,
        "vendor_status": "ok",
        "rows_inserted": 0,
        "newest_date_returned": None,
        "error_message": "diagnostic test row — safe to delete",
        "raw": {"source": "test-supabase-write endpoint"},
    }

    try:
        async with SupabaseSync() as sync:
            response = await sync.session.post(
                f"{sync.url}/rest/v1/price_ingestion_log",
                json=test_row,
                headers={"Prefer": "return=minimal"},
            )
            result["status_code"] = response.status_code
            result["response_body"] = response.text[:500] if response.text else ""
            result["inserted"] = response.status_code in (200, 201, 204)
            if not result["inserted"]:
                result["error"] = f"PostgREST returned {response.status_code}: {response.text[:300]}"
                logger.error(f"test-supabase-write FAILED: {result['error']}")
            else:
                logger.info("test-supabase-write: INSERT succeeded")
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"test-supabase-write exception: {e}")

    return result


@router.get("/healthz/weights")
async def healthz_weights():
    weights = get_weights()
    return {
        "weights": weights,
        "description": "Scoring component weights (exponential decay applied per signal)"
    }
