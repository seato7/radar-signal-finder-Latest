CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $migration$
DECLARE
  SRJ CONSTANT text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYwMjE0NiwiZXhwIjoyMDc2MTc4MTQ2fQ.HwW5eYCqvAUKgb7_3oUpSPFWm0KQo83vKGAYB-YPpLE';
  AJ  CONSTANT text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ';

  SRJ_EXPR CONSTANT text := '(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''service_role_key'' LIMIT 1)';
  AJ_EXPR  CONSTANT text := '(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''anon_key'' LIMIT 1)';

  v_id           uuid;
  v_job          record;
  v_new_cmd      text;
  v_rewritten    int := 0;
  v_leftover_srj int;
  v_leftover_aj  int;
BEGIN
  -- ----- 1. Idempotent vault secrets (CURRENT values) -----
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'service_role_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(SRJ, 'service_role_key', 'pg_cron service-role auth (managed by migration)');
  ELSE
    PERFORM vault.update_secret(v_id, SRJ, 'service_role_key', 'pg_cron service-role auth (managed by migration)');
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'anon_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(AJ, 'anon_key', 'pg_cron anon auth (managed by migration)');
  ELSE
    PERFORM vault.update_secret(v_id, AJ, 'anon_key', 'pg_cron anon auth (managed by migration)');
  END IF;

  -- ----- 2. Rewrite every cron job -----
  FOR v_job IN SELECT jobid, jobname, command FROM cron.job LOOP
    v_new_cmd := v_job.command;

    -- Form A: inline JSON headers literal (Content-Type + Authorization), spaced
    v_new_cmd := replace(v_new_cmd,
      '''{"Content-Type": "application/json", "Authorization": "Bearer ' || SRJ || '"}''::jsonb',
      'jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',''Bearer '' || ' || SRJ_EXPR || ')');
    v_new_cmd := replace(v_new_cmd,
      '''{"Content-Type":"application/json","Authorization":"Bearer ' || SRJ || '"}''::jsonb',
      'jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',''Bearer '' || ' || SRJ_EXPR || ')');
    v_new_cmd := replace(v_new_cmd,
      '''{"Content-Type": "application/json", "Authorization": "Bearer ' || AJ || '"}''::jsonb',
      'jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',''Bearer '' || ' || AJ_EXPR || ')');
    v_new_cmd := replace(v_new_cmd,
      '''{"Content-Type":"application/json","Authorization":"Bearer ' || AJ || '"}''::jsonb',
      'jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',''Bearer '' || ' || AJ_EXPR || ')');

    -- Form A2: synthetic-health-probe shape — apikey + Authorization, both anon
    v_new_cmd := replace(v_new_cmd,
      '''{"Content-Type":"application/json","apikey":"' || AJ || '","Authorization":"Bearer ' || AJ || '"}''::jsonb',
      'jsonb_build_object(''Content-Type'',''application/json'',''apikey'',' || AJ_EXPR || ',''Authorization'',''Bearer '' || ' || AJ_EXPR || ')');

    -- Form B: jsonb_build_object(...,'Authorization','Bearer <JWT>')
    v_new_cmd := replace(v_new_cmd,
      '''Bearer ' || SRJ || '''',
      '(''Bearer '' || ' || SRJ_EXPR || ')');
    v_new_cmd := replace(v_new_cmd,
      '''Bearer ' || AJ || '''',
      '(''Bearer '' || ' || AJ_EXPR || ')');

    IF v_new_cmd <> v_job.command THEN
      PERFORM cron.alter_job(job_id := v_job.jobid, command := v_new_cmd);
      v_rewritten := v_rewritten + 1;
    END IF;
  END LOOP;

  -- ----- 3. Assert no hardcoded JWT remains -----
  SELECT count(*) INTO v_leftover_srj FROM cron.job WHERE command LIKE '%' || SRJ || '%';
  SELECT count(*) INTO v_leftover_aj  FROM cron.job WHERE command LIKE '%' || AJ  || '%';

  IF v_leftover_srj > 0 OR v_leftover_aj > 0 THEN
    RAISE EXCEPTION 'Vault rewrite incomplete: % service-role leftovers, % anon leftovers — rolling back', v_leftover_srj, v_leftover_aj;
  END IF;

  RAISE NOTICE 'Vault rewrite complete: % of 78 jobs updated', v_rewritten;
END
$migration$;