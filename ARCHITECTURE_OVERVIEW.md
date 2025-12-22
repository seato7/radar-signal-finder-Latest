# Opportunity Radar - Architecture Overview

## ⚠️ Data Integrity Policy

**As of December 2025, this project uses ONLY REAL data. No estimation, synthetic, or AI-generated data is used as a substitute for real market data.**

All ingestion functions follow a strict policy: Real data or nothing.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Lovable Cloud)                     │
│               React + Vite + TypeScript + Tailwind                │
│                                                                   │
│  Pages: Home, Radar, Themes, Alerts, Bots, Assistant, Settings   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTPS
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────────┐
        │  Railway Backend  │   │  Supabase Edge        │
        │  (Python/FastAPI) │   │  Functions (90+)      │
        │                   │   │                       │
        │  Responsibilities:│   │  Responsibilities:    │
        │  • TwelveData     │   │  • AI Features        │
        │    Price Ingest   │   │  • Data Ingestion     │
        │  • Bot Engine     │   │  • User-facing APIs   │
        │  • Broker Adapter │   │  • Payments/Stripe    │
        │  • Signal Storage │   │  • Alert Generation   │
        └───────────────────┘   └───────────────────────┘
                    │                       │
                    │                       │
        ┌───────────┴───────────┬───────────┴───────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────────┐
│    MongoDB    │   │     PostgreSQL    │   │   Upstash Redis   │
│   (Railway)   │   │    (Supabase)     │   │    (Caching)      │
│               │   │                   │   │                   │
│  • signals    │   │  • prices         │   │  • rate limits    │
│  • assets     │   │  • ingest_logs    │   │  • session cache  │
│  • themes     │   │  • function_status│   │  • API cache      │
│  • users      │   │  • holdings_13f   │   │                   │
│  • api_keys   │   │  • signals        │   │                   │
│  • bots       │   │  • all other data │   │                   │
└───────────────┘   └───────────────────┘   └───────────────────┘
```

---

## Data Flow: Complete Picture

### 1. Price Data Flow (Railway Backend)

```
TwelveData API
      │
      ▼ (55 credits/min budget)
┌─────────────────────────────────┐
│  Railway Python Backend         │
│  backend/services/price_scheduler.py │
│                                 │
│  Tiered Scheduling:             │
│  • Hot assets: every 5 min      │
│  • Active assets: every 30 min  │
│  • Standard: every 24 hours     │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  backend/services/supabase_sync.py │
│  Syncs prices to PostgreSQL     │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  Supabase PostgreSQL            │
│  Table: prices                  │
│  (ticker, date, close, checksum)│
└─────────────────────────────────┘
```

### 2. Signal Ingestion Flow (Edge Functions)

```
External Data Sources
      │
      ├─── SEC EDGAR (13F, Form 4)
      ├─── FINRA (Dark Pool)
      ├─── Reddit API
      ├─── StockTwits API
      ├─── RSS Feeds (Policy, News)
      ├─── FRED (Economic Data)
      ├─── Adzuna (Job Postings)
      ├─── Firecrawl (Web Scraping)
      │
      ▼
┌─────────────────────────────────┐
│  90+ Supabase Edge Functions    │
│                                 │
│  Scheduled via pg_cron:         │
│  • Every 5 min: breaking news   │
│  • Every 15 min: prices, flows  │
│  • Every hour: sentiment, tech  │
│  • Every 6 hrs: 13F, Form 4     │
│  • Daily: COT, patents, jobs    │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  Signal Generation Functions    │
│  generate-signals-from-*        │
│                                 │
│  Creates signals with:          │
│  • signal_type                  │
│  • direction (up/down/neutral)  │
│  • magnitude                    │
│  • citation                     │
│  • checksum (idempotency)       │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  PostgreSQL: signals table      │
│  + MongoDB: signals collection  │
└─────────────────────────────────┘
```

### 3. AI Features Flow

```
User Request
      │
      ▼
