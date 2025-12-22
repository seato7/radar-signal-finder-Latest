# Deployment Guide

## Architecture Overview

Opportunity Radar uses a **hybrid architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Vite)                        │
│                   Deployed via Lovable                          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   RAILWAY BACKEND       │     │   SUPABASE CLOUD        │
│   (Python/FastAPI)      │     │   (Edge Functions)      │
│                         │     │                         │
│   • TwelveData Prices   │     │   • 90+ Ingestion Fns   │
│   • Price Scheduler     │     │   • AI Features         │
│   • MongoDB (signals)   │     │   • User APIs           │
│   • SEC ETL             │     │   • Payments            │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
              ┌─────────────────────────────────┐
              │   SUPABASE POSTGRESQL           │
              │   (Primary Database)            │
              │                                 │
              │   • Prices, Signals, Themes     │
              │   • Users, Alerts, Watchlists   │
              │   • Ingest Logs, Bot Data       │
              └─────────────────────────────────┘
```

---

## 1. Frontend Deployment (Lovable)

The frontend is automatically deployed via Lovable.

### Steps
1. Make changes in Lovable editor
2. Click "Publish" button
3. Frontend deploys to `*.lovable.app` domain

### Custom Domain
1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS as instructed

---

## 2. Railway Backend Deployment

### Prerequisites
- Railway account
- Docker support
- Environment variables configured

### Dockerfile
```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables (Railway)

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGO_URL` | MongoDB connection string | ✅ |
| `JWT_SECRET_KEY` | JWT signing key | ✅ |
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | ✅ |
| `TWELVEDATA_API_KEY` | TwelveData API key | ✅ |
| `BROKER_ENCRYPTION_KEY` | Key for encrypting broker credentials | ✅ |
| `SLACK_WEBHOOK` | Slack alerts URL | ❌ |
| `ALPACA_API_KEY` | Alpaca trading API key | ❌ |
| `ALPACA_SECRET_KEY` | Alpaca secret key | ❌ |

### Deployment Steps
```bash
# 1. Login to Railway
railway login

# 2. Link project
railway link

# 3. Deploy
railway up

# 4. View logs
railway logs
```

---

## 3. Supabase Configuration

### Edge Functions
Edge functions deploy automatically when you push code via Lovable.

### Environment Secrets (Supabase)

Set these in Cloud settings:

| Secret | Description |
|--------|-------------|
| `LOVABLE_API_KEY` | Lovable AI API key |
| `FIRECRAWL_API_KEY` | Firecrawl web scraping |
| `TWELVEDATA_API_KEY` | TwelveData market data |
| `FRED_API_KEY` | FRED economic data |
| `SLACK_WEBHOOK_URL` | Slack notifications |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `REDDIT_CLIENT_ID` | Reddit API |
| `REDDIT_CLIENT_SECRET` | Reddit API |
| `BROKER_ENCRYPTION_KEY` | Broker key encryption |

### Database Migrations
Migrations run automatically via Lovable's migration tool.

---

## 4. Cron Jobs Setup

### pg_cron (Supabase)

Enable extensions:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

Schedule jobs:
```sql
-- Hourly ingestion
SELECT cron.schedule(
  'ingest-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"frequency":"hourly"}'::jsonb
  );
  $$
);

-- Health monitoring (every 15 min)
SELECT cron.schedule(
  'health-check',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/watchdog-ingestion-health',
    headers:='{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Railway APScheduler (TwelveData)

The Python backend runs APScheduler for price ingestion:
- **Hot Tier** (100 assets): Every 5 minutes
- **Active Tier** (500 assets): Every 30 minutes  
- **Standard Tier** (26,400 assets): Daily

Scheduler starts automatically with the backend.

---

## 5. Monitoring & Health Checks

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| Railway `/api/health` | Backend health |
| Supabase `/functions/v1/health-metrics` | Edge function health |
| Supabase `/functions/v1/api-data-staleness` | Data freshness |
| Supabase `/functions/v1/api-alerts-errors` | Error alerts |

### Slack Alerts

Configure `SLACK_WEBHOOK_URL` to receive alerts for:
- Ingestion failures
- Stale data
- High error rates
- System health issues

---

## 6. Cost Breakdown

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Railway | Starter | ~$5 |
| Supabase | Pro | ~$25 |
| TwelveData | Grow | ~$30 |
| Firecrawl | Starter | ~$20 |
| MongoDB Atlas | M0 | Free |
| **Total** | | **~$80-85/month** |

---

## 7. Rollback Procedure

### Frontend
Use Lovable's History feature to restore previous versions.

### Backend (Railway)
```bash
# List deployments
railway deployments

# Rollback to previous
railway rollback
```

### Database
Supabase maintains point-in-time recovery. Contact support for restoration.

---

## 8. Troubleshooting

### Backend Not Starting
1. Check Railway logs: `railway logs`
2. Verify environment variables
3. Check MongoDB connectivity

### Edge Functions Failing
1. Check function logs in Lovable Cloud
2. Verify secrets are set
3. Check API rate limits

### Data Not Updating
1. Verify cron jobs: `SELECT * FROM cron.job;`
2. Check scheduler status: `GET /api/health/scheduler`
3. Review ingest logs: `/functions/v1/api-ingest-logs`
