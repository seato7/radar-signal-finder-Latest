# Opportunity Radar - Quick Start Guide

## 🎯 What This Does

Opportunity Radar is a financial intelligence platform that:
- Scores market opportunities using 8 weighted signal components
- Aggregates 20+ data sources (SEC, dark pool, social, options)
- Applies exponential decay to prioritize recent signals (30-day half-life)
- Provides AI-powered analysis via Lovable AI (Gemini 2.5 Flash)
- Supports automated trading via multi-broker integration

---

## 🏗️ Architecture Overview

```
Frontend (Lovable Cloud)
    ↓
┌───────────────────┬───────────────────┐
│ Railway Backend   │ Supabase Edge     │
│ (Python/FastAPI)  │ Functions (90+)   │
│                   │                   │
│ • TwelveData      │ • AI Features     │
│ • Bot Engine      │ • Data Ingestion  │
│ • Broker APIs     │ • User APIs       │
└───────────────────┴───────────────────┘
    ↓                       ↓
┌───────────────────┬───────────────────┐
│ MongoDB (Railway) │ PostgreSQL        │
│ • signals         │ (Supabase)        │
│ • users           │ • prices          │
│ • bots            │ • ingest_logs     │
└───────────────────┴───────────────────┘
```

---

## 🚀 Deployment Options

### Option 1: Lovable Cloud (Recommended)

Everything deploys automatically:

1. **Frontend**: Auto-deployed to `your-project.lovable.app`
2. **Edge Functions**: Auto-deployed on code changes
3. **Database**: Supabase PostgreSQL included

**Required Secrets** (add via Lovable Cloud settings):
- `TWELVEDATA_API_KEY` - Price data (get at twelvedata.com)
- `FIRECRAWL_API_KEY` - Web scraping (get at firecrawl.dev)

**Optional Secrets**:
- `SLACK_WEBHOOK_URL` - Alert notifications
- `STRIPE_SECRET_KEY` - Subscription payments
- `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` - Social sentiment
- `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` - Job postings

### Option 2: Railway Backend (For Price Ingestion + Bots)

If you need the Python backend for TwelveData price ingestion or trading bots:

```bash
# Clone repository
git clone https://github.com/your-org/opportunity-radar.git
cd opportunity-radar/backend

# Deploy to Railway
railway login
railway init
railway up
```

**Railway Environment Variables**:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
MONGO_URL=mongodb+srv://...
TWELVEDATA_API_KEY=your-key
```

---

## 📊 Verify Deployment

### Check Health Endpoints

```bash
# Railway backend health
curl https://your-railway-app.up.railway.app/api/health
# Expected: {"status":"ok","service":"opportunity-radar"}

# Edge function health
curl https://your-project.supabase.co/functions/v1/ingestion-health
```

### Check Scoring Weights

```bash
curl https://your-railway-app.up.railway.app/api/healthz/weights
```

**Expected Weights:**
```json
{
  "PolicyMomentum": 1.0,
  "FlowPressure": 1.0,
  "BigMoneyConfirm": 1.0,
  "InsiderPoliticianConfirm": 0.8,
  "Attention": 0.5,
  "TechEdge": 0.4,
  "RiskFlags": -1.0,
  "CapexMomentum": 0.6
}
```

---

## 🌱 Seed Initial Data

### Seed Canonical Themes

```bash
# Via Railway
railway run python backend/scripts/seed_themes.py
```

Seeds 3 default themes:
- **AI Liquid Cooling** - Data center thermal management
- **Water Reuse** - Desalination, reverse osmosis
- **HVDC Transformers** - Grid infrastructure

### Trigger Initial Ingestion

Via Edge Functions (automatic with pg_cron), or manually:

```bash
# Trigger price ingestion
curl -X POST https://your-project.supabase.co/functions/v1/ingest-prices-twelvedata

# Trigger signal generation
curl -X POST https://your-project.supabase.co/functions/v1/compute-signal-scores
```

---

## 📱 Access Points

| Service | URL |
|---------|-----|
| Frontend | `https://your-project.lovable.app` |
| Railway API | `https://your-app.up.railway.app` |
| Edge Functions | `https://your-project.supabase.co/functions/v1/` |

---

## 🎨 Frontend Navigation

1. **Home** - System status, run ingestion
2. **Radar** - Scored themes with signal counts
3. **Themes** - Theme details, AI summaries
4. **Alerts** - Configured alert rules
5. **Bots** - Trading bot management
6. **Assistant** - AI chat interface
7. **Settings** - Broker connections, preferences

---

## 🧪 Testing

### Backend Tests

```bash
cd backend
pip install -r requirements.txt
pytest

# Expected: All tests passing
```

### Test Coverage
- ✅ Health endpoints
- ✅ Scoring decay function
- ✅ ETL idempotency
- ✅ Watchlist CRUD
- ✅ Alert thresholds

---

## 🐛 Troubleshooting

### Frontend won't load
1. Check browser console for errors
2. Verify Supabase environment variables set

### No themes showing
1. Run seed script first
2. Check MongoDB connection

### Prices not updating
1. Verify `TWELVEDATA_API_KEY` is set
2. Check Railway logs for errors
3. Confirm credit budget not exhausted

### Edge functions failing
1. Check Supabase function logs
2. Verify secrets are configured
3. Check for rate limit errors (429)

---

## 🔧 Key Commands

### Makefile (Local Development)

```bash
make up          # Start Docker services
make down        # Stop services
make seed        # Seed themes
make test        # Run backend tests
make be          # View backend logs
make fe          # View frontend logs
make clean       # Remove all data
```

### Railway

```bash
railway logs     # View logs
railway run      # Execute command
railway up       # Deploy changes
```

---

## 📚 Next Steps

1. **Configure Data Sources** - Add API keys for more sources
2. **Set Up Alerts** - Configure Slack webhook
3. **Connect Broker** - Add trading credentials
4. **Create Bots** - Set up automated trading
5. **Explore AI** - Try the assistant at `/assistant`

---

## 🎉 You're Ready!

The system is now running with:
- ✅ Hybrid Railway + Supabase architecture
- ✅ 27,000+ assets via TwelveData
- ✅ 90+ Edge Functions for data ingestion
- ✅ AI features via Lovable AI
- ✅ pg_cron scheduling (45 jobs)
- ✅ Multi-broker trading support

Access the UI and start exploring opportunities! 🚀
