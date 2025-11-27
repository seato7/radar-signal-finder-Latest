# Ingestion Function Coverage Matrix

**Last Updated:** 2025-11-27  
**Total Ingestion Functions:** 34 (32 data + 2 support)  
**Monitored Functions:** 32 data ingestion functions (100%)  
**Success Rate Threshold:** 95%

---

## Executive Summary

This document provides a comprehensive overview of all 34 ingestion functions in the Insider Pulse application, their current operational status, monitoring coverage, and testing requirements.

### Quick Stats
- **Total Functions:** 34
  - **Data Ingestion:** 32 functions
    - Automated: 30 functions
    - User-Initiated: 2 functions (ingest-13f-holdings, ingest-prices-csv)
  - **Support Functions:** 2 functions (ingest-diagnostics, ingest-orchestrator)
- **Monitoring Coverage:** 100% (all 32 data ingestion functions)
- **Cron Schedule Coverage:** 30/32 automated functions (100%)
- **Expected Success Rate:** ≥95%

---

## Complete Function Inventory

### 1. **ingest-13f-holdings**
- **Type:** User-Initiated (excluded from automated triggering)
- **Purpose:** SEC 13F institutional holdings data
- **Frequency:** On-demand
- **Requirements:** `filing_url`, `xml_content`, `manager_name` in request body
- **Data Source:** SEC EDGAR
- **Target Table:** `institutional_holdings`
- **Status:** ⚠️ Requires manual invocation with proper filing data

### 2. **ingest-advanced-technicals**
- **Type:** Automated
- **Purpose:** Advanced technical indicators (ADX, Stochastic, Fibonacci, VWAP, OBV)
- **Frequency:** Every 6 hours
- **Cron:** `6h-advanced-technicals` at `0 */6 * * *`
- **Data Source:** Technical analysis calculations
- **Target Table:** `advanced_technicals`
- **Status:** ✅ Active

### 3. **ingest-ai-research**
- **Type:** Automated
- **Purpose:** AI-generated research reports and analysis
- **Frequency:** Every 6 hours
- **Cron:** `6h-ai-research` at `30 */6 * * *`
- **Data Source:** Perplexity AI
- **Target Table:** `ai_research_reports`
- **Status:** ✅ Active

### 4. **ingest-breaking-news**
- **Type:** Automated
- **Purpose:** Breaking news headlines and sentiment
- **Frequency:** Every 3 hours
- **Cron:** `3h-breaking-news` at `0 */3 * * *`
- **Data Source:** Perplexity API (with 5-retry logic)
- **Target Table:** `breaking_news`
- **Status:** ✅ Active

### 5. **ingest-congressional-trades**
- **Type:** Automated
- **Purpose:** Congressional stock trading disclosures
- **Frequency:** Daily
- **Cron:** `daily-congressional-trades` at `15 22 * * *`
- **Data Source:** House/Senate financial disclosures
- **Target Table:** `congressional_trades`
- **Status:** ✅ Active (with retry logic)

### 6. **ingest-cot-cftc**
- **Type:** Automated
- **Purpose:** CFTC Commitment of Traders data
- **Frequency:** Weekly (Fridays)
- **Cron:** `weekly-cot-cftc` at `15 23 * * 5`
- **Data Source:** CFTC API
- **Target Table:** `cot_reports`
- **Status:** ✅ Active

### 7. **ingest-cot-reports**
- **Type:** Automated
- **Purpose:** Legacy COT report processing
- **Frequency:** Weekly (Fridays)
- **Cron:** `weekly-cot-reports` at `0 23 * * 5`
- **Data Source:** CFTC
- **Target Table:** `cot_reports`
- **Status:** ✅ Active

### 8. **ingest-crypto-onchain**
- **Type:** Automated
- **Purpose:** On-chain crypto metrics (BTC/USD, ETH/USD, SOL/USD)
- **Frequency:** Every 6 hours
- **Cron:** `6h-crypto-onchain` at `0 1-23/6 * * *`
- **Data Source:** Perplexity AI
- **Target Table:** `crypto_onchain_metrics`
- **Status:** ⚠️ 66.67% success rate (includes fallback for missing data)

