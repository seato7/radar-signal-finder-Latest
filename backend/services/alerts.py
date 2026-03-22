"""Alert service - firing alerts and momentum fade detection"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import httpx
from backend.db import get_db
from backend.config import settings
from backend.scoring import compute_theme_score

async def calculate_rolling_max(theme_id: str, days: int = 7) -> float:
    """Calculate rolling max score for a theme over the last N days"""
    db = get_db()
    
    since = datetime.utcnow() - timedelta(days=days)
    
    # Get all signals for this theme in the window
    signals_cursor = db.signals.find({
        "theme_id": theme_id,
        "observed_at": {"$gte": since}
    })
    signals_raw = await signals_cursor.to_list(length=None)
    
    if not signals_raw:
        return 0.0
    
    # Convert to Signal objects and compute score
    from backend.models import Signal, Citation
    signals = []
    for s in signals_raw:
        signals.append(Signal(
            id=str(s["_id"]),
            signal_type=s["signal_type"],
            observed_at=s["observed_at"],
            magnitude=s.get("magnitude", 1.0),
            oa_citation=Citation(**s["oa_citation"]),
            checksum=s["checksum"]
        ))
    
    score, _, _ = compute_theme_score(signals)
    return score

async def check_momentum_fade(theme_id: str, current_score: float) -> bool:
    """
    Check if theme has momentum fade.
    Returns True if current_score < 0.5 * rolling_7d_max
    """
    rolling_max = await calculate_rolling_max(theme_id, days=7)
    
    if rolling_max == 0:
        return False
    
    return current_score < (0.5 * rolling_max)

async def send_slack_alert(theme: Dict, score: float, positives: List[str], components: Dict[str, float], why_now: Optional[str] = None, dont_miss: Optional[Dict] = None) -> bool:
    """
    Send enhanced alert to Slack webhook with component breakdown and buttons.
    Returns True if successful, False otherwise.
    """
    if not settings.SLACK_WEBHOOK:
        return False
    
    # Build rich message with blocks
    theme_url = f"{settings.FRONTEND_PUBLIC_URL}/themes?id={theme['id']}&utm_source=slack&utm_medium=alert"
    
    # Top 3 components
    top_components = sorted(components.items(), key=lambda x: x[1], reverse=True)[:3]
    components_text = "\n".join([f"• {name}: {value:.1f}" for name, value in top_components])
    
    # Main text
    text_lines = [
        "⚡ *Opportunity Radar Alert*",
        "",
        f"Theme: *{theme['name'][:50]}*",  # Truncate long titles
        f"Score: *{score:.2f}*",
        f"Positive Components: {', '.join(positives)}",
        "",
        "*Top Contributors:*",
        components_text
    ]
    
    # Add "why now?" summary if available
    if why_now:
        text_lines.append(f"\n_{why_now}_")
    
    message_text = "\n".join(text_lines)
    
    # Build attachments with action buttons
    attachments = [
        {
            "fallback": f"Open {theme['name']} in Opportunity Radar",
            "actions": [
                {
                    "type": "button",
                    "text": "Open Theme",
                    "url": theme_url
                }
            ]
        }
    ]
    
    # Add "Open Asset" button if dont_miss present
    if dont_miss:
        asset_url = f"{settings.FRONTEND_PUBLIC_URL}/asset?id={dont_miss.get('asset_id')}&utm_source=slack&utm_medium=alert"
        attachments[0]["actions"].append({
            "type": "button",
            "text": f"Open Asset: {dont_miss.get('ticker', 'Asset')[:10]}",
            "url": asset_url
        })
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                settings.SLACK_WEBHOOK,
                json={
                    "text": message_text,
                    "attachments": attachments
                },
                timeout=10.0
            )
            response.raise_for_status()
        return True
    except Exception as e:
        print(f"Slack webhook error: {str(e)}")
        return False

async def check_and_fire_alerts():
    """
    Check all themes and fire alerts if thresholds met.
    Rule: score >= ALERT_SCORE_THRESHOLD AND positives >= 3
    """
    db = get_db()
    
    # Get all themes
    themes_cursor = db.themes.find({})
    themes = await themes_cursor.to_list(length=None)
    
    alerts_fired = []
    
    for theme in themes:
        theme_id = str(theme["_id"])
        
        # Get signals (last 30 days)
        since = datetime.utcnow() - timedelta(days=30)
        signals_cursor = db.signals.find({
            "theme_id": theme_id,
            "observed_at": {"$gte": since}
        })
        signals_raw = await signals_cursor.to_list(length=None)
        
        if not signals_raw:
            continue
        
        # Convert to Signal objects
        from backend.models import Signal, Citation
        signals = []
        for s in signals_raw:
            signals.append(Signal(
                id=str(s["_id"]),
                signal_type=s["signal_type"],
                observed_at=s["observed_at"],
                magnitude=s.get("magnitude", 1.0),
                oa_citation=Citation(**s["oa_citation"]),
                checksum=s["checksum"]
            ))
        
        score, components, positives = compute_theme_score(signals)
        
        # Check alert conditions
        if score >= settings.ALERT_SCORE_THRESHOLD and len(positives) >= 3:
            # Check if alert already exists for this theme (today)
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            existing = await db.alerts.find_one({
                "theme_id": theme_id,
                "created_at": {"$gte": today_start}
            })
            
            if not existing:
                # Create alert
                alert_doc = {
                    "theme_id": theme_id,
                    "theme": theme["name"],
                    "score": score,
                    "positives": positives,
                    "dont_miss": None,  # TODO: determine top asset
                    "status": "active",
                    "created_at": datetime.utcnow()
                }
                
                result = await db.alerts.insert_one(alert_doc)
                
                # Get "why now?" summary if available
                from backend.services.summarize import get_why_now_summary
                why_now_data = await get_why_now_summary(theme_id, days=14)
                why_now_summary = why_now_data.get("summary", "")
                
                # Try to send Slack alert
                slack_success = await send_slack_alert(
                    {"id": theme_id, "name": theme["name"]},
                    score,
                    positives,
                    components,
                    why_now=why_now_summary
                )
                
                if not slack_success and settings.SLACK_WEBHOOK:
                    # Update status if Slack failed
                    await db.alerts.update_one(
                        {"_id": result.inserted_id},
                        {"$set": {"status": "fired_slack_error"}}
                    )
                
                alerts_fired.append(theme["name"])
        
        # Check for momentum fade
        fade_detected = await check_momentum_fade(theme_id, score)
        if fade_detected:
            # Create advisory signal (no Slack)
            checksum = f"momentum_fade_{theme_id}_{datetime.utcnow().date().isoformat()}"
            
            advisory_doc = {
                "signal_type": "momentum_fade",
                "theme_id": theme_id,
                "value_text": f"Momentum fade detected for {theme['name']}",
                "direction": "down",
                "magnitude": 0.5,
                "observed_at": datetime.utcnow(),
                "created_at": datetime.utcnow(),
                "raw": {"score": score, "rolling_7d_max": await calculate_rolling_max(theme_id, 7)},
                "oa_citation": {
                    "source": "Opportunity Radar Advisory",
                    "url": f"{settings.FRONTEND_PUBLIC_URL}/themes?id={theme_id}",
                    "timestamp": datetime.utcnow().isoformat()
                },
                "source_id": "internal_advisory",
                "checksum": checksum
            }
            
            try:
                await db.signals.insert_one(advisory_doc)
            except Exception:
                pass  # Already exists
    
    return {"alerts_fired": len(alerts_fired), "themes": alerts_fired}
