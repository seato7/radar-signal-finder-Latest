-- ============================================
-- COMPREHENSIVE Supabase Cron Job Setup
-- ============================================
-- Run this script in your Supabase SQL Editor
-- Replace YOUR_SERVICE_ROLE_KEY with your actual service role key
-- Find it at: Settings > API > service_role key (secret)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- HOURLY JOBS (Real-time data)
-- ============================================

-- Prices ingestion (every hour during market hours)
SELECT cron.schedule(
  'hourly-prices-ingest',
  '0 14-21 * * 1-5', -- Mon-Fri, 2PM-9PM UTC (market hours)
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-prices-yahoo',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Breaking news (every hour)
SELECT cron.schedule(
  'hourly-breaking-news',
  '15 * * * *', -- Every hour at :15
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-breaking-news',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- DAILY MARKET CLOSE JOBS (4PM EST / 9PM UTC)
-- ============================================

-- Advanced technical indicators
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

-- Pattern recognition
SELECT cron.schedule(
  'daily-pattern-recognition',
  '20 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-pattern-recognition',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Dark pool activity
SELECT cron.schedule(
  'daily-dark-pool',
  '25 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-dark-pool',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Smart money flow
SELECT cron.schedule(
  'daily-smart-money',
  '30 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-smart-money',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- News sentiment aggregation
SELECT cron.schedule(
  'daily-news-sentiment',
  '35 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-news-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Forex technicals
SELECT cron.schedule(
  'daily-forex-technicals',
  '40 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Crypto on-chain metrics
SELECT cron.schedule(
  'daily-crypto-onchain',
  '45 21 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-crypto-onchain',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- WEEKLY JOBS (Fridays at 6PM EST / 11PM UTC)
-- ============================================

-- COT reports
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

-- FRED economic data
SELECT cron.schedule(
  'weekly-fred-economics',
  '15 23 * * 5',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-fred-economics',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- EVERY 6 HOURS (Market intelligence)
-- ============================================

-- AI research reports
SELECT cron.schedule(
  '6h-ai-research',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-ai-research',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Forex sentiment
SELECT cron.schedule(
  '6h-forex-sentiment',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Signal generation (alerts)
SELECT cron.schedule(
  '6h-signals-generation',
  '30 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Theme discovery
SELECT cron.schedule(
  '6h-theme-discovery',
  '45 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/mine-and-discover-themes',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- HEALTH MONITORING (Every 15 Minutes)
-- ============================================

SELECT cron.schedule(
  'health-monitoring',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-alerts-errors',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- UTILITY QUERIES FOR MANAGEMENT
-- ============================================

-- View all scheduled jobs
-- SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- View recent job runs with errors
-- SELECT * FROM cron.job_run_details 
-- WHERE status != 'succeeded' 
-- ORDER BY start_time DESC LIMIT 20;

-- Unschedule a specific job
-- SELECT cron.unschedule('job-name-here');

-- Unschedule ALL jobs (CAREFUL!)
-- SELECT cron.unschedule(jobname) FROM cron.job;

-- Check last run times
-- SELECT 
--   j.jobname,
--   j.schedule,
--   MAX(r.start_time) as last_run,
--   MAX(CASE WHEN r.status = 'succeeded' THEN r.start_time END) as last_success
-- FROM cron.job j
-- LEFT JOIN cron.job_run_details r ON j.jobid = r.jobid
-- GROUP BY j.jobname, j.schedule
-- ORDER BY last_run DESC;