┌─────────────────────────────────┐
│  Frontend React Component       │
│  (AIAssistantChat.tsx)          │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  Edge Function: chat-assistant  │
│                                 │
│  1. Fetches current data:       │
│     • /api/radar (themes)       │
│     • /api/assets (scored)      │
│     • User watchlist            │
│                                 │
│  2. Builds context prompt       │
│                                 │
│  3. Calls Lovable AI Gateway    │
│     (google/gemini-2.5-flash)   │
│                                 │
│  4. Streams response to user    │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  Lovable AI Gateway             │
│  https://ai.gateway.lovable.dev │
│                                 │
│  Models:                        │
│  • google/gemini-2.5-flash      │
│  • google/gemini-2.5-pro        │
│  • openai/gpt-5                 │
└─────────────────────────────────┘
```

### 4. Trading Bot Flow

```
Scheduled Trigger (APScheduler)
      │
      ▼
┌─────────────────────────────────┐
│  Railway: bot_engine.py         │
│                                 │
│  1. Get active bots             │
│  2. For each bot:               │
│     a. Get user's broker keys   │
│     b. Decrypt credentials      │
│     c. Execute strategy         │
│     d. Place orders via broker  │
│     e. Log results              │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  Broker Adapters                │
│  • alpaca_broker.py             │
│  • ibkr_broker.py               │
│  • coinbase_broker.py           │
│  • binance_broker.py            │
│  • kraken_broker.py             │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│  External Broker APIs           │
│  Orders executed in user's      │
│  actual broker account          │
└─────────────────────────────────┘
```

---

## Database Schema Overview

### PostgreSQL (Supabase) - Primary

```sql
-- Core Tables
prices              -- 27,000+ assets, daily prices
assets              -- Asset metadata (ticker, name, exchange)
signals             -- All generated signals
themes              -- Investment themes
theme_scores        -- Computed theme scores

-- Ingestion Tracking
ingest_logs         -- ETL run history
function_status     -- Function execution status
circuit_breaker_status -- Failure tracking

-- User Data
user_roles          -- Role-based access
user_theme_subscriptions -- Theme following
watchlist           -- User watchlists
alerts              -- Generated alerts
bots                -- Bot configurations
bot_orders          -- Order history

