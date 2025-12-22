# Data Pipeline Documentation

## Overview

Opportunity Radar ingests data from multiple sources using a hybrid pipeline:

1. **Railway Python Backend** → TwelveData prices (27,000+ assets)
2. **Supabase Edge Functions** → 90+ ingestion functions (RSS, APIs, web scraping)
3. **pg_cron** → Scheduled job orchestration

All data flows into **Supabase PostgreSQL** as the single source of truth.

---

## Data Sources

### Price Data (TwelveData via Railway)

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

#### Market Data
| Function | Source | Frequency | Data |
|----------|--------|-----------|------|
| `ingest-news-rss` | RSS feeds | Hourly | Headlines, sentiment |
| `ingest-news-sentiment` | NewsAPI | 3 hours | Aggregated sentiment |
| `ingest-stocktwits` | StockTwits | 2 hours | Social mentions |
| `ingest-reddit-sentiment` | Reddit API | 2 hours | Reddit sentiment |
| `ingest-pattern-recognition` | Firecrawl | 6 hours | Chart patterns |
| `ingest-advanced-technicals` | Firecrawl | 6 hours | Technical indicators |

#### Institutional Data
| Function | Source | Frequency | Data |
|----------|--------|-----------|------|
| `ingest-sec-13f-edgar` | SEC EDGAR | Weekly | 13F holdings |
| `ingest-form4` | SEC EDGAR | Weekly | Insider trades |
| `ingest-congressional-trades` | Firecrawl | Daily | Congressional trades |
| `ingest-dark-pool` | FINRA ATS | Daily | Dark pool activity |
| `ingest-finra-darkpool` | FINRA OTC | Daily | OTC volume |

#### Economic Data
| Function | Source | Frequency | Data |
|----------|--------|-----------|------|
| `ingest-fred-economics` | FRED API | Weekly | Economic indicators |
| `ingest-cot-cftc` | CFTC | Weekly | COT reports |
| `ingest-economic-calendar` | Firecrawl | Daily | Economic events |

#### Alternative Data
| Function | Source | Frequency | Data |
|----------|--------|-----------|------|
| `ingest-job-postings` | Adzuna API | Daily | Hiring signals |
| `ingest-patents` | USPTO/Firecrawl | Weekly | Patent filings |
| `ingest-search-trends` | Firecrawl | Daily | Google Trends |
| `ingest-supply-chain` | Firecrawl | Daily | Supply chain signals |

#### Asset-Class Specific
| Function | Source | Frequency | Data |
|----------|--------|-----------|------|
| `ingest-crypto-onchain` | Firecrawl | Daily | On-chain metrics |
| `ingest-forex-sentiment` | Firecrawl | Daily | Forex sentiment |
| `ingest-forex-technicals` | Firecrawl | Daily | Forex indicators |
| `ingest-options-flow` | Firecrawl | Daily | Options activity |
| `ingest-short-interest` | Firecrawl | Daily | Short interest |
| `ingest-etf-flows` | Firecrawl | Daily | ETF flows |

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
│             │ │  generate-signals-from-*                    │
│ APScheduler │ │  compute-theme-scores                       │
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

---

## Data Quality Monitoring

### Staleness Detection
```sql
-- View stale data
SELECT * FROM get_stale_functions();

-- Check signal distribution
SELECT * FROM check_signal_distribution_skew();

-- Monitor AI fallback usage
SELECT * FROM check_ai_fallback_usage();
```

### Health Endpoints
- `/functions/v1/api-data-staleness` - Data freshness report
- `/functions/v1/api-ingest-logs` - Recent ingestion logs
- `/functions/v1/api-alerts-errors` - Error alerts
- `/functions/v1/ingestion-health` - Overall health status

### Alerts (Slack)
Automatic alerts for:
- ❌ Ingestion failures (3+ consecutive)
- ⏰ Stale data (>24h for critical tables)
- 📊 Signal distribution skew (>90% one direction)
- 🔄 Excessive AI fallback usage (>80%)

---

## Troubleshooting

### No Prices Updating
1. Check Railway backend logs
2. Verify TwelveData API key
3. Check scheduler status: `GET /api/health/scheduler`
4. Review rate limit: 55 credits/min max

### Edge Function Failures
1. Check function logs in Lovable Cloud
2. Verify API keys in secrets
3. Check for rate limiting
4. Review `ingest_logs` table

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
