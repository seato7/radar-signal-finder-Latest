-- Documents the grade-predictions-1d pg_cron job (job ID 486, created manually Mar 16 2026)
-- Schedule: daily at 6am UTC
-- This migration is documentation only — the job already exists in the live DB.
-- To recreate if lost:
SELECT cron.schedule(
  'grade-predictions-1d',
  '0 6 * * *',
  $$ SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/grade-predictions-1d',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ'),
    body := '{}'::jsonb
  ); $$
);
