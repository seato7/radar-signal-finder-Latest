# Real-Time Data Pipeline Documentation

**SLA:** All market data must be ≤5 seconds old. This is a **hard requirement** for production trading operations.

---

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   INGESTION LAYER                          │
│  Edge Functions → Redis Cache (5s TTL) → Supabase Tables  │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                   TIERED FALLBACK SYSTEM                    │
│  Tier 1: Primary APIs → Tier 2: Verified AI → Tier 3: REJECT│
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                   MONITORING & ALERTING                     │
│  /api-data-staleness, /api-alerts-errors, Slack Webhooks  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Freshness SLA

### Hard Requirements

- **Maximum Age:** 5 seconds
- **Cache TTL:** 5 seconds (Redis)
- **Rejection Threshold:** Any data >5s old is rejected
- **Alert Threshold:** >2% fallback usage in 10min triggers Slack alert

### Monitored Tables

All of these tables enforce `last_updated_at` tracking:

- `prices` (stocks)
- `forex_sentiment` (forex)
- `crypto_onchain_metrics` (crypto)
- `news_sentiment_aggregate` (all assets)
- `advanced_technicals` (all assets)
- `economic_indicators` (macro)

---

## 🔄 Redis Caching Strategy

### How It Works

1. **Check Redis First:** Every ingestion function checks Redis cache before hitting external APIs
2. **5-Second TTL:** All cache entries expire after exactly 5 seconds
3. **Automatic Cleanup:** Stale entries (>5s) are auto-deleted on access
4. **Cache Miss → Fetch:** On miss, fetch from Tier 1 source → update Redis → insert to DB

### Implementation

```typescript
import { redisCache } from '../_shared/redis-cache.ts';

// 1. Check cache first
const cached = await redisCache.get(`price:${ticker}`);
if (cached.hit) {
  console.log(`✅ Cache hit for ${ticker} (${cached.age_seconds}s old)`);
  return cached.data;
}

// 2. Cache miss - fetch from primary source
const freshData = await fetchFromPrimaryAPI(ticker);

// 3. Update cache with 5s TTL
await redisCache.set(
  `price:${ticker}`, 
  freshData, 
  'Yahoo Finance',
  'https://finance.yahoo.com/...' // verified source URL
);

// 4. Insert to database with last_updated_at = NOW()
await supabase.from('prices').upsert({
  ticker,
  close: freshData.price,
  last_updated_at: new Date().toISOString()
});
```

### Redis Key Patterns

- **Prices:** `price:{TICKER}` (e.g., `price:AAPL`, `price:BTC/USD`)
- **Forex:** `forex:{PAIR}` (e.g., `forex:EUR/USD`)
- **Crypto:** `crypto:{SYMBOL}` (e.g., `crypto:BTC`, `crypto:ETH`)
- **News Sentiment:** `news:{TICKER}` (e.g., `news:TSLA`)

---

## 🎚️ Tiered Fallback System

### Tier 1: Primary Real-Time APIs ✅

**ALWAYS USE THESE FIRST.** These are trusted, low-latency, real-time sources.

| Asset Class | Primary Sources | Rate Limits |
|------------|----------------|-------------|
| **Stocks** | Yahoo Finance (web), Polygon.io, Finnhub | Yahoo: 2000/hr, Polygon: 5 req/s |
| **Crypto** | Binance REST/WebSocket, CoinGecko | Binance: 1200 req/min |
| **Forex** | exchangerate.host, AlphaVantage | AlphaVantage: 25/day (prefetch) |
| **Macro** | FRED (Federal Reserve), TradingEconomics | FRED: 1000/day |
| **Sentiment** | StockTwits, Reddit (scraped widgets) | Varies by scraper |

**Requirements for Tier 1:**
- Data timestamp within last 5 seconds
- No simulated/generated values
- Direct API response (not AI-generated)

### Tier 2: Verified AI Fallback ⚠️

**USE ONLY IF TIER 1 FAILS.** AI sources must extract from real web content, NOT generate data.

