-- ============================================================
-- MANUAL INGESTION REMINDERS - CRON SCHEDULE
-- ============================================================
-- Run this in Supabase Dashboard > SQL Editor to set up reminders
-- These will send Slack notifications for manual data tasks

-- ============================================================
-- 1. QUARTERLY 13F HOLDINGS REMINDERS
-- Schedule: 10 days before each quarterly deadline
-- ============================================================

-- Q1 Deadline (May 15) - Remind on May 5
SELECT cron.schedule(
  '13f-reminder-q1',
  '0 9 5 5 *',  -- May 5th at 9 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/remind-manual-ingestion',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"reminderType": "13f-holdings"}'::jsonb
  );
  $$
);

-- Q2 Deadline (Aug 14) - Remind on Aug 4
SELECT cron.schedule(
  '13f-reminder-q2',
  '0 9 4 8 *',  -- Aug 4th at 9 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/remind-manual-ingestion',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"reminderType": "13f-holdings"}'::jsonb
  );
  $$
);

-- Q3 Deadline (Nov 14) - Remind on Nov 4
SELECT cron.schedule(
  '13f-reminder-q3',
  '0 9 4 11 *',  -- Nov 4th at 9 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/remind-manual-ingestion',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"reminderType": "13f-holdings"}'::jsonb
  );
  $$
);

-- Q4 Deadline (Feb 14) - Remind on Feb 4
SELECT cron.schedule(
  '13f-reminder-q4',
  '0 9 4 2 *',  -- Feb 4th at 9 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/remind-manual-ingestion',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"reminderType": "13f-holdings"}'::jsonb
  );
  $$
);

-- ============================================================
-- 2. WEEKLY DATA QUALITY CHECK
-- Schedule: Every Monday at 9 AM UTC
-- ============================================================
SELECT cron.schedule(
  'weekly-data-quality-check',
  '0 9 * * 1',  -- Every Monday at 9 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/remind-manual-ingestion',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"reminderType": "data-quality-check"}'::jsonb
  );
  $$
);

-- ============================================================
-- 3. MONTHLY PIPELINE REVIEW
-- Schedule: First of every month at 9 AM UTC
-- ============================================================
SELECT cron.schedule(
  'monthly-pipeline-review',
  '0 9 1 * *',  -- 1st of every month at 9 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/remind-manual-ingestion',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"reminderType": "monthly-review"}'::jsonb
  );
  $$
);

-- ============================================================
-- VIEW SCHEDULED JOBS
-- ============================================================
-- SELECT * FROM cron.job WHERE jobname LIKE '%reminder%' OR jobname LIKE '%review%' OR jobname LIKE '%quality%';

-- ============================================================
-- TO REMOVE A REMINDER (if needed)
-- ============================================================
-- SELECT cron.unschedule('13f-reminder-q1');
-- SELECT cron.unschedule('weekly-data-quality-check');
-- SELECT cron.unschedule('monthly-pipeline-review');
