-- Reduce compute-ai-scores cron from every 2 hours to once daily at 22:00 UTC.
-- On-demand scoring (triggered by generate-signals functions) handles intraday scoring.
-- Job 493 is the compute-ai-scores pg_cron job — verify with:
--   SELECT jobid, jobname, schedule FROM cron.job WHERE jobname ILIKE '%compute-ai%';
SELECT cron.alter_job(493, schedule := '0 22 * * *');