**Allowed AI Sources:**
- Perplexity (`sonar` model)
- Gemini (`google/gemini-2.5-flash`)

**Requirements for Tier 2:**
1. AI must extract data from live web pages (e.g., Yahoo Finance, Binance.com)
2. Response MUST include:
   - `verified_source`: Full URL of the source web page
   - `timestamp`: Server-side timestamp of when data was fetched
3. Log `fallback_used=true` in `ingest_logs`
4. Log `source_used='Perplexity'` or `source_used='Gemini'`

**Example AI Prompt (Correct):**
```
Extract the current BTC/USD price from Binance.com. 
Return ONLY the numeric price and the exact URL you used.
Do NOT generate or estimate values.
```

**Example AI Prompt (WRONG - DO NOT USE):**
```
What is the current BTC price? [This will generate a value, not extract it]
```

### Tier 3: Reject ❌

**NEVER ALLOW:**
- Simulated data
- Generated/hallucinated data
- Data older than 5 seconds
- AI responses without `verified_source` URL
- Mock/offline data

**Rejection Criteria:**
```typescript
function shouldRejectData(data: any): boolean {
  // Reject if no timestamp
  if (!data.timestamp) return true;
  
  // Reject if older than 5s
  const ageSeconds = (Date.now() - new Date(data.timestamp).getTime()) / 1000;
  if (ageSeconds > 5) return true;
  
  // Reject if AI-generated without verified source
  if (data.source_used in ['Perplexity', 'Gemini'] && !data.verified_source) return true;
  
  // Reject if source is "simulated" or "unknown"
  if (data.source_used in ['simulated', 'unknown', 'mock']) return true;
  
  return false;
}
```

---

## 📡 Monitoring & Observability

### Endpoint: `/api-data-staleness`

**Purpose:** Check which tickers have stale data (>5s)

**Usage:**
```bash
# Check all stale tickers
curl https://<project>.supabase.co/functions/v1/api-data-staleness

# Filter by asset class
curl https://<project>.supabase.co/functions/v1/api-data-staleness?asset_class=crypto

# Check specific ticker
curl https://<project>.supabase.co/functions/v1/api-data-staleness?ticker=BTC/USD
```

**Response:**
```json
{
  "timestamp": "2025-01-11T12:34:56Z",
  "sla_status": "degraded",
  "total_stale_tickers": 12,
  "sla_violations": 3,
  "max_staleness_seconds": 47.2,
  "by_asset_class": [
    {
      "asset_class": "crypto",
      "stale_count": 3,
      "tickers": [
        {
          "ticker": "BTC/USD",
          "table": "crypto_onchain_metrics",
          "last_updated_at": "2025-01-11T12:34:09Z",
          "seconds_stale": 47.2,
          "sla_violated": true
        }
      ]
    }
  ]
}
```

### Endpoint: `/api-alerts-errors`

**Purpose:** Aggregate all critical alerts (ETL failures, stale data, fallback overuse)

**New Alerts:**
- **`sla_violation`** (CRITICAL): Tickers with data >5s old
- **`ai_fallback_spike`** (CRITICAL): >2% fallback usage in 10min
- **`ai_fallback_overuse_24h`** (HIGH): >80% fallback usage in 24h

**Slack Alerts:**

All CRITICAL and HIGH alerts are sent to Slack webhook (if configured).

Example Slack message:
```
🚨 DATA PIPELINE ALERT (2 critical, 1 high)

*CRITICAL ALERTS:*
• ⚠️ SLA VIOLATION: 3 tickers have data >5s old (max: 47.2s)
• ⚠️ FALLBACK ALERT: ingest-prices-yahoo using AI fallback 8.5% in last 10min

*HIGH PRIORITY ALERTS:*
• ingest-breaking-news has failed 3 times in the last 5 runs
```

### Database Views

#### `view_stale_tickers`
```sql
SELECT * FROM view_stale_tickers ORDER BY seconds_stale DESC;
```

