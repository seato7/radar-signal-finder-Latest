-- Fix: ingest-advanced-technicals and ingest-search-trends cron jobs were scheduled
-- with the anon key. Re-schedule using service_role key to match all other cron jobs.
-- Reference: migration 20260316120000 accidentally used the anon JWT.

-- Unschedule existing jobs (idempotent)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'ingest-advanced-technicals-6hourly',
  'ingest-search-trends-daily'
);

-- Re-schedule ingest-advanced-technicals with service_role key (every 6 hours)
SELECT cron.schedule(
  'ingest-advanced-technicals-6hourly',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-advanced-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Re-schedule ingest-search-trends with service_role key (daily at 6 AM UTC)
SELECT cron.schedule(
  'ingest-search-trends-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-search-trends',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
