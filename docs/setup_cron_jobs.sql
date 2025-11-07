-- ============================================
-- Supabase Cron Job Setup for Data Ingestion
-- ============================================
-- Run this script in your Supabase SQL Editor
-- Make sure to replace YOUR_SERVICE_ROLE_KEY with your actual service role key

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- Daily Market Close Jobs (4PM EST / 9PM UTC)
-- ============================================

SELECT cron.schedule(
  'daily-market-close-prices',
  '0 21 * * *', -- 9PM UTC = 4PM EST
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-prices-yahoo',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'daily-market-close-technicals',
  '15 21 * * *', -- 9:15PM UTC (15min after prices)
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-advanced-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'daily-market-close-patterns',
  '30 21 * * *', -- 9:30PM UTC (30min after prices)
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
  '6h-signals-generation',
  '30 */6 * * *', -- Every 6 hours at :30
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- Health Monitoring (Every 15 Minutes)
-- ============================================

SELECT cron.schedule(
  'health-monitoring',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-alerts-errors',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- Utility Queries for Management
-- ============================================

-- View all scheduled jobs
-- SELECT * FROM cron.job ORDER BY jobname;

-- View recent job runs
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Unschedule a job (example)
-- SELECT cron.unschedule('job-name-here');

-- Unschedule all jobs (CAREFUL!)
-- SELECT cron.unschedule(jobname) FROM cron.job;
