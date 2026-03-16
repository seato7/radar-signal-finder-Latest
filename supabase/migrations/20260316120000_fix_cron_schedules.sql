-- Fix missing cron schedules for ingest-advanced-technicals and ingest-search-trends
-- Also ensure ingest-economic-calendar cron is fully removed (was injecting fake data)
-- Reference: diagnostics 2026-03-16 confirmed these were frozen/dead

-- ============================================================================
-- Safety: unschedule first to avoid duplicate errors (idempotent)
-- ============================================================================
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'ingest-advanced-technicals',
  'ingest-advanced-technicals-6hourly',
  'ingest-search-trends',
  'ingest-search-trends-daily',
  'ingest-economic-calendar',
  'ingest-economic-calendar-daily'
);

-- ============================================================================
-- Re-schedule ingest-advanced-technicals (every 6 hours)
-- Was unscheduled in Dec 2024 due to synthetic data bug (now fixed in v5)
-- ============================================================================
SELECT cron.schedule(
  'ingest-advanced-technicals-6hourly',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-advanced-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- ============================================================================
-- Re-schedule ingest-search-trends (daily at 6 AM UTC)
-- Was dead since Jan 26 - adding back to cron
-- ============================================================================
SELECT cron.schedule(
  'ingest-search-trends-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-search-trends',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- ============================================================================
-- NOTE: ingest-economic-calendar intentionally NOT re-added here.
-- The function is disabled (returns early without inserting data).
-- It was injecting the same hardcoded NFP=187000/CPI=3.2% data daily.
-- Re-enable only after wiring up a real economic calendar data source.
-- ============================================================================
