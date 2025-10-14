# Changelog: Polish & Production Features

## Summary
Implemented 8 production-ready features: "why now?" summaries, semantic theme mapping, enhanced Slack alerts, diagnostics endpoints, frontend UX improvements, data hygiene, and deployment documentation.

---

## 1. "Why Now?" Summaries (Rule-Based, Attributed)

**Files Added:**
- `backend/services/summarize.py` - Rule-based summary generation
- `backend/routers/themes.py` - Theme API endpoints
- `backend/tests/test_summarize.py` - Summary tests

**Files Modified:**
- `backend/services/alerts.py` - Integrated summaries into Slack alerts
- `backend/main.py` - Added themes router
- `src/pages/Themes.tsx` - "Why now?" panel with Info icon

**Features:**
- Counts signals by type (policy, 13F, insiders, flows)
- Generates 1-2 sentence summaries with citations [1][2]
- API: `GET /api/themes/{id}/why_now`
- Appears in Slack alerts and Theme cards

---

## 2. Theme Mapper v2 (Semantic Fallback)

**Files Modified:**
- `backend/services/theme_mapper.py` - Added TF-IDF cosine similarity
- `backend/routers/themes.py` - Added `GET /api/themes/mapper/config`
- `backend/tests/test_theme_mapper.py` - Semantic fallback tests

**Features:**
- Optional semantic matching via `SEMANTIC_MAPPER=1`
- TF-IDF fallback when keywords don't match (threshold: 0.35)
- Records mapper route in `signal.raw.mapper` ("keyword" or "semantic")
- Default: OFF for explainability

---

## 3. Slack Alert Polish

**Files Modified:**
- `backend/services/alerts.py` - Enhanced payload with components, buttons, UTM params

**Features:**
- Top 3 component contributions inline
- Action buttons: "Open Theme" and "Open Asset"
- Includes "why now?" summary if available
- Truncates long titles, adds UTM tracking
- Better error handling (fired_slack_error status)

---

## 4. Diagnostics Endpoints

**Files Modified:**
- `backend/routers/ingest.py` - Added `/diagnose/policy` and `/diagnose/form4`

**Features:**
- `GET /api/ingest/diagnose/policy` - Policy feed parsing stats
- `GET /api/ingest/diagnose/form4` - Form 4 insider transaction stats
- `GET /api/ingest/diagnose/13f` - Existing 13F CUSIP mapping stats
- Consistent payload: `{counts: {...}, samples: [...]}`

---

## 5. Frontend UX Improvements

**Files Modified:**
- `src/pages/Alerts.tsx` - Threshold tuner card with live save
- `src/pages/Backtest.tsx` - CSV/Parquet download buttons
- `src/pages/Radar.tsx` - Component badges (top 3) under each opportunity
- `src/pages/Themes.tsx` - "Why now?" panel with fetched summaries

**Features:**
- Alerts: Adjust score threshold and min positives, save with toast
- Backtest: One-click export to CSV or Parquet
- Radar: Show top contributing components per opportunity
- Themes: Display "why now?" explanations with citations

---

## 6. Data Hygiene (TTL + Indexes)

**Files Modified:**
- `backend/db.py` - Added TTL index on signals, additional indexes
- `backend/routers/healthz.py` - New healthz router
- `backend/config.py` - Added `TTL_DAYS` setting (default 365)
- `backend/tests/test_indexes.py` - Index verification tests
- `backend/main.py` - Registered healthz router

**Features:**
- Signals auto-expire after `TTL_DAYS` (default 1 year)
- New indexes: `signals.theme_id`, `alerts.theme_id`
- `GET /api/healthz/indexes` - List all indexes with TTL info
- No TTL on assets, themes, prices (permanent data)

---

## 7. Export & Deployment Docs

**Files Added:**
- `EXPORT.md` - Local development guide (Download ZIP, GitHub, troubleshooting)
- `DEPLOYMENT.md` - Production deployment (Nginx/Caddy, cron, K8s, security, monitoring)

**Features:**
- Step-by-step export instructions
- Docker Compose production config
- Reverse proxy examples (Nginx, Caddy)
- Automated ETL scheduling (cron, K8s CronJob, Cloud Scheduler)
- Security checklist, backup/recovery, scaling tips
- 10-minute production deploy checklist

---

## 8. Demo Seed Refinements

**Files Modified:**
- `backend/etl/demo.py` - Balanced signal distribution

**Features:**
- Each theme gets 2-3 policy signals, 1-2 13F/insiders/flows, 2 social
- Spread across 0-45 days with recent bias (50% last 10 days)
- Varied magnitudes showing decay (older = lower magnitude)
- More realistic demo data for testing

---

## Environment Variables Added

```bash
TTL_DAYS=365               # Signal retention period
SEMANTIC_MAPPER=0          # Enable semantic theme mapping
SEMANTIC_THRESHOLD=0.35    # Similarity threshold for semantic matching
```

---

## API Endpoints Added

- `GET /api/themes/{id}/why_now` - Get summary for theme
- `GET /api/themes/mapper/config` - Theme mapper configuration
- `GET /api/healthz/indexes` - List database indexes
- `GET /api/ingest/diagnose/policy` - Policy feed diagnostics
- `GET /api/ingest/diagnose/form4` - Form 4 diagnostics

---

## Testing

All features include tests:
- `test_summarize.py` - Summary generation with/without signals
- `test_theme_mapper.py` - Semantic fallback and TF-IDF
- `test_indexes.py` - Index creation and TTL verification

Run: `pytest backend/tests/`

---

## Next Steps

1. Deploy using DEPLOYMENT.md guide
2. Configure real data sources in production `.env`
3. Set up automated ingestion (hourly cron)
4. Monitor via `/api/healthz/indexes` and diagnostics endpoints
5. Tune `ALERT_SCORE_THRESHOLD` based on production data
