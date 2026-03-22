"""Why now? summaries - AI-powered explanations for themes with rule-based fallback"""
from typing import Dict
from datetime import datetime, timedelta
from backend.db import get_db
import os
import httpx

async def get_why_now_summary(theme_id: str, days: int = 14) -> Dict:
    """
    Generate a 1-2 sentence "why now?" summary for a theme.
    Uses AI-powered analysis with rule-based fallback.
    
    Args:
        theme_id: Theme ID to summarize
        days: Look back window (default 14-30 days)
    
    Returns:
        {
            "summary": str,
            "citations": [{"title": str, "url": str}]
        }
    """
    db = get_db()
    
    # Fetch recent signals for this theme
    since = datetime.utcnow() - timedelta(days=days)
    signals_cursor = db.signals.find({
        "theme_id": theme_id,
        "observed_at": {"$gte": since}
    }).sort("observed_at", -1).limit(10)
    
    signals = await signals_cursor.to_list(length=None)
    
    if not signals:
        return {"summary": "", "citations": []}
    
    # Get theme name for context
    from bson import ObjectId
    theme = await db.themes.find_one({"_id": ObjectId(theme_id)})
    theme_name = theme.get("name", "Unknown Theme") if theme else "Unknown Theme"
    
    # Build citations first (needed for both AI and fallback)
    citations = []
    
    for s in signals:
        # Add citation
        oa_citation = s.get("oa_citation", {})
        title = s.get("value_text", "") or oa_citation.get("source", "Signal")
        url = oa_citation.get("url", "")
        
        if url and len(citations) < 5:  # Max 5 citations
            citations.append({
                "title": title[:80],  # Truncate long titles
                "url": url
            })
    
    # Try AI-powered summary first
    from backend.config import settings
    supabase_url = settings.SUPABASE_URL
    use_ai = os.getenv("USE_AI_SUMMARIES", "1") == "1"
    
    if use_ai and supabase_url:
        try:
            # Prepare signal data for AI
            signal_data = [
                {
                    "signal_type": s.get("signal_type"),
                    "value_text": s.get("value_text", ""),
                    "observed_at": s.get("observed_at").isoformat() if s.get("observed_at") else None
                }
                for s in signals
            ]
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{supabase_url}/functions/v1/analyze-theme",
                    json={
                        "signals": signal_data,
                        "themeName": theme_name,
                        "days": days
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    ai_summary = data.get("summary", "")
                    
                    # Add citation markers to AI summary
                    citation_markers = "".join([f"[{i+1}]" for i in range(min(len(citations), 3))])
                    if citation_markers and ai_summary:
                        ai_summary += f" {citation_markers}"
                    
                    if ai_summary:
                        return {
                            "summary": ai_summary,
                            "citations": citations,
                            "ai_powered": True
                        }
        except Exception as e:
            print(f"⚠️ AI summary failed, falling back to rule-based: {str(e)}")
    
    # Fallback to rule-based summary
    type_counts = {}
    for s in signals:
        sig_type = s.get("signal_type", "unknown")
        type_counts[sig_type] = type_counts.get(sig_type, 0) + 1
    
    # Build summary text
    summary_parts = []
    
    if type_counts.get("policy_approval") or type_counts.get("policy_keyword"):
        policy_count = type_counts.get("policy_approval", 0) + type_counts.get("policy_keyword", 0)
        summary_parts.append(f"{policy_count} policy signal{'s' if policy_count > 1 else ''}")
    
    if type_counts.get("bigmoney_hold_new") or type_counts.get("bigmoney_hold_increase"):
        bigmoney_count = type_counts.get("bigmoney_hold_new", 0) + type_counts.get("bigmoney_hold_increase", 0)
        summary_parts.append(f"{bigmoney_count} institutional position{'s' if bigmoney_count > 1 else ''}")
    
    if type_counts.get("insider_buy"):
        insider_count = type_counts.get("insider_buy", 0)
        summary_parts.append(f"{insider_count} insider purchase{'s' if insider_count > 1 else ''}")
    
    if type_counts.get("flow_pressure") or type_counts.get("flow_pressure_etf"):
        flow_count = type_counts.get("flow_pressure", 0) + type_counts.get("flow_pressure_etf", 0)
        summary_parts.append(f"{flow_count} fund flow spike{'s' if flow_count > 1 else ''}")
    
    if not summary_parts:
        summary_parts.append(f"{len(signals)} signal{'s' if len(signals) > 1 else ''}")
    
    # Construct final summary
    if len(summary_parts) == 1:
        summary = f"{summary_parts[0]} in the last {days} days"
    elif len(summary_parts) == 2:
        summary = f"{summary_parts[0]} and {summary_parts[1]} in the last {days} days"
    else:
        summary = f"{', '.join(summary_parts[:-1])}, and {summary_parts[-1]} in the last {days} days"
    
    # Add citation markers
    citation_markers = "".join([f"[{i+1}]" for i in range(min(len(citations), 3))])
    if citation_markers:
        summary += f" {citation_markers}"
    
    return {
        "summary": summary,
        "citations": citations,
        "ai_powered": False
    }
