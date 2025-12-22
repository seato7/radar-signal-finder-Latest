# Data Pipeline Documentation

## Overview

Opportunity Radar ingests data from multiple sources using a hybrid pipeline:

1. **Railway Python Backend** → TwelveData prices (27,000+ assets)
2. **Supabase Edge Functions** → 90+ ingestion functions (RSS, APIs, web scraping)
3. **pg_cron** → Scheduled job orchestration

All data flows into **Supabase PostgreSQL** as the single source of truth.

---

## ⚠️ CRITICAL: NO ESTIMATION POLICY

**As of December 2025, all ingestion functions follow a strict NO ESTIMATION policy:**

- If real data is available → Insert it
- If real data is NOT available → Insert NOTHING (return 0 records)
- NO synthetic data, NO estimation, NO AI fallbacks for market data

All functions log `version: 'v3_no_estimation'` to confirm compliance.

---

## Data Sources

### Price Data (TwelveData via Railway) ✅ REAL

| Tier | Assets | Refresh | Daily Credits |
|------|--------|---------|---------------|
| Hot | 100 | 5 min | 28,800 |
| Active | 500 | 30 min | 24,000 |
| Standard | 26,400 | 24 hr | 26,400 |
| **Total** | 27,000 | | 79,200 |

**Hot Tier Assets**: Major indices (SPY, QQQ), top 40 stocks (AAPL, NVDA, TSLA), top 25 crypto (BTC, ETH, SOL), forex majors (EUR/USD), key commodities (XAU/USD).

**Data Fields**: `open`, `high`, `low`, `close`, `volume`, `change_pct`, `updated_at`

---

### Edge Function Data Sources (90+ Functions)

#### ✅ Real Data Sources (Working)
| Function | Source | Frequency | Data | Status |
|----------|--------|-----------|------|--------|
| `ingest-sec-13f-edgar` | SEC EDGAR API | Weekly | 13F holdings | ✅ REAL |
| `ingest-form4` | SEC EDGAR | Weekly | Insider trades | ✅ REAL |
| `ingest-news-rss` | RSS feeds | Hourly | Headlines | ✅ REAL |
| `ingest-short-interest` | FINRA CDN | Daily | Short data | ✅ REAL |
| `ingest-congressional-trades` | House Stock Watcher | Daily | Congress trades | ✅ REAL |
| `ingest-fred-economics` | FRED API | Weekly | Economic indicators | ✅ REAL |
| `ingest-stocktwits` | StockTwits API | 2 hours | Social mentions | ✅ REAL |
| `ingest-supply-chain` | ISM RSS | Daily | Supply chain data | ✅ REAL |

#### 🔄 Real Data or Nothing (No Fallback)
| Function | Source | Frequency | Behavior |
|----------|--------|-----------|----------|
| `ingest-reddit-sentiment` | Reddit OAuth | 2 hours | Real data only, no fallback |
| `ingest-forex-sentiment` | Myfxbook/OANDA | Daily | Real data only, no fallback |
| `ingest-etf-flows` | ETF.com | Daily | Real data only, no fallback |
| `ingest-crypto-onchain` | Blockchain.com/CoinGecko | Daily | Real data only, no fallback |
| `ingest-options-flow` | Barchart/CBOE | Daily | Real data only, no fallback |
| `ingest-dark-pool` | FINRA CDN | Daily | Real data only, no fallback |
| `ingest-finra-darkpool` | FINRA scraping | Daily | Real data only, no fallback |
| `ingest-cot-reports` | CFTC Socrata | Weekly | Real data only, no fallback |
| `ingest-job-postings` | Adzuna API | Daily | Real data only, no fallback |
| `ingest-patents` | USPTO/Firecrawl | Weekly | Real data only, no fallback |

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA SOURCES                             │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│ TwelveData  │ SEC EDGAR   │ Firecrawl   │ Free APIs         │
│ (Prices)    │ (13F/Form4) │ (Web Scrape)│ (RSS/Reddit/etc)  │
└──────┬──────┴──────┬──────┴──────┬──────┴─────────┬─────────┘
       │             │             │               │
       ▼             ▼             ▼               ▼
┌─────────────┐ ┌─────────────────────────────────────────────┐
│ Railway     │ │           Supabase Edge Functions           │
│ Python      │ │                                             │
│ Scheduler   │ │  ingest-*  (90+ functions)                  │
│             │ │  ⚠️ NO ESTIMATION - Real data or nothing    │
│ APScheduler │ │  generate-signals-from-*                    │
└──────┬──────┘ └──────────────────────┬──────────────────────┘
       │                               │
       │     ┌─────────────────────────┘
       │     │
       ▼     ▼
