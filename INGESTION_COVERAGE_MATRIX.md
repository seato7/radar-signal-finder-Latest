# INGESTION FUNCTION COVERAGE MATRIX
**Generated:** 2025-11-14 04:20 UTC  
**Period:** Last 24 hours  
**Total Functions:** 34 expected, 20 tested

---

## ✅ TESTED & OPERATIONAL (20 Functions)

| Function | Status | Run Count | Avg Duration (ms) | Rows Inserted | Success Rate | Last Run |
|----------|--------|-----------|-------------------|---------------|--------------|----------|
| **ingest-prices-yahoo** | ✅ | 127 | 3,276 | 5 | 100% | 2025-11-14 04:15:06 |
| **ingest-news-sentiment** | ✅ | 192 | 659 | 3,462 | 100% | 2025-11-14 04:15:04 |
| **ingest-forex-technicals** | ✅ | 31 | 76,004 | 165 | 100% | 2025-11-14 04:01:11 |
| **ingest-pattern-recognition** | ✅ | 56 | 5,390 | 1,120 | 100% | 2025-11-14 04:00:15 |
| **ingest-advanced-technicals** | ✅ | 32 | 5,110 | 640 | 100% | 2025-11-14 04:00:07 |
| **ingest-forex-sentiment** | ✅ | 35 | 1,654 | 350 | 100% | 2025-11-14 04:00:06 |
| **ingest-smart-money** | ✅ | 31 | 3,601 | 651 | 100% | 2025-11-14 03:25:03 |
| **ingest-breaking-news** | ✅ | 12 | 48,966 | 216 | 100% | 2025-11-14 03:00:55 |
| **ingest-ai-research** | ✅ | 12 | 42,333 | 70 | 100% | 2025-11-14 02:05:37 |
| **ingest-cot-reports** | ✅ | 7 | 610 | 21 | 100% | 2025-11-14 01:45:06 |
| **ingest-search-trends** | ✅ | 7 | 1,934 | 315 | 100% | 2025-11-14 01:20:05 |
| **ingest-policy-feeds** | ✅ | 8 | 2,161 | 0 | 100% | 2025-11-14 01:10:03 |
| **ingest-form4** | ✅ | 7 | 2,125 | 0 | 100% | 2025-11-14 00:55:02 |
| **ingest-etf-flows** | ✅ | 7 | 564 | 0 | 100% | 2025-11-14 00:45:01 |
| **ingest-dark-pool** | ✅ | 7 | 11,412 | 0 | 100% | 2025-11-14 00:40:16 |
| **ingest-crypto-onchain** | ✅ | 7 | 10,061 | 0 | 100% | 2025-11-14 00:05:12 |
| **ingest-fred-economics** | ✅ | 6 | 12,090 | 714 | 100% | 2025-11-14 00:00:20 |
| **ingest-cot-cftc** | ✅ | 2 | 4,652 | 60 | 100% | 2025-11-13 23:03:58 |
| **ingest-economic-calendar** | ✅ | 1 | 1,239 | 0 | 100% | 2025-11-13 08:00:04 |

### ❌ FAILING FUNCTION (1)

| Function | Status | Run Count | Avg Duration (ms) | Rows Inserted | Success Rate | Last Run |
|----------|--------|-----------|-------------------|---------------|--------------|----------|
| **ingest-13f-holdings** | ❌ | 8 | 8 | 0 | 0% | 2025-11-14 00:10:01 |

**Error:** SEC 13F requires paid API access or complex web scraping. Function currently fails auth checks.

---

## ⚠️ UNTESTED FUNCTIONS (14)

These functions exist but have NOT run in the last 24 hours:

1. **ingest-congressional-trades** - Legislative tracking
2. **ingest-earnings** - Earnings calendar
3. **ingest-finra-darkpool** - FINRA dark pool data
4. **ingest-google-trends** - Google search trends
5. **ingest-job-postings** - Employment data
6. **ingest-options-flow** - Options flow data
7. **ingest-orchestrator** - Master orchestration function
8. **ingest-patents** - Patent filings
9. **ingest-prices-csv** - CSV price imports
10. **ingest-reddit-sentiment** - Reddit sentiment analysis
11. **ingest-short-interest** - Short interest data
12. **ingest-stocktwits** - StockTwits sentiment
13. **ingest-supply-chain** - Supply chain analytics
14. **ingest-diagnostics** - System diagnostics

