-- pg_cron schedule for compute-ai-scores (every 2 hours)
-- Runs LLM chain-of-thought scoring for top 200 assets
-- 6-hour cache inside the function prevents redundant LLM calls

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('compute-ai-scores', 'compute-ai-scores-2hourly');

SELECT cron.schedule(
  'compute-ai-scores-2hourly',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/compute-ai-scores',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