### 9. **ingest-dark-pool**
- **Type:** Automated
- **Purpose:** Dark pool trading activity
- **Frequency:** Daily
- **Cron:** `daily-dark-pool` at `0 23 * * *`
- **Data Source:** Perplexity AI
- **Target Table:** `dark_pool_activity`
- **Status:** ✅ Active

### 10. **ingest-diagnostics**
- **Type:** Support Function (not monitored)
- **Purpose:** Diagnostic tool for ingestion pipeline health
- **Frequency:** On-demand
- **Status:** ⚙️ Utility function

### 11. **ingest-earnings**
- **Type:** Automated
- **Purpose:** Earnings reports and surprises
- **Frequency:** Daily
- **Cron:** `daily-earnings` at `30 23 * * *`
- **Data Source:** Perplexity
- **Target Table:** `earnings_sentiment`
- **Status:** ✅ Active

### 12. **ingest-economic-calendar**
- **Type:** Automated
- **Purpose:** Upcoming economic events and releases
- **Frequency:** Daily
- **Cron:** `daily-economic-calendar` at `45 23 * * *`
- **Data Source:** Economic calendar APIs
- **Target Table:** `economic_indicators`
- **Status:** ✅ Active

### 13. **ingest-etf-flows**
- **Type:** Automated
- **Purpose:** ETF flow data
- **Frequency:** Daily
- **Cron:** `daily-etf-flows` at `30 22 * * *`
- **Data Source:** ETF flow CSV files
- **Target Table:** `etf_flows`
- **Status:** ✅ Active

### 14. **ingest-finra-darkpool**
- **Type:** Automated
- **Purpose:** FINRA ATS dark pool data
- **Frequency:** Daily
- **Cron:** `daily-finra-darkpool` at `15 23 * * *`
- **Data Source:** FINRA
- **Target Table:** `dark_pool_activity`
- **Status:** ✅ Active

### 15. **ingest-forex-sentiment**
- **Type:** Automated
- **Purpose:** Forex market sentiment
- **Frequency:** Every 6 hours
- **Cron:** `6h-forex-sentiment` at `30 1-23/6 * * *`
- **Data Source:** Simulated/API
- **Target Table:** `forex_sentiment`
- **Status:** ✅ Active

### 16. **ingest-forex-technicals**
- **Type:** Automated
- **Purpose:** Forex technical indicators
- **Frequency:** Every 6 hours
- **Cron:** `6h-forex-technicals` at `15 1-23/6 * * *`
- **Data Source:** Alpha Vantage
- **Target Table:** `forex_technicals`
- **Status:** ✅ Active

### 17. **ingest-form4**
- **Type:** Automated
- **Purpose:** SEC Form 4 insider trading data
- **Frequency:** Daily
- **Cron:** `daily-form4` at `0 22 * * *`
- **Data Source:** SEC EDGAR
- **Target Table:** `insider_trades`
- **Status:** ✅ Active (0-skip strategy)

### 18. **ingest-fred-economics**
- **Type:** Automated
- **Purpose:** Federal Reserve Economic Data
- **Frequency:** Weekly (Fridays)
- **Cron:** `weekly-fred-economics` at `30 23 * * 5`
- **Data Source:** FRED API
- **Target Table:** `economic_indicators`
- **Status:** ✅ Active

### 19. **ingest-google-trends**
- **Type:** Automated
- **Purpose:** Google search trends data
- **Frequency:** Daily
- **Cron:** `daily-google-trends` at `0 0 * * *`
- **Data Source:** Google Trends API
- **Target Table:** `search_trends`
- **Status:** 🆕 Scheduled (awaiting first run)

### 20. **ingest-job-postings**
- **Type:** Automated
- **Purpose:** Company job posting trends
- **Frequency:** Weekly (Fridays)
- **Cron:** `weekly-job-postings` at `45 23 * * 5`
- **Data Source:** Job posting APIs
- **Target Table:** `job_postings`
- **Status:** 🆕 Scheduled (awaiting first run)

