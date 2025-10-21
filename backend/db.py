from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings
import certifi

client: AsyncIOMotorClient = None
db = None

async def init_db():
    global client, db
    # Connection with OpenSSL SECLEVEL=1 set in Dockerfile
    client = AsyncIOMotorClient(
        settings.MONGO_URL,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=20000
    )
    db = client[settings.DB_NAME]
    
    # Get TTL days from env (default 365)
    ttl_days = int(settings.TTL_DAYS) if hasattr(settings, 'TTL_DAYS') else 365
    ttl_seconds = ttl_days * 24 * 60 * 60
    
    # Create indexes with TTL for signals
    await db.signals.create_index("checksum", unique=True)
    await db.signals.create_index("signal_type")
    await db.signals.create_index("observed_at")
    await db.signals.create_index("theme_id")  # For theme queries
    await db.signals.create_index("created_at", expireAfterSeconds=ttl_seconds)  # TTL index
    
    await db.assets.create_index("ticker", unique=True)
    
    await db.themes.create_index("name", unique=True)
    
    await db.prices.create_index("checksum", unique=True)
    await db.prices.create_index([("ticker", 1), ("date", -1)])
    
    await db.alerts.create_index("created_at")
    await db.alerts.create_index("theme_id")  # For theme alert lookups
    
    # User indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    
    # Broker API keys indexes
    await db.api_keys.create_index("user_id")
    await db.api_keys.create_index([("user_id", 1), ("exchange", 1), ("key_id", 1)], unique=True)
    
    # Enterprise API keys indexes
    await db.api_keys_enterprise.create_index("user_id")
    await db.api_keys_enterprise.create_index("key_hash", unique=True)
    await db.api_keys_enterprise.create_index("is_active")
    
    # API key usage indexes
    await db.api_key_usage.create_index("key_id")
    await db.api_key_usage.create_index("timestamp")
    
    print(f"✓ Connected to MongoDB: {settings.DB_NAME}")
    print(f"✓ Signal TTL set to {ttl_days} days")

async def close_db():
    global client
    if client:
        client.close()
        print("✓ Closed MongoDB connection")

def get_db():
    return db