-- Signal Sources
holdings_13f        -- Institutional holdings
dark_pool_activity  -- FINRA dark pool data
congressional_trades -- Political trades
options_flow        -- Options activity
short_interest      -- Short data
news_rss_articles   -- News sentiment
```

### MongoDB (Railway) - Signal Storage

```javascript
// Collections
signals             // Primary signal storage
assets              // Asset metadata cache
themes              // Theme definitions
users               // User accounts
api_keys            // Encrypted broker keys
bots                // Bot configurations
bot_logs            // Execution logs
bot_orders          // Order history
bot_positions       // Current positions
```

---

## Edge Functions Overview

### AI & Analysis
| Function | Purpose |
|----------|---------|
| `chat-assistant` | Natural language Q&A |
| `analyze-theme` | Theme "Why Now?" summaries |
| `explain-signal` | Signal explanations |
| `assess-risk` | Risk assessment |
| `discover-themes` | Theme discovery |
| `generate-digest` | Daily digest |
| `generate-pdf-report` | Report generation |

### Data Ingestion
| Function | Source | Schedule |
|----------|--------|----------|
| `ingest-breaking-news` | RSS Feeds | Every 5 min |
| `ingest-prices-twelvedata` | TwelveData | Every 15 min |
| `ingest-etf-flows` | ETF Data | Every 15 min |
| `ingest-finra-darkpool` | FINRA | Every hour |
| `ingest-reddit-sentiment` | Reddit API | Every 2 hrs |
| `ingest-stocktwits` | StockTwits | Every 2 hrs |
| `ingest-sec-13f-edgar` | SEC EDGAR | Every 6 hrs |
| `ingest-form4` | SEC EDGAR | Every 6 hrs |
| `ingest-congressional-trades` | Public Data | Daily |
| `ingest-cot-reports` | CFTC | Weekly |

### Signal Generation
| Function | Creates |
|----------|---------|
| `generate-signals-from-13f` | Institutional signals |
| `generate-signals-from-form4` | Insider signals |
| `generate-signals-from-darkpool` | Dark pool signals |
| `generate-signals-from-options` | Options signals |
| `generate-signals-from-policy` | Policy signals |
| `generate-signals-from-social` | Social sentiment |
| `compute-signal-scores` | Composite scores |
| `compute-theme-scores` | Theme scores |

### Monitoring & Health
| Function | Purpose |
|----------|---------|
| `ingestion-health` | Overall health check |
| `watchdog-ingestion-health` | Continuous monitoring |
| `daily-ingestion-digest` | Daily summary to Slack |
| `api-alerts-errors` | Error tracking |
| `kill-stuck-jobs` | Cleanup stuck processes |

---

## Cron Scheduling

### pg_cron Jobs (Supabase)

45+ scheduled jobs running at various intervals:
- **Every 5 min**: Breaking news, price updates
- **Every 15 min**: ETF flows, hot prices
- **Hourly**: Technicals, dark pool, pattern recognition
- **Every 2 hours**: Social sentiment (Reddit, StockTwits)
- **Every 6 hours**: SEC filings (13F, Form 4)
- **Daily**: Patents, job postings, COT reports, cleanup
- **Weekly**: Full data refresh, analytics

### Railway APScheduler

Price ingestion tiers:
- **Hot Tier**: Every 5 minutes (top 50 active assets)
- **Active Tier**: Every 30 minutes (500 watchlist assets)
- **Standard Tier**: Every 24 hours (remaining 26,000+ assets)

---

## Security Architecture

### Authentication
- Supabase Auth for user management
- JWT tokens with role-based access
- RLS policies on all user data tables

### API Key Protection
- Broker keys encrypted with Fernet (AES-128)
- Keys stored in MongoDB with `secret_enc` field
- Rotation support with audit logging

### Rate Limiting
- TwelveData: 55 credits/minute budget
- Firecrawl: Request throttling
- API endpoints: Per-user rate limits

---

## Monitoring & Alerting

### Health Endpoints
- `/api/health` - Railway backend status
- `ingestion-health` - Edge function status
- `health-metrics` - Detailed metrics

### Slack Integration
- Ingestion failures → #alerts channel
- Daily digest → #ingestion-summary
- Critical errors → Immediate notification

### Metrics Tracked
- Ingestion success rates
- Data freshness per source
- API response times
- Error counts by function

---

## Cost Structure

| Component | Service | Monthly Cost |
|-----------|---------|-------------|
| Price Data | TwelveData Pro | $29 |
| Backend Hosting | Railway | $5 |
| Frontend + DB | Lovable Cloud | $20 |
| Web Scraping | Firecrawl | $20 |
| Caching | Upstash Redis | $5 |
| **Total** | | **~$80-90** |

Free tier alternatives available for development.

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `backend/config.py` | Backend configuration |
| `supabase/config.toml` | Edge function settings |
| `.env` | Environment variables |
| `backend/.env` | Backend-specific vars |

---

## Summary

**Opportunity Radar uses a hybrid architecture:**

1. **Railway Python Backend** handles price ingestion (TwelveData) and trading bots
2. **Supabase Edge Functions** (90+) handle data ingestion, AI, and user APIs
3. **Dual Database**: PostgreSQL (primary) + MongoDB (signals/users)
4. **pg_cron** orchestrates 45+ scheduled ingestion jobs
5. **Lovable AI** powers all AI features via the gateway
6. **Firecrawl** enables web scraping for sources without APIs

This architecture provides:
- Scalability (Edge Functions auto-scale)
- Cost efficiency (~$80-90/month)
- Real-time data (5-minute refresh for hot assets)
- Comprehensive signal coverage (20+ data sources)
