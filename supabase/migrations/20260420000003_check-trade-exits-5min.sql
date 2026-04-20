-- Increase check-trade-exits frequency from every 4h to every 5min for near-real-time
-- exit detection. Paired with in-function Tavily price verification (200/day cap) so
-- signals no longer get stuck when the prices table is stale.
--
-- Also cleans up bad historical rows (zero/null entry_price) from pre-zero-price-filter
-- runs. These rows can never produce meaningful pnl_pct and distort the active set.

-- 1. Remove the old 4-hour job
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'check-trade-exits-4h';

-- 2. Remove any prior 5-min job (idempotent re-run safety)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'check-trade-exits-5min';

-- 3. Schedule the 5-minute check
SELECT cron.schedule(
  'check-trade-exits-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/check-trade-exits',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.HwW5eYCqvAUKgb7_3oUpSPFWm0KQo83vKGAYB-YPpLE'
    ),
    body := '{}'::jsonb
  )$$
);

-- 4. Purge bad historical signals (zero or null entry_price).
-- These are from pre-filter runs where the prices table returned a zero close and the
-- generator didn't reject it. They can never produce meaningful pnl_pct.
DELETE FROM trade_signals
WHERE entry_price IS NULL OR entry_price <= 0;
