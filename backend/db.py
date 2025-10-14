from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

client: AsyncIOMotorClient = None
db = None

async def init_db():
    global client, db
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DB_NAME]
    
    # Create indexes
    await db.signals.create_index("checksum", unique=True)
    await db.signals.create_index("signal_type")
    await db.signals.create_index("observed_at")
    
    await db.assets.create_index("ticker", unique=True)
    
    await db.themes.create_index("name", unique=True)
    
    await db.prices.create_index("checksum", unique=True)
    await db.prices.create_index([("ticker", 1), ("date", -1)])
    
    await db.alerts.create_index("created_at")
    
    print(f"✓ Connected to MongoDB: {settings.DB_NAME}")

async def close_db():
    global client
    if client:
        client.close()
        print("✓ Closed MongoDB connection")

def get_db():
    return db
