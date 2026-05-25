-- =====================================================================
-- Phase 6D: rate-limit infra + REVOKE audit
-- =====================================================================

-- 1) Rate limit counter table
CREATE TABLE IF NOT EXISTS public.edge_function_rate_limits (
  user_id        uuid        NOT NULL,
  function_name  text        NOT NULL,
  window_start   timestamptz NOT NULL,
  count          integer     NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, function_name, window_start)
);

CREATE INDEX IF NOT EXISTS idx_efr_window
  ON public.edge_function_rate_limits (window_start);

ALTER TABLE public.edge_function_rate_limits ENABLE ROW LEVEL SECURITY;

-- No anon / authenticated policies => only service_role can read/write.
-- (service_role bypasses RLS entirely.)

-- 2) Atomic increment-and-check RPC. Service-role only.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  _user_id        uuid,
  _function_name  text,
  _limit          integer,
  _window_seconds integer DEFAULT 3600
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  -- Service-role only
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: service_role required';
  END IF;

  -- Bucket = floor(now / window_seconds) * window_seconds
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / _window_seconds) * _window_seconds
  );

  INSERT INTO public.edge_function_rate_limits (user_id, function_name, window_start, count, updated_at)
  VALUES (_user_id, _function_name, v_window_start, 1, now())
  ON CONFLICT (user_id, function_name, window_start)
  DO UPDATE SET
    count      = public.edge_function_rate_limits.count + 1,
    updated_at = now()
  RETURNING count INTO v_count;

  RETURN QUERY SELECT (v_count <= _limit), v_count, v_window_start;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_rate_limit(uuid, text, integer, integer) TO service_role;

-- 3) REVOKEs from Group B of the audit
REVOKE EXECUTE ON FUNCTION public.get_assets_diagnostic()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.supabase_health_check_admin()    FROM anon;