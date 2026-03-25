-- Add pg_cron jobs for the EPS revisions and company fundamentals pipelines.
--
-- Scheduling (all weekly on Sunday UTC):
--   06:00 — ingest-finnhub-eps-revisions   (200 tickers × 300ms ≈ 60s)
--   06:30 — generate-signals-from-eps-revisions
--   07:00 — ingest-finnhub-fundamentals    (200 tickers × 200ms ≈ 40s)
--   07:30 — generate-signals-from-fundamentals
--
-- Fundamentals change slowly so weekly cadence is appropriate and stays well
-- within Finnhub free-tier limits (60 RPM; sequential calls with delay).

-- Unschedule first to make this migration idempotent
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'ingest-finnhub-eps-revisions-weekly',
  'generate-signals-from-eps-revisions-weekly',
  'ingest-finnhub-fundamentals-weekly',
  'generate-signals-from-fundamentals-weekly'
);

-- EPS revisions ingest — Sunday 06:00 UTC
SELECT cron.schedule(
  'ingest-finnhub-eps-revisions-weekly',
  '0 6 * * 0',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-finnhub-eps-revisions',
    headers:=(
      '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q", "x-cron-secret": "' ||
      coalesce(current_setting('app.cron_secret', true), '') ||
      '"}'
    )::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- EPS revisions signal generation — Sunday 06:30 UTC
SELECT cron.schedule(
  'generate-signals-from-eps-revisions-weekly',
  '30 6 * * 0',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-signals-from-eps-revisions',
    headers:=(
      '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q", "x-cron-secret": "' ||
      coalesce(current_setting('app.cron_secret', true), '') ||
      '"}'
    )::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Company fundamentals ingest — Sunday 07:00 UTC
SELECT cron.schedule(
  'ingest-finnhub-fundamentals-weekly',
  '0 7 * * 0',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-finnhub-fundamentals',
    headers:=(
      '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q", "x-cron-secret": "' ||
      coalesce(current_setting('app.cron_secret', true), '') ||
      '"}'
    )::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Company fundamentals signal generation — Sunday 07:30 UTC
SELECT cron.schedule(
  'generate-signals-from-fundamentals-weekly',
  '30 7 * * 0',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-signals-from-fundamentals',
    headers:=(
      '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q", "x-cron-secret": "' ||
      coalesce(current_setting('app.cron_secret', true), '') ||
      '"}'
    )::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