### 21. **ingest-news-sentiment**
- **Type:** Automated
- **Purpose:** Aggregated news sentiment analysis
- **Frequency:** Every 3 hours
- **Cron:** `3h-news-sentiment` at `15 */3 * * *`
- **Data Source:** News aggregation
- **Target Table:** `news_sentiment_aggregate`
- **Status:** ✅ Active

### 22. **ingest-options-flow**
- **Type:** Automated
- **Purpose:** Options flow and unusual activity
- **Frequency:** Every 6 hours
- **Cron:** `6h-options-flow` at `45 */6 * * *`
- **Data Source:** Perplexity
- **Target Table:** `options_flow`
- **Status:** ✅ Active

### 23. **ingest-orchestrator**
- **Type:** Support Function (not monitored)
- **Purpose:** Orchestrates and schedules ingestion jobs
- **Frequency:** On-demand
- **Status:** ⚙️ Utility function

### 24. **ingest-patents**
- **Type:** Automated
- **Purpose:** Patent filing data
- **Frequency:** Weekly (Saturdays)
- **Cron:** `weekly-patents` at `0 0 * * 6`
- **Data Source:** USPTO
- **Target Table:** `patent_filings`
- **Status:** 🆕 Scheduled (awaiting first run)

### 25. **ingest-pattern-recognition**
- **Type:** Automated
- **Purpose:** Chart pattern detection
- **Frequency:** Every 6 hours
- **Cron:** `6h-pattern-recognition` at `15 */6 * * *`
- **Data Source:** Pattern analysis
- **Target Table:** `pattern_recognition`
- **Status:** ✅ Active

### 26. **ingest-policy-feeds**
- **Type:** Automated
- **Purpose:** Policy and regulatory news
- **Frequency:** Daily
- **Cron:** `daily-policy-feeds` at `45 22 * * *`
- **Data Source:** RSS feeds
- **Target Table:** `policy_feeds`
- **Status:** ✅ Active

### 27. **ingest-prices-csv**
- **Type:** User-Initiated (excluded from automated triggering)
- **Purpose:** Custom price data from CSV
- **Frequency:** On-demand
- **Requirements:** `csv_urls` array in request body
- **Data Source:** User-provided CSV files
- **Target Table:** `prices`
- **Status:** ⚠️ Requires manual invocation with CSV URLs

### 28. **ingest-prices-yahoo**
- **Type:** Automated
- **Purpose:** Real-time price data (OHLCV)
- **Frequency:** Every 10 minutes
- **Cron:** `10min-prices-yahoo` at `*/10 * * * *`
- **Data Source:** Yahoo Finance (100% fallback), Alpha Vantage (primary - rate limited)
- **Target Table:** `prices`
- **Status:** ✅ Active (Critical function, 100% Yahoo fallback)

### 29. **ingest-reddit-sentiment**
- **Type:** Automated
- **Purpose:** Reddit sentiment analysis
- **Frequency:** Daily
- **Cron:** `daily-reddit-sentiment` at `30 0 * * *`
- **Data Source:** Reddit API
- **Target Table:** `social_signals`
- **Status:** 🆕 Scheduled (awaiting first run)

### 30. **ingest-search-trends**
- **Type:** Automated
- **Purpose:** Search trend analysis
- **Frequency:** Daily
- **Cron:** `daily-search-trends` at `15 0 * * *`
- **Data Source:** Search APIs
- **Target Table:** `search_trends`
- **Status:** 🆕 Scheduled (awaiting first run)

### 31. **ingest-short-interest**
- **Type:** Automated
- **Purpose:** Short interest data
- **Frequency:** Bi-weekly (2nd and 4th Friday of month)
- **Cron:** `biweekly-short-interest` at `30 0 8-14,22-28 * 5`
- **Data Source:** Market data providers
- **Target Table:** `short_interest`
- **Status:** 🆕 Scheduled (awaiting first run)