┌─────────────────────────────────────────────────────────────┐
│                  SUPABASE POSTGRESQL                         │
├─────────────────────────────────────────────────────────────┤
│  prices          │ Real-time & historical prices            │
│  signals         │ Multi-source investment signals          │
│  themes          │ Investment themes                        │
│  theme_scores    │ Computed theme scores                    │
│  assets          │ Asset master data                        │
│  ingest_logs     │ ETL execution logs                       │
│  function_status │ Function health tracking                 │
└─────────────────────────────────────────────────────────────┘
```

---

## No-Data Response Format

All ingestion functions return this format when no real data is available:

```json
{
  "success": true,
  "inserted": 0,
  "message": "No real data found - no fake data inserted",
  "version": "v3_no_estimation"
}
```

**Important**: A `success: true` with `inserted: 0` is CORRECT behavior when external APIs are down or return no data. The function did its job - it just didn't have real data to insert.

---

## Cron Schedules

### pg_cron Jobs (45+ scheduled jobs)

```sql
-- Every 15 minutes: Health monitoring
*/15 * * * * → watchdog-ingestion-health, health-metrics

-- Hourly: High-frequency data
0 * * * * → ingest-news-rss, ingest-breaking-news

-- Every 2 hours: Social sentiment
0 */2 * * * → ingest-reddit-sentiment, ingest-stocktwits

-- Every 3 hours: News aggregation
0 */3 * * * → ingest-news-sentiment

-- Every 4 hours: Theme scoring
0 */4 * * * → compute-theme-scores, generate-alerts

-- Every 6 hours: Technical analysis
0 */6 * * * → ingest-advanced-technicals, ingest-pattern-recognition, ingest-smart-money

-- Daily: Market data
0 18 * * * → ingest-dark-pool, ingest-options-flow, ingest-short-interest
0 6 * * * → ingest-job-postings, ingest-economic-calendar, ingest-etf-flows

-- Weekly: Institutional filings
0 9 * * 6 → ingest-sec-13f-edgar, ingest-form4, ingest-cot-cftc, ingest-fred-economics

-- Sunday: AI research
0 10 * * 0 → ingest-ai-research
```

### Railway APScheduler (Price Data)

Runs continuously on Railway backend:
- **Cycle Interval**: Every 60 seconds
- **Batch Size**: 50 symbols per cycle
- **Credit Budget**: 55/minute (50 used + 5 buffer)

---

## Signal Generation

Edge functions generate signals from raw data:

| Function | Input | Output Signal Type |
|----------|-------|-------------------|
| `generate-signals-from-13f` | 13F holdings | `bigmoney_*` |
| `generate-signals-from-form4` | Insider trades | `insider_*` |
| `generate-signals-from-congressional` | Congress trades | `politician_*` |
| `generate-signals-from-darkpool` | Dark pool | `darkpool_*` |
| `generate-signals-from-etf-flows` | ETF flows | `flow_*` |
| `generate-signals-from-options` | Options flow | `options_*` |
| `generate-signals-from-earnings` | Earnings | `earnings_*` |
| `generate-signals-from-social` | Social data | `social_*` |
| `generate-signals-from-policy` | Policy news | `policy_*` |

**Note**: Signal generation only runs on REAL data. If the source table has no data, no signals are generated.

---

## Data Quality Monitoring

### Staleness Detection
```sql
-- View stale data
SELECT * FROM get_stale_functions();

-- Check signal distribution
SELECT * FROM check_signal_distribution_skew();
```

### Health Endpoints
- `/functions/v1/api-data-staleness` - Data freshness report
- `/functions/v1/api-ingest-logs` - Recent ingestion logs
- `/functions/v1/api-alerts-errors` - Error alerts
- `/functions/v1/ingestion-health` - Overall health status

### Expected Behavior

| Situation | Expected Response |
|-----------|-------------------|
| Real data available | `inserted: N, success: true` |
| No real data | `inserted: 0, success: true, version: v3_no_estimation` |
| API error | `success: false, error: "..."` |
| Rate limited | `success: true, inserted: 0` (retry later) |

---

## Troubleshooting

### No Prices Updating
1. Check Railway backend logs
2. Verify TwelveData API key
3. Check scheduler status: `GET /api/health/scheduler`
4. Review rate limit: 55 credits/min max

### Edge Function Returns 0 Records
This is EXPECTED behavior if:
- External API is down
- No new data available
- Rate limited by source

Check logs for `v3_no_estimation` to confirm function is working correctly.

### Stale Signals
1. Run diagnostics: `curl .../ingest-diagnostics`
2. Manually trigger: `curl -X POST .../trigger-all-ingestions`
3. Check cron jobs: `SELECT * FROM cron.job;`
4. Verify external APIs are responding

### High Error Rate
1. Check `function_status` table
2. Review circuit breaker status
3. Check API quotas and limits
4. Review Slack alerts for patterns

---

## Required Secrets

| Secret | Required For |
|--------|--------------|
| `TWELVEDATA_API_KEY` | Price data |
| `FIRECRAWL_API_KEY` | Web scraping |
| `REDDIT_CLIENT_ID` | Reddit sentiment |
| `REDDIT_CLIENT_SECRET` | Reddit sentiment |
| `REDDIT_USERNAME` | Reddit sentiment |
| `REDDIT_PASSWORD` | Reddit sentiment |
| `ADZUNA_APP_ID` | Job postings |
| `ADZUNA_APP_KEY` | Job postings |
| `FRED_API_KEY` | Economic data |
| `SLACK_WEBHOOK_URL` | Alerts (optional) |
