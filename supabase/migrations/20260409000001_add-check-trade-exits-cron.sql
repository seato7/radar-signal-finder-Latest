-- Add pg_cron job to run check-trade-exits every 4 hours
-- Closes active trade signals that have hit stop loss, trailing stop, profit target, or expiry
-- FIX: This job was missing — signals were never auto-closed

-- Safety: remove any existing job with this name before creating
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'check-trade-exits-4h';

SELECT cron.schedule(
  'check-trade-exits-4h',
  '0 */4 * * *',
  $$SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/check-trade-exits',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.HwW5eYCqvAUKgb7_3oUpSPFWm0KQo83vKGAYB-YPpLE'
    ),
    body := '{}'::jsonb
  )$$
);

-- Backfill entry_date on existing rows where it was never set
-- Uses created_at as the best available proxy for when the signal was opened
UPDATE trade_signals
SET entry_date = created_at
WHERE entry_date IS NULL;
