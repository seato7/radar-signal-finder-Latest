"""Policy Feeds ETL - RSS/Atom feed ingestion with keyword filtering"""
import feedparser
import hashlib
import json
from datetime import datetime
from typing import List, Dict, Any
from urllib.parse import urlparse
import httpx
from backend.db import get_db
from backend.config import settings
from backend.models import Signal, Citation

async def fetch_feed(feed_url: str) -> feedparser.FeedParserDict:
    """Fetch RSS/Atom feed with proper headers"""
    headers = {
        "User-Agent": settings.SEC_USER_AGENT,
        "Accept-Language": settings.SEC_ACCEPT_LANGUAGE,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(feed_url, headers=headers, timeout=30.0)
        response.raise_for_status()
        
    # Parse feed
    return feedparser.parse(response.content)

def generate_entry_checksum(entry: Dict[str, Any]) -> str:
    """Generate deterministic checksum for feed entry"""
    # Use link|updated|title for uniqueness
    link = entry.get("link", "")
    updated = entry.get("updated", entry.get("published", ""))
    title = entry.get("title", "")
    
    data = f"{link}|{updated}|{title}"
    return hashlib.sha256(data.encode()).hexdigest()

def parse_entry_date(entry: Dict[str, Any]) -> datetime:
    """Parse entry date from updated or published fields"""
    # Try updated_parsed first, then published_parsed
    date_tuple = entry.get("updated_parsed") or entry.get("published_parsed")
    
    if date_tuple:
        # Convert time.struct_time to datetime
        from time import mktime
        timestamp = mktime(date_tuple)
        return datetime.utcfromtimestamp(timestamp)
    
    # Fallback to now
    return datetime.utcnow()

def matches_keywords(text: str, keywords: List[str]) -> bool:
    """Check if text matches any policy keywords"""
    text_lower = text.lower()
    return any(keyword.lower() in text_lower for keyword in keywords)

async def run_policy_feeds_etl() -> Dict[str, int]:
    """
    Run policy feeds ETL pipeline.
    
    Returns:
        Dict with inserted and skipped counts
    """
    db = get_db()
    
    # Parse configuration
    feed_urls = [url.strip() for url in settings.POLICY_FEEDS.split(",") if url.strip()]
    keywords = [kw.strip() for kw in settings.POLICY_KEYWORDS.split(",") if kw.strip()]
    
    if not feed_urls:
        return {"inserted": 0, "skipped": 0, "error": "No POLICY_FEEDS configured"}
    
    if not keywords:
        return {"inserted": 0, "skipped": 0, "error": "No POLICY_KEYWORDS configured"}
    
    inserted = 0
    skipped = 0
    
    for feed_url in feed_urls:
        try:
            feed = await fetch_feed(feed_url)
            source_domain = urlparse(feed_url).netloc
            feed_title = feed.feed.get("title", source_domain)
            
            for entry in feed.entries:
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                link = entry.get("link", "")
                
                # Check if entry matches keywords
                combined_text = f"{title} {summary}"
                if not matches_keywords(combined_text, keywords):
                    skipped += 1
                    continue
                
                # Generate checksum
                checksum = generate_entry_checksum(entry)
                
                # Check if already exists
                existing = await db.signals.find_one({"checksum": checksum})
                if existing:
                    skipped += 1
                    continue
                
                # Parse date
                observed_at = parse_entry_date(entry)
                
                # Create signal
                signal_doc = {
                    "signal_type": "policy_approval",
                    "theme_id": None,  # Will be mapped by theme_mapper
                    "value_text": title,
                    "direction": "up",
                    "magnitude": 1.0,
                    "observed_at": observed_at,
                    "created_at": datetime.utcnow(),
                    "raw": {
                        "summary": summary,
                        "source_domain": source_domain,
                        "feed_title": feed_title,
                    },
                    "oa_citation": {
                        "source": feed_title,
                        "url": link,
                        "timestamp": observed_at.isoformat()
                    },
                    "source_id": feed_url,
                    "checksum": checksum
                }
                
                try:
                    result = await db.signals.insert_one(signal_doc)
                    inserted += 1
                except Exception as e:
                    # Duplicate key error - already exists
                    skipped += 1
                    
        except Exception as e:
            print(f"Error fetching feed {feed_url}: {str(e)}")
            continue
    
    return {"inserted": inserted, "skipped": skipped}
