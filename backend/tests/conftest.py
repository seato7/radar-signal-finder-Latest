import pytest_asyncio
from backend.db import init_db, close_db


@pytest_asyncio.fixture(autouse=True)
async def initialize_db():
    """Re-initialize Motor for every test's event loop.

    pytest-asyncio 0.23.x gives each async test its own function-scoped event
    loop. Motor creates Futures tied to the loop that was running when it first
    performed I/O. Re-initializing per-test ensures Motor always creates
    Futures on the same loop the test is running on, avoiding the
    'Future attached to a different loop' cross-loop error.
    """
    await init_db()
    yield
    await close_db()
