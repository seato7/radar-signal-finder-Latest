-- Fix: ingest-finnhub-news-30min cron was scheduled with the anon key.
-- Re-schedule using service_role key to match all other cron jobs.
-- Reference: migration 20260320000001 accidentally used the anon JWT.

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('ingest-finnhub-news', 'ingest-finnhub-news-30min');

SELECT cron.schedule(
  'ingest-finnhub-news-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-finnhub-news',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.vXy9OmULGwrb7lKLuCxCx6HpT2M-lNpK97pn63Y-E8Q"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
