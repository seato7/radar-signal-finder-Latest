-- ============================================
-- OPTIMIZED Supabase Cron Job Setup
-- Cost-optimized ingestion pipeline for Opportunity Radar
-- ============================================
-- 
-- NOTE: Price ingestion is now handled by Railway backend using Twelve Data API
-- The ingest-prices-yahoo function has been DEPRECATED and removed from cron
-- 
-- New price refresh schedule (via Railway backend):
-- - Crypto: every 10 minutes
-- - Forex: every 10 minutes  
-- - Stocks: every 30 minutes
-- - Commodities: every 30 minutes
--
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- REMOVE DEPRECATED YAHOO PRICE CRON JOB
-- ============================================

-- Drop the old Yahoo price ingestion cron job if it exists
SELECT cron.unschedule('15min-prices-ingest') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = '15min-prices-ingest'
);

SELECT cron.unschedule('daily-market-close-prices') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-market-close-prices'
);

-- ============================================
-- MEDIUM FREQUENCY (3 hours)
-- ============================================

-- Breaking news (every 3 hours - down from 15 min)
SELECT cron.schedule(
  '3h-breaking-news',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-breaking-news',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- STANDARD FREQUENCY (6 hours)
-- ============================================

-- FRED Economic Data
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

-- Crypto On-Chain Metrics
SELECT cron.schedule(
  '6h-crypto-onchain',
  '5 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-crypto-onchain',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- 13F Holdings
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

-- Earnings Reports
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

-- Google Trends
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

-- Options Flow
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

-- News Sentiment
SELECT cron.schedule(
  '6h-news-sentiment',
  '30 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-news-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Short Interest
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

-- Smart Money
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

-- Dark Pool
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

-- ============================================
-- DAILY JOBS (Once per day)
-- ============================================

-- Form 4 Insider Trading (daily at 6AM UTC)
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

-- Policy Feeds (daily at 7AM UTC)
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

-- ETF Flows (daily at 8AM UTC)
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

-- Congressional Trades (daily at 9AM UTC)
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

-- Job Postings (daily at 10AM UTC)
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

-- Patents (daily at 11AM UTC)
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

-- Supply Chain (daily at 12PM UTC)
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

-- Advanced Technicals (daily at market close - 9PM UTC)
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

-- Pattern Recognition (daily at market close - 9:30PM UTC)
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

-- ============================================
-- WEEKLY JOBS (Once per week)
-- ============================================

-- COT Reports (Fridays at 11PM UTC)
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

-- Theme scores computation (every 6 hours)
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
-- NOTES
-- ============================================
-- 
-- Price ingestion is NO LONGER handled by Supabase cron!
-- It runs on the Railway backend using Twelve Data API with tiered intervals:
-- - Crypto/Forex: every 10 minutes
-- - Stocks/Commodities: every 30 minutes
--
-- To check Railway price scheduler status:
-- GET /api/prices/debug/price-ingestion-status
--
-- To manually trigger price ingestion:
-- POST /api/prices/scheduler/trigger
--
-- Key Changes from previous version:
-- ❌ REMOVED: ingest-prices-yahoo (now handled by Railway + Twelve Data)
-- ✅ All other ingestion functions remain on Supabase cron
-- 
