-- Add pg_cron job to run generate-signals-from-breaking-news every hour at :20
-- This was a critical gap: ingest-breaking-news runs hourly but signal generation
-- was never scheduled — no signals were ever auto-created from breaking news.
--
-- Runs at :20 so it fires after ingest-breaking-news (:00) has had time to complete.

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'generate-signals-from-breaking-news-hourly';

SELECT cron.schedule(
  'generate-signals-from-breaking-news-hourly',
  '20 * * * *',
  $$SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-signals-from-breaking-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.HwW5eYCqvAUKgb7_3oUpSPFWm0KQo83vKGAYB-YPpLE'
    ),
    body := '{}'::jsonb
  )$$
);
