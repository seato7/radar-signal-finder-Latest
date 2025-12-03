# Complete Ingestion Function Matrix

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Ingestion Functions | 34 |
| Perplexity-Dependent | 3 (was 6) |
| TwelveData-Powered | 2 |
| Free API Sources | 25 |
| Internal DB Sources | 4 |
| Daily Perplexity Calls | ~6 (was ~20) |
| Est. Monthly Savings | $30-50 |

---

## Ingestion Functions by Data Source

### 🔴 Perplexity AI (Paid - $0.005/call)
*Reduced to essential use only*

| # | Function | Frequency | Calls/Day | Notes |
|---|----------|-----------|-----------|-------|
| 1 | `ingest-breaking-news` | Every 12h | 2 | Real-time news - no free alternative |
| 2 | `ingest-crypto-onchain` | Every 12h | 2 | Unique blockchain metrics |
| 3 | `ingest-news-sentiment` | Every 12h | 2 | Aggregated sentiment analysis |

**Total Perplexity: ~6 calls/day (~$0.03/day, ~$1/month)**

---

### 🟢 TwelveData (Already Paid - No Additional Cost)
*Moved from Perplexity to TwelveData*

| # | Function | Frequency | Source | Notes |
|---|----------|-----------|--------|-------|
| 4 | `ingest-forex-technicals` | Every 6h | TwelveData API | RSI, SMA, MACD for forex |
| 5 | Price Ingestion | Railway Backend | TwelveData API | All asset prices |

---

### 🟢 Internal Database (No API Cost)
*Calculates from existing price data*

| # | Function | Frequency | Source | Notes |
|---|----------|-----------|--------|-------|
| 6 | `ingest-advanced-technicals` | Daily | Internal price DB | VWAP, Fibonacci, support/resistance |
| 7 | `ingest-pattern-recognition` | Daily | Internal price DB | Chart patterns |

---

### 🟢 Free APIs (No Cost)

| # | Function | Frequency | Source | API Key |
|---|----------|-----------|--------|---------|
| 8 | `ingest-13f-holdings` | Every 6h | SEC EDGAR | None |
| 9 | `ingest-form4` | Daily | SEC EDGAR | None |
| 10 | `ingest-smart-money` | Every 6h | SEC EDGAR | None |
| 11 | `ingest-fred-economics` | Every 6h | FRED API | FRED_API_KEY |
| 12 | `ingest-etf-flows` | Daily | Alpha Vantage | ALPHA_VANTAGE_API_KEY |
| 13 | `ingest-earnings` | Every 6h | Alpha Vantage | ALPHA_VANTAGE_API_KEY |
| 14 | `ingest-dark-pool` | Every 6h | FINRA | None |
| 15 | `ingest-short-interest` | Every 6h | FINRA | None |
| 16 | `ingest-congressional-trades` | Daily | Capitol Trades | None |
| 17 | `ingest-policy-feeds` | Daily | RSS Feeds | None |
| 18 | `ingest-cot-cftc` | Weekly | CFTC | None |
| 19 | `ingest-job-postings` | Daily | Adzuna | ADZUNA_APP_ID/KEY |
| 20 | `ingest-patents` | Daily | USPTO | None |
| 21 | `ingest-google-trends` | Every 6h | SerpAPI | None |
| 22 | `ingest-options-flow` | Every 6h | CBOE | None |
| 23 | `ingest-supply-chain` | Daily | News RSS | None |
| 24 | `ingest-reddit-sentiment` | Daily | Reddit API | REDDIT_CLIENT_ID/SECRET |
| 25 | `ingest-forex-sentiment` | Daily | Multiple | Various |

---

### 🟡 Support/Monitoring Functions

| # | Function | Frequency | Purpose |
|---|----------|-----------|---------|
| 26 | `watchdog-ingestion-health` | Hourly | Health monitoring |
| 27 | `daily-ingestion-digest` | Daily | Slack digest |
| 28 | `cleanup-orphaned-logs` | Daily | Log cleanup |
| 29 | `compute-theme-scores` | Every 6h | Score computation |
| 30 | `generate-alerts` | Every 6h | Alert generation |
| 31 | `ingestion-health` | On-demand | Health check |
| 32 | `ingestion-health-enhanced` | On-demand | Detailed health |
| 33 | `health-metrics` | On-demand | System metrics |
| 34 | `validate-pipeline` | On-demand | Pipeline validation |

---

## Cron Schedule Overview

### Every 12 Hours (Perplexity Jobs)
```
0 */12 * * *   - ingest-breaking-news
15 */12 * * *  - ingest-crypto-onchain
30 */12 * * *  - ingest-news-sentiment
```

