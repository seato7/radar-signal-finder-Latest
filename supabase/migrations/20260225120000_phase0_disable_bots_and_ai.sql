-- Phase 0.1: Reduce wasted cron invocations and disable high-cost ingestors

-- Disable bot-ticker scheduled every minute; we'll reschedule with lower frequency later
SELECT cron.unschedule('bot-ticker-every-minute');

-- Disable ingest-ai-research (AI research ingestor making hundreds of Lovable AI calls per day)
SELECT cron.unschedule('ingest-ai-research');

-- Disable bot-scheduler completely until real bots exist
-- This prevents minute-by-minute heartbeats from burning invocations when no bots are active
-- Note: schedule names follow the pattern used in earlier migrations
SELECT cron.unschedule('bot-ticker-every-minute');

-- OPTIONAL: Reschedule bot-scheduler to run every 15 minutes instead of every minute
-- Uncomment the section below if you want to keep bot polling but at a lower frequency.
-- SELECT cron.schedule(
--   'bot-ticker-every-15m',
--   '*/15 * * * *',
--   $$
--   SELECT
--     net.http_post(
--         url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/bot-scheduler',
--         headers := '{"Content-Type": "application/json", "Authorization": "<SERVICE_TOKEN>"}'::jsonb,
--         body := concat('{"time": "', now(), '"}')::jsonb
--     ) as request_id;
--   $$
-- );

-- Log the changes
INSERT INTO function_status (function_name, status, executed_at, metadata)
VALUES (
  'phase-0.1-cron-adjustments',
  'success',
  now(),
  jsonb_build_object(
    'action', 'DISABLED_BOT_SCHEDULER_AND_AI_RESEARCH_CRONS',
    'timestamp', now()
  )
);