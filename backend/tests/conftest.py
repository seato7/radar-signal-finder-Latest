import pytest
import asyncio
import pytest_asyncio
from backend.db import init_db, close_db


@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for the entire session.

    Motor creates AsyncIOMotorClient bound to the running event loop.
    All async tests must share this same loop so Motor never dispatches
    operations to a closed loop from a previous asyncio.run() call.
    """
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def initialize_db():
    """Initialize MongoDB connection once for the entire test session."""
    await init_db()
    yield
    await close_db()