Returns all tickers with `last_updated_at` > 5 seconds ago.

#### `view_fallback_usage`
```sql
SELECT * FROM view_fallback_usage ORDER BY fallback_percentage DESC;
```

Returns ETL fallback usage stats for the last hour.

#### `view_api_errors`
```sql
SELECT * FROM view_api_errors;
```

Returns ETLs with ≥3 failures in last 10 minutes.

---

## 🧪 Testing & Validation

### Manual Verification Steps

#### 1. Check Crypto On-Chain Data
```bash
# Compare with LookIntoBitcoin or Glassnode
curl https://<project>.supabase.co/functions/v1/api-data-staleness?ticker=BTC/USD
# Cross-check metrics like MVRV, NVT, hash rate with public dashboards
```

#### 2. Check Dark Pool Activity
```bash
# Compare with FINRA ATS data
curl https://<project>.supabase.co/functions/v1/api-data-staleness?ticker=AAPL
# Verify dark pool volume percentages match public FINRA reports
```

#### 3. Simulate Cache Behavior
```typescript
// Test cache hit
const result1 = await redisCache.get('price:AAPL');
console.log('Cache hit:', result1.hit); // Should be true if recently cached

// Wait 6 seconds
await new Promise(resolve => setTimeout(resolve, 6000));

// Test cache miss (expired)
const result2 = await redisCache.get('price:AAPL');
console.log('Cache hit:', result2.hit); // Should be false (expired)
```

---

## 🚨 Alert Thresholds & Actions

| Alert | Threshold | Severity | Action |
|-------|----------|----------|--------|
| **SLA Violation** | Any ticker >5s old | CRITICAL | Check Redis + primary API sources |
| **Fallback Spike** | >2% fallback in 10min | CRITICAL | Primary API likely down - investigate immediately |
| **Fallback Overuse (24h)** | >80% fallback in 24h | HIGH | Replace primary source or upgrade API plan |
| **ETL Failures** | ≥3 consecutive failures | CRITICAL | Check logs, API keys, rate limits |
| **Empty Table** | 0 rows in critical table | CRITICAL | Run orchestrator to populate |
| **API Errors** | ≥3x 429/500 in 1min | HIGH | Rate limit or API outage |

---

## 💰 API Cost Management

### Rate Limits & Budget

| Source | Rate Limit | Cost | Usage Strategy |
|--------|-----------|------|----------------|
| Yahoo Finance | 2000/hr | Free | Primary for stocks |
| Polygon.io | 5 req/s | $200/mo | Fallback for stocks |
| Finnhub | 60 req/min | $70/mo | Supplementary |
| Binance | 1200 req/min | Free | Primary for crypto |
| CoinGecko | 50 calls/min | Free | Fallback crypto |
| AlphaVantage | 25/day | Free | Prefetch forex daily |
| Perplexity | 5000 req/mo | $20/mo | Emergency fallback only |

### Redis Cost Savings

- **Target:** >70% cache hit rate
- **Expected Savings:** 70% reduction in external API calls
- **Example:** 10,000 req/hr → 3,000 external API calls (7,000 from cache)

---

## 📋 Ingestion Function Checklist

For every ingestion function, ensure:

- [ ] Check Redis cache FIRST before external API
- [ ] Set `cache_hit=true` in `ingest_logs` if cache hit
- [ ] Update `last_updated_at=NOW()` when inserting to DB
- [ ] Log `source_used` (e.g., 'Yahoo Finance', 'Perplexity')
- [ ] Log `verified_source` URL if using AI fallback
- [ ] Set `fallback_used=true` if Tier 2 was used
- [ ] Reject data if age >5s
- [ ] Reject data if AI-generated without `verified_source`
- [ ] Log `latency_ms` for performance tracking
- [ ] Update Redis with 5s TTL after successful fetch

---

## 🛠️ Troubleshooting

### Problem: High Cache Miss Rate

**Symptoms:** `view_fallback_usage` shows low `cache_hit_percentage`