**Reasons for No Activity:**
- Not scheduled in cron
- Require manual triggers
- Require specific API keys not configured
- Alternative data sources (low priority)

---

## 🎯 COVERAGE SUMMARY

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Total Functions** | 34 | 34 | ✅ All exist |
| **Tested (24h)** | 20 | 34 | 59% coverage |
| **Passing** | 19 | 20 | 95% success |
| **Failing** | 1 | 0 | ⚠️ ingest-13f-holdings |
| **Untested** | 14 | 0 | ⚠️ Not scheduled |
| **Total Runs (24h)** | 569 | N/A | High activity |
| **Total Rows Inserted** | 7,789 | N/A | Good throughput |

---

## 📊 PERFORMANCE METRICS

### Fastest Functions (<1s avg)
- `ingest-cot-reports` - 610ms
- `ingest-etf-flows` - 564ms
- `ingest-news-sentiment` - 659ms

### Slowest Functions (>10s avg)
- `ingest-forex-technicals` - 76,004ms (76s) ⚠️
- `ingest-breaking-news` - 48,966ms (49s)
- `ingest-ai-research` - 42,333ms (42s)

### Highest Throughput
- `ingest-news-sentiment` - 3,462 rows (192 runs)
- `ingest-pattern-recognition` - 1,120 rows (56 runs)
- `ingest-fred-economics` - 714 rows (6 runs)

---

## 🚨 CRITICAL ISSUES

### 1. Alpha Vantage API (ingest-prices-yahoo)
**Status:** 100% Yahoo fallback  
**Impact:** Primary API source not working  
**Evidence:** 0 Alpha Vantage calls logged, 127 Yahoo fallback successes  
**Action Required:** Test and fix Alpha Vantage API key

### 2. ingest-13f-holdings Failures
**Status:** 100% failure rate (8/8 failures)  
**Impact:** No 13F institutional holdings data  
**Evidence:** 8 consecutive failures, 8ms duration (immediate rejection)  
**Action Required:** Fix SEC API authentication or implement web scraping

### 3. Untested Functions (14)
**Status:** Never executed in 24h  
**Impact:** Limited data coverage  
**Action Required:** Schedule or manually test all 34 functions

---

## ✅ VALIDATION TESTS AVAILABLE

Three new edge functions have been deployed for manual testing:

### 1. Test Slack Alerts
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/test-slack-alert
```
**Tests:**
- Slack webhook connectivity
- alert_history table logging
- 10-minute deduplication logic

### 2. Test Alpha Vantage API
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/test-alpha-vantage
```
**Tests:**
- API key validity
- Rate limit status
- Live price data for MSFT, AAPL, TSLA

### 3. Validate System Health
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/validate-system-health
```
**Tests:**
- alert_history table status
- Watchdog function execution
- Kill-stuck-jobs function execution
- Alpha Vantage API logs
- Ingestion coverage (24h)
- Data quality checks
- Theme score freshness

---

## 🎯 RECOMMENDED ACTIONS

### Immediate (Pre-Launch)
1. ✅ Run `test-slack-alert` and verify Slack message received
2. ✅ Run `test-alpha-vantage` and fix API key if needed
3. ✅ Run `validate-system-health` for comprehensive status
4. ⚠️ Wait 10 minutes, verify watchdog-ingestion-health ran (check function_status)
5. ⚠️ Wait 10 minutes, verify kill-stuck-jobs ran (check function_status)

### Post-Launch (Within 7 Days)
1. Schedule all 14 untested functions with appropriate cron intervals
2. Fix ingest-13f-holdings authentication
3. Monitor alert_history for critical alerts
4. Optimize slow functions (>30s duration)

---

**Last Updated:** 2025-11-14 04:20 UTC  
**Next Review:** After manual tests completed
