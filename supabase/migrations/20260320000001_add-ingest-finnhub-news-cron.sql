-- Add pg_cron schedule for ingest-finnhub-news (every 30 minutes)
-- Polls Finnhub REST API as fallback/supplement to the finnhub-webhook real-time feed
-- Filters to last 35 minutes of articles to avoid re-processing across runs

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('ingest-finnhub-news', 'ingest-finnhub-news-30min');

SELECT cron.schedule(
  'ingest-finnhub-news-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-finnhub-news',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
