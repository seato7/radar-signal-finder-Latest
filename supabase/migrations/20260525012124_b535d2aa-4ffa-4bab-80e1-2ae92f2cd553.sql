
-- 1) prices: drop anon/public write policies; service_role policy remains
DROP POLICY IF EXISTS "Allow service inserts to prices" ON public.prices;
DROP POLICY IF EXISTS "Allow service updates to prices" ON public.prices;
DROP POLICY IF EXISTS "Allow service deletes to prices" ON public.prices;

-- 2) ingest_logs: drop public insert/update; service_role policy remains
DROP POLICY IF EXISTS "Allow public insert for ingest logs" ON public.ingest_logs;
DROP POLICY IF EXISTS "Allow public update for ingest logs" ON public.ingest_logs;

-- 3) scoring_validation_results: replace permissive policy with service-role-only
DROP POLICY IF EXISTS "Service role can manage scoring validation results" ON public.scoring_validation_results;
CREATE POLICY "Service role can manage scoring validation results"
  ON public.scoring_validation_results
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- 4) log_error_events: rate limiting + Slack dedup state for frontend error logger
CREATE TABLE IF NOT EXISTS public.log_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  error_hash text NOT NULL,
  slack_notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_error_events_user_time
  ON public.log_error_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_log_error_events_hash_time
  ON public.log_error_events (error_hash, created_at DESC)
  WHERE slack_notified = true;

ALTER TABLE public.log_error_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages log_error_events"
  ON public.log_error_events
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);
