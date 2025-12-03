-- ============================================
-- Supabase Cron Job Setup for Data Ingestion
-- ============================================
-- Run this script in your Supabase SQL Editor
-- Make sure to replace YOUR_SERVICE_ROLE_KEY with your actual service role key
--
-- NOTE: Price ingestion has been migrated to Railway backend using Twelve Data API
-- The ingest-prices-yahoo function is DEPRECATED and should not be scheduled
--
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- REMOVE DEPRECATED YAHOO PRICE CRON JOBS
-- ============================================

-- Drop any old Yahoo price cron jobs
SELECT cron.unschedule('daily-market-close-prices') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-market-close-prices'
);

SELECT cron.unschedule('15min-prices-ingest') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = '15min-prices-ingest'
);

-- ============================================
-- Daily Market Close Jobs (4PM EST / 9PM UTC)
-- NOTE: Prices are now handled by Railway backend
-- ============================================

SELECT cron.schedule(
  'daily-market-close-technicals',
  '15 21 * * *', -- 9:15PM UTC (15min after market close)
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-advanced-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'daily-market-close-patterns',
  '30 21 * * *', -- 9:30PM UTC (30min after market close)
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-pattern-recognition',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- Weekly Friday Jobs (6PM EST / 11PM UTC)
-- ============================================

SELECT cron.schedule(
  'weekly-cot-reports',
  '0 23 * * 5', -- Fridays at 11PM UTC = 6PM EST
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-cot-cftc',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'weekly-fred-economics',
  '15 23 * * 5', -- Fridays at 11:15PM UTC
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-fred-economics',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- Every 6 Hours Jobs
-- ============================================

SELECT cron.schedule(
  '6h-ai-research',
  '0 */6 * * *', -- Every 6 hours at :00
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-ai-research',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  '6h-forex-sentiment',
  '15 */6 * * *', -- Every 6 hours at :15
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  '6h-forex-technicals',
  '30 */6 * * *', -- Every 6 hours at :30
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  '6h-theme-scores',
  '45 */6 * * *', -- Every 6 hours at :45
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/compute-theme-scores',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- Every 3 Hours Jobs  
-- ============================================

SELECT cron.schedule(
  '3h-breaking-news',
  '0 */3 * * *', -- Every 3 hours
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-breaking-news',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- NOTES
-- ============================================
-- 
-- PRICE INGESTION IS NOW ON RAILWAY BACKEND (NOT SUPABASE CRON)
-- 
-- The Railway backend handles price ingestion using Twelve Data API:
-- - Crypto: every 10 minutes
-- - Forex: every 10 minutes
-- - Stocks: every 30 minutes
-- - Commodities: every 30 minutes
--
-- To check status: GET /api/prices/debug/price-ingestion-status
-- To trigger manually: POST /api/prices/scheduler/trigger
--
-- DO NOT re-add ingest-prices-yahoo to cron - it is deprecated!
--
