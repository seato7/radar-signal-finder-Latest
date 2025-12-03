-- ============================================
-- OPTIMIZED Supabase Cron Job Setup v2.0
-- Cost-optimized ingestion pipeline - Perplexity minimized
-- ============================================
-- 
-- KEY CHANGES:
-- - Forex technicals now uses TwelveData (not Perplexity)
-- - Advanced technicals uses internal price DB (not Perplexity)
-- - Breaking news reduced to every 6 hours
-- - Crypto on-chain reduced to every 12 hours
-- - News sentiment reduced to every 12 hours
-- 
-- Price ingestion handled by Railway backend using TwelveData
--
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- REMOVE DEPRECATED JOBS
-- ============================================

SELECT cron.unschedule('15min-prices-ingest') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = '15min-prices-ingest'
);

SELECT cron.unschedule('daily-market-close-prices') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-market-close-prices'
);

-- Remove old frequent schedules
SELECT cron.unschedule('3h-breaking-news') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = '3h-breaking-news'
);

SELECT cron.unschedule('6h-crypto-onchain') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = '6h-crypto-onchain'
);

SELECT cron.unschedule('6h-news-sentiment') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = '6h-news-sentiment'
);

-- ============================================
-- LOW FREQUENCY PERPLEXITY JOBS (12 hours)
-- These REQUIRE Perplexity - no alternative
-- ============================================

-- Breaking news (every 12 hours - reduced from 3h)
SELECT cron.schedule(
  '12h-breaking-news',
  '0 */12 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-breaking-news',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Crypto On-Chain (every 12 hours - reduced from 6h)
-- REQUIRES Perplexity for unique blockchain metrics
SELECT cron.schedule(
  '12h-crypto-onchain',
  '15 */12 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-crypto-onchain',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- News Sentiment (every 12 hours - reduced from 6h)
SELECT cron.schedule(
  '12h-news-sentiment',
  '30 */12 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-news-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- STANDARD FREQUENCY (6 hours) - Non-Perplexity
-- ============================================

-- FRED Economic Data (uses FRED API)
SELECT cron.schedule(
  '6h-fred-economics',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-fred-economics',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- 13F Holdings (uses SEC EDGAR)
SELECT cron.schedule(
  '6h-13f-holdings',
  '10 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-13f-holdings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Earnings Reports (uses Alpha Vantage)
SELECT cron.schedule(
  '6h-earnings',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-earnings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Google Trends (uses SerpAPI/free tier)
SELECT cron.schedule(
  '6h-google-trends',
  '20 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-google-trends',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Options Flow (uses CBOE/free data)
SELECT cron.schedule(
  '6h-options-flow',
  '25 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-options-flow',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Short Interest (uses FINRA)
SELECT cron.schedule(
  '6h-short-interest',
  '35 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-short-interest',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Smart Money (uses SEC EDGAR)
SELECT cron.schedule(
  '6h-smart-money',
  '40 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-smart-money',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Dark Pool (uses FINRA)
SELECT cron.schedule(
  '6h-dark-pool',
  '45 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-dark-pool',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Forex Technicals (NOW uses TwelveData - NO Perplexity)
SELECT cron.schedule(
  '6h-forex-technicals',
  '50 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- DAILY JOBS (Once per day)
-- ============================================

-- Form 4 Insider Trading (daily at 6AM UTC) - uses SEC EDGAR
SELECT cron.schedule(
  'daily-form4',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-form4',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Policy Feeds (daily at 7AM UTC) - uses RSS feeds
SELECT cron.schedule(
  'daily-policy-feeds',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-policy-feeds',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ETF Flows (daily at 8AM UTC) - uses Alpha Vantage
SELECT cron.schedule(
  'daily-etf-flows',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-etf-flows',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Congressional Trades (daily at 9AM UTC) - uses Capitol Trades
SELECT cron.schedule(
  'daily-congressional-trades',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-congressional-trades',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Job Postings (daily at 10AM UTC) - uses Adzuna API
SELECT cron.schedule(
  'daily-job-postings',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-job-postings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Patents (daily at 11AM UTC) - uses USPTO
SELECT cron.schedule(
  'daily-patents',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-patents',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Supply Chain (daily at 12PM UTC) - uses news aggregation
SELECT cron.schedule(
  'daily-supply-chain',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-supply-chain',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Advanced Technicals (daily - uses INTERNAL PRICE DB, no external API)
SELECT cron.schedule(
  'daily-advanced-technicals',
  '15 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-advanced-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Pattern Recognition (daily - uses INTERNAL PRICE DB, no external API)
SELECT cron.schedule(
  'daily-pattern-recognition',
  '30 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-pattern-recognition',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Reddit Sentiment (daily at 2PM UTC) - uses Reddit API
SELECT cron.schedule(
  'daily-reddit-sentiment',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-reddit-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Forex Sentiment (daily at 3PM UTC) - uses multiple sources
SELECT cron.schedule(
  'daily-forex-sentiment',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- WEEKLY JOBS (Once per week)
-- ============================================

-- COT Reports (Fridays at 11PM UTC) - uses CFTC data
SELECT cron.schedule(
  'weekly-cot-reports',
  '0 23 * * 5',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-cot-cftc',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- MONITORING & MAINTENANCE
-- ============================================

-- Daily ingestion digest (daily at 11PM UTC)
SELECT cron.schedule(
  'daily-ingestion-digest',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/daily-ingestion-digest',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Cleanup orphaned logs (daily at 3AM UTC)
SELECT cron.schedule(
  'daily-cleanup-logs',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/cleanup-orphaned-logs',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Watchdog health check (every hour)
SELECT cron.schedule(
  'hourly-watchdog',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/watchdog-ingestion-health',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- SIGNAL SCORES - Computes buy/sell ratings per asset (every 6 hours)
SELECT cron.schedule(
  '6h-signal-scores',
  '45 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/compute-signal-scores',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Theme scores computation (every 6 hours, after signal scores)
SELECT cron.schedule(
  '6h-theme-scores',
  '50 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/compute-theme-scores',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Generate alerts (every 6 hours after theme scores)
SELECT cron.schedule(
  '6h-generate-alerts',
  '55 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- VIEW ALL SCHEDULED JOBS
-- ============================================
-- SELECT * FROM cron.job ORDER BY jobname;

-- ============================================
-- COST SAVINGS SUMMARY
-- ============================================
-- 
-- Perplexity Usage BEFORE optimization:
-- - Breaking news: 8 calls/day (3h interval)
-- - Crypto on-chain: 4 calls/day (6h interval)
-- - News sentiment: 4 calls/day (6h interval)
-- - Forex technicals: 4 calls/day (6h interval) ❌ NOW USES TWELVEDATA
-- - Advanced technicals: Uses DB prices (no Perplexity)
-- TOTAL: ~20 Perplexity calls/day
--
-- Perplexity Usage AFTER optimization:
-- - Breaking news: 2 calls/day (12h interval)
-- - Crypto on-chain: 2 calls/day (12h interval)
-- - News sentiment: 2 calls/day (12h interval)
-- - Forex technicals: 0 calls (uses TwelveData)
-- - Advanced technicals: 0 calls (uses DB prices)
-- TOTAL: ~6 Perplexity calls/day
--
-- SAVINGS: 70% reduction in Perplexity API usage
-- Estimated monthly savings: $30-50/month
--
