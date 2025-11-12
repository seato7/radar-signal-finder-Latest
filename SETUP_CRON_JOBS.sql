-- ⏰ Cron Job Setup for Ingestion Pipeline Monitoring
-- Run this SQL to enable automated cleanup and daily reporting

-- Enable pg_cron and pg_net extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 🧹 Hourly Cleanup of Orphaned Logs (runs at minute 0 of every hour)
SELECT cron.schedule(
  'cleanup-orphaned-logs',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/cleanup-orphaned-logs',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 📊 Daily Ingestion Digest (runs at 9AM AEST = 11PM UTC previous day)
SELECT cron.schedule(
  'daily-ingestion-digest',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/daily-ingestion-digest',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 🔍 View scheduled cron jobs
SELECT * FROM cron.job ORDER BY schedule;

-- 📝 View cron job run history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- ❌ To unschedule a job (if needed):
-- SELECT cron.unschedule('cleanup-orphaned-logs');
-- SELECT cron.unschedule('daily-ingestion-digest');
