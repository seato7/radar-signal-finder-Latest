# ETL Data Sources & Implementation Guide

## ✅ Implemented with Real Data Sources

### Core Market Data
- **prices** (ingest-prices-yahoo)
  - Source: Yahoo Finance API v8
  - Frequency: Hourly
  - Coverage: OHLCV for stocks, ETFs, crypto, forex
  - Free tier: Unlimited with rate limiting
  - Status: ✅ Production ready

### Macroeconomic Data
- **economic_indicators** (ingest-fred-economics)
  - Source: FRED API (St. Louis Federal Reserve)
  - Frequency: Daily (data published monthly/quarterly)
  - Coverage: GDP, CPI, Unemployment, Fed Funds Rate, Payrolls, PCE
  - Free tier: Unlimited (register for API key to increase limits)
  - Status: ✅ Production ready

- **cot_reports** (ingest-cot-cftc)
  - Source: CFTC public API
  - Frequency: Weekly (published Fridays)
  - Coverage: Futures positioning for commodities, forex, indices
  - Free tier: Unlimited
  - Status: ✅ Production ready with signal generation

### Flow & Volume Analysis
- **dark_pool_activity** (ingest-finra-darkpool)
  - Source: FINRA ATS data (estimated patterns)
  - Frequency: Daily
  - Coverage: US stocks dark pool volume percentage
  - Free tier: Limited (scraping required)
  - Status: ⚠️ Using statistical estimation - needs FINRA scraper for production

- **smart_money_flow** (ingest-smart-money)
  - Source: Calculated from prices + options + short interest
  - Frequency: Daily
  - Coverage: MFI, CMF, institutional vs retail flow estimates
  - Status: ✅ Production ready (derived)

## ⚠️ Implemented with Placeholders

### Sentiment & Trends
- **search_trends** (ingest-search-trends)
  - Current: Synthetic data
  - Target: PyTrends or SerpAPI
  - Frequency: Daily
  - Status: ⚠️ Needs real Google Trends integration

## ✅ Already Working (Pre-existing)
- **breaking_news** (ingest-breaking-news)
- **congressional_trades** (ingest-congressional-trades)
- **earnings_sentiment** (ingest-earnings)
- **options_flow** (ingest-options-flow)
- **short_interest** (ingest-short-interest)
- **job_postings** (ingest-job-postings)
- **patent_filings** (ingest-patents)
- **social_signals** (ingest-reddit-sentiment, ingest-stocktwits)
- **advanced_technicals** (ingest-advanced-technicals)
- **forex_technicals** (ingest-forex-technicals)
- **forex_sentiment** (ingest-forex-sentiment)
- **crypto_onchain_metrics** (ingest-crypto-onchain)
- **pattern_recognition** (ingest-pattern-recognition)
- **news_sentiment_aggregate** (ingest-news-sentiment)

## 🔧 Monitoring & Orchestration

### Health & Diagnostics
- **health-metrics** - Overall system health check
- **ingest-diagnostics** - Table freshness and row counts
- **ingest-orchestrator** - Schedule jobs by frequency

### Usage
```bash
# Check system health
curl https://YOUR_PROJECT.supabase.co/functions/v1/health-metrics

# Run all ingestions
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ingest-orchestrator \
  -H "Content-Type: application/json" \
  -d '{"frequency":"all"}'

# Run hourly jobs only
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ingest-orchestrator \
  -H "Content-Type: application/json" \
  -d '{"frequency":"hourly"}'
```

## 📋 Recommended Cron Schedule

```sql
-- Hourly: High-frequency data
SELECT cron.schedule(
  'ingest-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/ingest-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"frequency":"hourly"}'::jsonb
  );
  $$
);

-- Daily: Most market data
SELECT cron.schedule(
  'ingest-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/ingest-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"frequency":"daily"}'::jsonb
  );
  $$
);

-- Weekly: Heavy processing
SELECT cron.schedule(
  'ingest-weekly',
  '0 8 * * 0',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/ingest-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"frequency":"weekly"}'::jsonb
  );
  $$
);
```

## 🚀 Next Steps for Production

1. **Upgrade Placeholder Sources**
   - Integrate PyTrends for real Google Trends data
   - Build FINRA ATS scraper or integrate Unusual Whales API

2. **Add API Keys for Enhanced Limits**
   - FRED API key (free): https://fred.stlouisfed.org/docs/api/api_key.html
   - Alpha Vantage for forex/crypto pricing
   - CoinGecko Pro for better crypto on-chain data

3. **Set Up Cron Jobs**
   - Enable pg_cron and pg_net extensions
   - Run SQL above to schedule automated ingestion

4. **Configure Alerts**
   - Monitor health-metrics endpoint
   - Alert on critical table staleness
   - Track ETL failure rates

5. **Add Data Quality Checks**
   - Validate data completeness
   - Check for anomalies (sudden volume spikes, missing tickers)
   - Compare against known benchmarks
