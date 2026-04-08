-- Add pg_cron job to run generate-trade-signals every 4 hours
-- No migration existed for this — schedule was missing from cron.job entirely

-- Safety: remove any existing job with this name before creating
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'generate-trade-signals-4h';

SELECT cron.schedule(
  'generate-trade-signals-4h',
  '0 */4 * * *',
  $$SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-trade-signals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.HwW5eYCqvAUKgb7_3oUpSPFWm0KQo83vKGAYB-YPpLE'
    ),
    body := '{}'::jsonb
  )$$
);
