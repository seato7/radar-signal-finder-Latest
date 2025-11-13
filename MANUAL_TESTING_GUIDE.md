# 🧪 Complete Manual Testing Guide for All 34 Ingestion Functions

## Prerequisites
- Supabase CLI installed (`npm install -g supabase`)
- Project reference: `detxhoqiarohjevedmxh`
- Valid authentication token (for auth-required functions)

## Testing Command Template

```bash
npx supabase functions invoke <function-name> \
  --project-ref detxhoqiarohjevedmxh \
  --no-verify-jwt
```

For auth-required functions, include authorization:
```bash
npx supabase functions invoke <function-name> \
  --project-ref detxhoqiarohjevedmxh \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## ✅ All 34 Functions - Complete Test List

### 🔥 Core Price & Market Data (Priority 1)

#### 1. ingest-prices-yahoo
```bash
npx supabase functions invoke ingest-prices-yahoo --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: 90%+ success rate, rows_inserted > 0, fallback_used if Alpha fails

#### 2. ingest-prices-csv
```bash
# Requires JSON body with csv_urls
npx supabase functions invoke ingest-prices-csv --project-ref detxhoqiarohjevedmxh --no-verify-jwt \
  --body '{"csv_urls": ["https://example.com/prices.csv"]}'
```
**Expected**: Parsed CSV, inserted prices with checksum deduplication

---

### 📰 News & Sentiment

#### 3. ingest-breaking-news
```bash
npx supabase functions invoke ingest-breaking-news --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: rows_inserted > 0, source_used = 'NewsAPI' or fallback

#### 4. ingest-news-sentiment
```bash
npx supabase functions invoke ingest-news-sentiment --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Aggregated sentiment from breaking_news, rows_inserted > 0

#### 5. ingest-ai-research
```bash
npx supabase functions invoke ingest-ai-research --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: AI reports generated, rows_inserted > 0

---

### 🏛️ Government & Regulatory

#### 6. ingest-congressional-trades
```bash
npx supabase functions invoke ingest-congressional-trades --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: Congressional trades inserted, requires auth

#### 7. ingest-13f-holdings
```bash
# Requires JSON body with filing data
npx supabase functions invoke ingest-13f-holdings --project-ref detxhoqiarohjevedmxh --no-verify-jwt \
  --body '{"filing_url": "https://sec.gov/...", "xml_content": "...", "manager_name": "Test Fund"}'
```
**Expected**: Holdings parsed, signals created for position changes

#### 8. ingest-form4
```bash
# Requires JSON body with Form 4 data
npx supabase functions invoke ingest-form4 --project-ref detxhoqiarohjevedmxh --no-verify-jwt \
  --body '{"xml_content": "...", "filing_url": "https://sec.gov/..."}'
```
**Expected**: Insider transactions parsed and inserted

#### 9. ingest-policy-feeds
```bash
npx supabase functions invoke ingest-policy-feeds --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Policy RSS feeds parsed, rows_inserted > 0

---

### 📊 Technical Analysis

#### 10. ingest-advanced-technicals
```bash
npx supabase functions invoke ingest-advanced-technicals --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: VWAP, Fibonacci, support/resistance calculated

#### 11. ingest-pattern-recognition
```bash
npx supabase functions invoke ingest-pattern-recognition --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Chart patterns detected, signals generated

#### 12. ingest-forex-technicals
```bash
npx supabase functions invoke ingest-forex-technicals --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Forex indicators calculated (RSI, MACD, Bollinger)

---

### 💰 Dark Pool & Flow

#### 13. ingest-dark-pool
```bash
npx supabase functions invoke ingest-dark-pool --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Dark pool volume tracked, signals for unusual activity

#### 14. ingest-finra-darkpool
```bash
npx supabase functions invoke ingest-finra-darkpool --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: FINRA dark pool data, rows_inserted > 0

#### 15. ingest-smart-money
```bash
npx supabase functions invoke ingest-smart-money --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Institutional vs retail flow, smart money index calculated

#### 16. ingest-options-flow
```bash
npx supabase functions invoke ingest-options-flow --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: Unusual options activity tracked

---

### 📈 Institutional & ETF

#### 17. ingest-etf-flows
```bash
# Requires JSON body with csv_urls
npx supabase functions invoke ingest-etf-flows --project-ref detxhoqiarohjevedmxh --no-verify-jwt \
  --body '{"csv_urls": ["https://example.com/etf_flows.csv"]}'
```
**Expected**: ETF flow z-scores calculated, signals generated

#### 18. ingest-short-interest
```bash
npx supabase functions invoke ingest-short-interest --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: FINRA short interest data via Perplexity

---

### 🌍 Macro & Economics

#### 19. ingest-economic-calendar
```bash
npx supabase functions invoke ingest-economic-calendar --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Economic indicators inserted, signals for surprises