### 32. **ingest-smart-money**
- **Type:** Automated
- **Purpose:** Institutional flow tracking
- **Frequency:** Every 6 hours
- **Cron:** `6h-smart-money` at `45 1-23/6 * * *`
- **Data Source:** Derived data
- **Target Table:** `smart_money_flow`
- **Status:** 🆕 Scheduled (awaiting first run)

### 33. **ingest-stocktwits**
- **Type:** Automated
- **Purpose:** StockTwits sentiment
- **Frequency:** Daily
- **Cron:** `daily-stocktwits` at `45 0 * * *`
- **Data Source:** StockTwits API
- **Target Table:** `social_signals`
- **Status:** 🆕 Scheduled (awaiting first run)

### 34. **ingest-supply-chain**
- **Type:** Automated
- **Purpose:** Supply chain indicators
- **Frequency:** Weekly (Saturdays)
- **Cron:** `weekly-supply-chain` at `15 0 * * 6`
- **Data Source:** Supply chain APIs
- **Target Table:** `supply_chain_signals`
- **Status:** 🆕 Scheduled (awaiting first run)

---

## Monitoring Configuration

### Success Rate Monitoring
- **Tool:** `monitor-ingestion-success-rates`
- **Functions Monitored:** All 32 data ingestion functions
- **Frequency:** Every 10 minutes
- **Cron:** `10min-success-rate-monitor` at `*/10 * * * *`
- **Threshold:** 95% success rate
- **Lookback Window:** Last 24 hours
- **Minimum Runs for Alert:** 3 runs
- **Alert Channel:** Slack (#insider-pulse-alerts)

### Alert Conditions
1. **Success rate drops below 95%** → Critical Slack alert
2. **0 runs in expected window** → Staleness alert
3. **Excessive fallback usage (>80%)** → Warning alert
4. **All functions above 95%** → Success notification

### Trigger Configuration
- **Tool:** `trigger-all-ingestions`
- **Coverage:** All 32 data ingestion functions
- **Batch Size:** 5 concurrent triggers
- **Batch Delay:** 2 seconds between batches
- **Expected Failures:** 2 (user-initiated functions without input)

---

## Cron Schedule Summary

### High-Frequency (Every 10-15 minutes)
- `10min-prices-yahoo` - Every 10 minutes
- `10min-success-rate-monitor` - Every 10 minutes

### High-Frequency News & Sentiment (Every 3 hours)
- `3h-breaking-news` - Every 3 hours
- `3h-news-sentiment` - Every 3 hours

### Medium-Frequency Market Data (Every 6 hours)
- `6h-advanced-technicals` - Every 6 hours
- `6h-ai-research` - Every 6 hours
- `6h-crypto-onchain` - Every 6 hours
- `6h-forex-sentiment` - Every 6 hours
- `6h-forex-technicals` - Every 6 hours
- `6h-options-flow` - Every 6 hours
- `6h-pattern-recognition` - Every 6 hours
- `6h-smart-money` - Every 6 hours

### Daily Market Data (Once per day)
- `daily-congressional-trades` - 22:15 UTC
- `daily-dark-pool` - 23:00 UTC
- `daily-earnings` - 23:30 UTC
- `daily-economic-calendar` - 23:45 UTC
- `daily-etf-flows` - 22:30 UTC
- `daily-finra-darkpool` - 23:15 UTC
- `daily-form4` - 22:00 UTC
- `daily-google-trends` - 00:00 UTC
- `daily-policy-feeds` - 22:45 UTC
- `daily-reddit-sentiment` - 00:30 UTC
- `daily-search-trends` - 00:15 UTC
- `daily-stocktwits` - 00:45 UTC

### Weekly Data (Fridays)
- `weekly-cot-cftc` - Fridays 23:15 UTC
- `weekly-cot-reports` - Fridays 23:00 UTC
- `weekly-fred-economics` - Fridays 23:30 UTC
- `weekly-job-postings` - Fridays 23:45 UTC

### Weekly Data (Saturdays)
- `weekly-patents` - Saturdays 00:00 UTC
- `weekly-supply-chain` - Saturdays 00:15 UTC

### Bi-Weekly Data
- `biweekly-short-interest` - 2nd and 4th Friday of month 00:30 UTC

---

## Testing Requirements

### Automated Testing
1. **Health Check Tests** (via `test-pipeline-sla`)
   - Success rate validation
   - Response time validation
   - Data freshness checks

2. **Integration Tests**
   - Data source connectivity
   - Fallback mechanism validation
   - Error handling verification

3. **Monitoring Tests**
   - Slack alert delivery
   - Success rate calculation accuracy
   - Staleness detection

### Manual Testing Checklist
- [x] Verify all 32 functions appear in monitoring dashboard
- [x] Confirm Slack alerts for sub-95% success rates
- [x] Test trigger-all-ingestions completes successfully
- [x] Validate user-initiated functions fail gracefully without input
- [x] Check ingest_logs table for all 32 function entries
- [x] Verify success notification when all functions above 95%
- [x] Confirm all 30 automated functions have cron jobs scheduled
- [ ] Validate all newly scheduled functions execute on schedule
- [ ] Verify data quality for each ingestion function
- [ ] Confirm all target tables receive data correctly

---

## Production Readiness Criteria

### Critical Requirements
✅ All 34 functions deployed  
✅ Monitoring coverage at 100% (32 data functions)  
✅ Slack alerting configured  
✅ Success rate threshold set at 95%  
✅ Retry logic implemented for flaky sources  
✅ Fallback mechanisms in place  
✅ User-initiated functions documented  
✅ All 30 automated functions have cron schedules  
✅ Success rate monitoring runs every 10 minutes  
⏳ Awaiting first runs for newly scheduled functions  

### Success Metrics
- **Overall Success Rate:** ≥95%
- **Alert Response Time:** <5 minutes
- **Data Freshness:** Within expected intervals
- **Monitoring Uptime:** 99.9%
- **Cron Job Execution:** 100% of scheduled jobs

---

## Maintenance & Support

### Daily Operations
1. Monitor Slack alerts for sub-95% functions
2. Review ingest_logs for failures
3. Validate data freshness
4. Check API usage/costs

### Weekly Reviews
1. Analyze success rate trends
2. Review fallback usage patterns
3. Optimize slow-performing functions
4. Update documentation
5. Verify new functions executed on schedule

### Monthly Audits
1. Comprehensive function health review
2. Data quality assessment
3. Cost optimization analysis
4. Performance tuning
5. Cron schedule optimization

---

## Emergency Response

### If Success Rate Drops Below 95%
1. Check Slack alert for specific function(s)
2. Review edge function logs for errors
3. Verify API key/credentials if external source
4. Enable fallback if available
5. Contact data source provider if outage
6. Update stakeholders via Slack

### If Multiple Functions Fail
1. Check Supabase health status
2. Verify Upstash Redis connectivity
3. Check Perplexity API status
4. Review network connectivity
5. Consider triggering manual run via `trigger-all-ingestions`
6. Check cron job status with `SELECT * FROM cron.job ORDER BY jobname`

### If Cron Jobs Stop Executing
1. Verify pg_cron extension is enabled
2. Check cron job status: `SELECT * FROM cron.job WHERE NOT active`
3. Review cron job run history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50`
4. Re-create cron jobs if necessary using setup script

---

## Related Documentation
- [ETL_DATA_SOURCES.md](./docs/ETL_DATA_SOURCES.md)
- [CRON_DEPLOYMENT.md](./docs/CRON_DEPLOYMENT.md)
- [MONITORING_GUIDE.md](./docs/MONITORING_GUIDE.md)
- [PRODUCTION_CERTIFICATION_100.md](./PRODUCTION_CERTIFICATION_100.md)
- [docs/setup_cron_jobs.sql](./docs/setup_cron_jobs.sql)

---

## Changelog
- **2025-11-27:** Complete cron coverage for all 30 automated functions
- **2025-11-27:** Added comprehensive function inventory (all 34 functions)
- **2025-11-27:** Updated monitoring to 100% coverage (32 data functions)
- **2025-11-27:** Documented all cron schedules and frequencies
- **2025-11-27:** Distinguished data vs support functions
- **2025-11-27:** Added status indicators for each function
