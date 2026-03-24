-- Add pg_cron jobs for the momentum signal pipeline.
-- Neither compute-price-coverage-daily nor generate-signals-from-momentum had a
-- scheduled cron, causing zero momentum signals since the pipeline was built.
--
-- Scheduling:
--   12:00 UTC — compute-price-coverage-daily (before US market open at ~13:30 UTC)
--   14:00 UTC — generate-signals-from-momentum (after price coverage is fresh)
--
-- Both functions enforce CRON_SHARED_SECRET via x-cron-secret header.
-- current_setting('app.cron_secret', true) returns NULL if not configured,
-- which is safe: the functions skip the check when CRON_SHARED_SECRET is unset.

-- Unschedule first to make this migration idempotent
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'compute-price-coverage-daily',
  'generate-signals-from-momentum-daily'
);

-- Run price coverage daily at 12:00 UTC (before US market open)
SELECT cron.schedule(
  'compute-price-coverage-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/compute-price-coverage-daily',
    headers:=(
      '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q", "x-cron-secret": "' ||
      coalesce(current_setting('app.cron_secret', true), '') ||
      '"}'
    )::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Run momentum signal generation at 14:00 UTC (after price coverage completes)
SELECT cron.schedule(
  'generate-signals-from-momentum-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-signals-from-momentum',
    headers:=(
      '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q", "x-cron-secret": "' ||
      coalesce(current_setting('app.cron_secret', true), '') ||
      '"}'
    )::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
