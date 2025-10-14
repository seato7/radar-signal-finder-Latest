"""Seed the 3 canonical themes for Opportunity Radar"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

CANONICAL_THEMES = [
    {
        "_id": "theme-ai-liquid-cooling",
        "name": "AI Liquid Cooling",
        "keywords": ["liquid cooling", "data center", "datacenter", "thermal"],
        "alpha": 1.0,
        "contributors": []
    },
    {
        "_id": "theme-water-reuse",
        "name": "Water Reuse",
        "keywords": ["desal", "reverse osmosis", "water reuse", "pipeline"],
        "alpha": 1.0,
        "contributors": []
    },
    {
        "_id": "theme-hvdc-transformers",
        "name": "HVDC Transformers",
        "keywords": ["hvdc", "transformer", "transmission", "interconnector", "grid"],
        "alpha": 1.0,
        "contributors": []
    }
]

async def seed_themes():
    """Seed canonical themes into MongoDB"""
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DB_NAME]
    
    for theme in CANONICAL_THEMES:
        await db.themes.update_one(
            {"_id": theme["_id"]},
            {"$set": theme},
            upsert=True
        )
        print(f"✓ Seeded theme: {theme['name']} ({theme['_id']})")
    
    client.close()
    print(f"\n✓ Seeded {len(CANONICAL_THEMES)} themes successfully")

if __name__ == "__main__":
    asyncio.run(seed_themes())