### Every 6 Hours (Standard Jobs)
```
0 */6 * * *    - ingest-fred-economics
10 */6 * * *   - ingest-13f-holdings
15 */6 * * *   - ingest-earnings
20 */6 * * *   - ingest-google-trends
25 */6 * * *   - ingest-options-flow
35 */6 * * *   - ingest-short-interest
40 */6 * * *   - ingest-smart-money
45 */6 * * *   - ingest-dark-pool
50 */6 * * *   - ingest-forex-technicals (TwelveData)
50 */6 * * *   - compute-theme-scores
55 */6 * * *   - generate-alerts
```

### Daily Jobs
```
0 3 * * *      - cleanup-orphaned-logs
0 6 * * *      - ingest-form4
0 7 * * *      - ingest-policy-feeds
0 8 * * *      - ingest-etf-flows
0 9 * * *      - ingest-congressional-trades
0 10 * * *     - ingest-job-postings
0 11 * * *     - ingest-patents
0 12 * * *     - ingest-supply-chain
0 14 * * *     - ingest-reddit-sentiment
0 15 * * *     - ingest-forex-sentiment
15 21 * * *    - ingest-advanced-technicals (Internal DB)
30 21 * * *    - ingest-pattern-recognition (Internal DB)
0 23 * * *     - daily-ingestion-digest
```

### Weekly Jobs
```
0 23 * * 5     - ingest-cot-cftc (Fridays)
```

### Hourly Jobs
```
0 * * * *      - watchdog-ingestion-health
```

---

## Cost Analysis

### Before Optimization
| Source | Calls/Day | Cost/Call | Daily Cost |
|--------|-----------|-----------|------------|
| Perplexity | 20 | $0.005 | $0.10 |
| TwelveData | Unlimited | Paid plan | $0 |
| Free APIs | Unlimited | Free | $0 |
| **Total** | | | **~$3/month** |

### After Optimization
| Source | Calls/Day | Cost/Call | Daily Cost |
|--------|-----------|-----------|------------|
| Perplexity | 6 | $0.005 | $0.03 |
| TwelveData | Unlimited | Paid plan | $0 |
| Free APIs | Unlimited | Free | $0 |
| **Total** | | | **~$1/month** |

**Savings: 70% reduction in Perplexity usage**

---

## Data Source Summary

| Source | Functions | Cost |
|--------|-----------|------|
| Perplexity AI | 3 | Paid per call |
| TwelveData | 2 | Included in plan |
| Internal DB | 2 | Free |
| SEC EDGAR | 3 | Free |
| Alpha Vantage | 2 | Free tier |
| FRED | 1 | Free |
| FINRA | 2 | Free |
| Adzuna | 1 | Free tier |
| Reddit API | 1 | Free |
| RSS/Web | 4 | Free |
| CFTC | 1 | Free |
| Other Free | 4 | Free |

---

## Environment Variables Required

```env
# Paid APIs
TWELVEDATA_API_KEY=xxx     # Forex technicals, prices
PERPLEXITY_API_KEY=xxx     # Breaking news, crypto on-chain, news sentiment

# Free APIs
FRED_API_KEY=xxx           # Economic data
ALPHA_VANTAGE_API_KEY=xxx  # ETF flows, earnings
ADZUNA_APP_ID=xxx          # Job postings
ADZUNA_APP_KEY=xxx         # Job postings
REDDIT_CLIENT_ID=xxx       # Reddit sentiment
REDDIT_CLIENT_SECRET=xxx   # Reddit sentiment
REDDIT_USERNAME=xxx        # Reddit sentiment
REDDIT_PASSWORD=xxx        # Reddit sentiment

# Infrastructure
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SLACK_WEBHOOK_URL=xxx      # Alerts
UPSTASH_REDIS_REST_URL=xxx # Caching
UPSTASH_REDIS_REST_TOKEN=xxx
```

---

## Testing Checklist

### Functions Switched to TwelveData
- [ ] `ingest-forex-technicals` - Verify RSI, SMA, MACD data populates
- [ ] Source shows "TwelveData" in function_status

### Functions Using Internal DB
- [ ] `ingest-advanced-technicals` - Verify calculations from prices table
- [ ] `ingest-pattern-recognition` - Verify pattern detection
- [ ] Source shows "Internal Price Database (TwelveData)"

### Perplexity Functions (Verify Still Working)
- [ ] `ingest-breaking-news` - Check breaking_news table
- [ ] `ingest-crypto-onchain` - Check crypto_onchain_metrics table
- [ ] `ingest-news-sentiment` - Check news_sentiment_aggregate table

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-03 | Switched `ingest-forex-technicals` from Alpha Vantage + Perplexity to TwelveData |
| 2025-12-03 | Updated `ingest-advanced-technicals` source tracking to "Internal Price Database" |
| 2025-12-03 | Reduced Perplexity job frequencies from 3-6h to 12h |
| 2025-12-03 | Reduced Perplexity calls from ~20/day to ~6/day (70% reduction) |