**Causes:**
- Redis not configured (check `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`)
- TTL too short (should be 5s)
- High request rate for diverse tickers (not enough reuse)

**Fix:**
```bash
# Verify Redis connection
curl https://<upstash-url>/ping -H "Authorization: Bearer <token>"

# Check cache stats
SELECT * FROM view_fallback_usage ORDER BY cache_hit_percentage ASC;
```

### Problem: SLA Violations

**Symptoms:** `/api-data-staleness` shows tickers >5s old

**Causes:**
- Ingestion function not running frequently enough
- Primary API slow/down
- Redis cache not being updated

**Fix:**
1. Check ETL schedule in `pg_cron` or edge function triggers
2. Verify primary API latency: `SELECT avg_latency_ms FROM view_fallback_usage;`
3. Force cache refresh: `await redisCache.delete('price:AAPL');`

### Problem: Excessive Fallback Usage

**Symptoms:** Slack alert "⚠️ FALLBACK ALERT: ... using AI fallback 8.5% in last 10min"

**Causes:**
- Primary API rate limit exceeded
- Primary API outage
- API key invalid/expired

**Fix:**
```sql
-- Check recent logs for specific ETL
SELECT * FROM ingest_logs 
WHERE etl_name = 'ingest-prices-yahoo' 
ORDER BY started_at DESC 
LIMIT 20;

-- Check error messages
SELECT * FROM view_api_errors;
```

---

## 🔐 Security & Data Integrity

### Verification Checklist

- [ ] All AI responses include `verified_source` URL
- [ ] No simulated/mock data in production tables
- [ ] All `source_used` fields are non-null
- [ ] `fallback_used` flag correctly set
- [ ] Redis cache TTL = 5 seconds (no manual overrides)
- [ ] Timestamps are server-side (not client-provided)

### Audit Query

```sql
-- Find suspicious signals (AI-generated without verification)
SELECT id, ticker, signal_type, source_used, created_at
FROM signals
WHERE source_used IN ('Perplexity', 'Gemini', 'Lovable AI')
  AND citation->>'verified_source' IS NULL
ORDER BY created_at DESC
LIMIT 50;
```

---

## 📈 Success Metrics

### Daily Dashboard Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **SLA Compliance** | 100% (0 violations) | <99% |
| **Cache Hit Rate** | >70% | <50% |
| **Fallback Usage (10min)** | <2% | >2% |
| **Avg Latency** | <2000ms | >5000ms |
| **API Errors** | 0 per hour | >3 per 10min |

### Weekly Review

Every Monday:
1. Check `view_fallback_usage` for anomalies
2. Review `view_api_errors` for recurring failures
3. Verify no tables have `last_updated_at` > 1 hour old
4. Test Redis connection and cache behavior
5. Audit AI fallback responses for `verified_source` compliance

---

## 🔧 Configuration

### Environment Variables

```bash
# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://<project>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>

# AI Fallback (if needed)
PERPLEXITY_API_KEY=<key>
LOVABLE_API_KEY=<key> (auto-configured)

# Alerts
SLACK_WEBHOOK_URL=<webhook>

# Supabase (auto-configured)
SUPABASE_URL=<url>
SUPABASE_SERVICE_ROLE_KEY=<key>
```

### Edge Function Secrets

All ingestion functions have access to:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `PERPLEXITY_API_KEY` (if configured)
- `LOVABLE_API_KEY` (auto-provisioned)

---

## 📞 Support & Escalation

### Critical Alerts

If any of these occur, escalate immediately:
- SLA violations >10 tickers
- Fallback usage >10% in 10min
- All primary APIs down (100% fallback)
- Redis cache unavailable

### Contact

- **On-call:** Check Slack `#data-pipeline-alerts`
- **Logs:** `/api-alerts-errors`, `/api-data-staleness`
- **Dashboards:** Supabase Cloud → Logs → Edge Functions

---

**Last Updated:** 2025-01-11  
**Version:** 1.0  
**Status:** ✅ Production Ready