#### 20. ingest-fred-economics
```bash
npx supabase functions invoke ingest-fred-economics --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: FRED data (GDP, CPI, unemployment), rows_inserted > 0

#### 21. ingest-cot-reports
```bash
npx supabase functions invoke ingest-cot-reports --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: CFTC Commitments of Traders data

#### 22. ingest-cot-cftc
```bash
npx supabase functions invoke ingest-cot-cftc --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Alternative COT ingestion, rows_inserted > 0

---

### 💱 Forex

#### 23. ingest-forex-sentiment
```bash
npx supabase functions invoke ingest-forex-sentiment --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Retail sentiment for forex pairs, signals for extremes

---

### 🪙 Crypto

#### 24. ingest-crypto-onchain
```bash
npx supabase functions invoke ingest-crypto-onchain --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: On-chain metrics (whale activity, exchange flows)

---

### 🏢 Company Intelligence

#### 25. ingest-earnings
```bash
npx supabase functions invoke ingest-earnings --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Earnings calendar, rows_inserted > 0

#### 26. ingest-job-postings
```bash
npx supabase functions invoke ingest-job-postings --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: Job postings from Adzuna API

#### 27. ingest-patents
```bash
npx supabase functions invoke ingest-patents --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: Patent filings via Perplexity USPTO

#### 28. ingest-supply-chain
```bash
npx supabase functions invoke ingest-supply-chain --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: Supply chain signals via Perplexity

---

### 📱 Social & Search

#### 29. ingest-stocktwits
```bash
npx supabase functions invoke ingest-stocktwits --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: StockTwits sentiment data

#### 30. ingest-reddit-sentiment
```bash
npx supabase functions invoke ingest-reddit-sentiment --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: Reddit posts analyzed via PRAW

#### 31. ingest-google-trends
```bash
npx supabase functions invoke ingest-google-trends --project-ref detxhoqiarohjevedmxh -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected**: Search trends via Perplexity

#### 32. ingest-search-trends
```bash
npx supabase functions invoke ingest-search-trends --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Synthetic trends (for testing)

---

### 🔧 Orchestration & Monitoring

#### 33. ingest-orchestrator
```bash
npx supabase functions invoke ingest-orchestrator --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Triggers all functions, reports success/failure

#### 34. ingest-diagnostics
```bash
npx supabase functions invoke ingest-diagnostics --project-ref detxhoqiarohjevedmxh --no-verify-jwt
```
**Expected**: Health check of all functions, reports status

---

## ✅ Verification Queries

After running tests, verify in Supabase:

### Check Function Status Table
```sql
SELECT 
  function_name,
  executed_at,
  status,
  rows_inserted,
  rows_skipped,
  fallback_used,
  error_message,
  duration_ms,
  source_used
FROM function_status
WHERE executed_at > NOW() - INTERVAL '1 hour'
ORDER BY executed_at DESC;
```

### Check Ingest Logs
```sql
SELECT 
  etl_name,
  status,
  started_at,
  completed_at,
  rows_inserted,
  rows_skipped,
  source_used,
  error_message
FROM ingest_logs
WHERE started_at > NOW() - INTERVAL '1 hour'
ORDER BY started_at DESC;
```

### Get Stale Functions
```sql
SELECT * FROM get_stale_functions();
```

### Check Success Rates
```sql
SELECT * FROM view_function_freshness
ORDER BY success_rate_pct ASC;
```

---

## 🚨 Expected Results Per Function

| Function | Min Success Rate | Min Rows | Max Duration | Notes |
|----------|------------------|----------|--------------|-------|
| ingest-prices-yahoo | 90% | 50 | 30s | Critical |
| ingest-breaking-news | 80% | 10 | 45s | Falls back to Perplexity |
| ingest-ai-research | 70% | 3 | 120s | AI-intensive |
| All others | 75% | 1 | 60s | Standard |

---

## 📊 Burn-In Test Procedure

1. **Manual trigger all 34 functions** (use commands above)
2. **Wait 5 minutes** for cron schedules to execute
3. **Run verification queries** to check heartbeat logs
4. **Monitor for 24 hours** with watchdog alerts enabled
5. **Generate final report** from `view_function_freshness`

---

## ✅ Success Criteria

- ✅ 34/34 functions executed at least once
- ✅ 34/34 functions logged to `function_status`
- ✅ No function with >10% failure rate over 24h
- ✅ `prices` table updated every 15 minutes
- ✅ Watchdog alerts triggered for 3+ consecutive failures

---

## 🎯 Next Steps

1. Run all 34 commands manually
2. Check `function_status` table for heartbeat logs
3. Review any errors in `ingest_logs`
4. Fix failing functions
5. Repeat until 100% green

**Status**: All 34 functions now have heartbeat logging ✅
