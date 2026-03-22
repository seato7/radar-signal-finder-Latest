-- Re-enable compute-ai-scores cron (every 2 hours)
-- compute-ai-scores was migrated to callGemini (direct Gemini API) in the same batch as this migration.
-- Safe to re-enable now that it no longer hits the Lovable gateway.

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('compute-ai-scores', 'compute-ai-scores-2hourly');

SELECT cron.schedule(
  'compute-ai-scores-2hourly',
  '0 */2 * * *',
  $SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/compute-ai-scores',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ'),
    body := '{}'::jsonb
  );$
);
