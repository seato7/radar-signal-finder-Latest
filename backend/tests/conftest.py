import pytest
import asyncio
from backend.db import init_db, close_db


@pytest.fixture(scope="session", autouse=True)
def initialize_db():
    """Initialize MongoDB connection once for the entire test session.

    Tests call get_db() which returns the global `db` variable set by
    init_db(). Without this fixture, get_db() returns None and every
    async DB operation fails with AttributeError.

    Uses asyncio.run() so it is self-contained and does not interfere
    with the per-test event loops created by pytest-asyncio.
    """
    asyncio.run(init_db())
    yield
    asyncio.run(close_db())
