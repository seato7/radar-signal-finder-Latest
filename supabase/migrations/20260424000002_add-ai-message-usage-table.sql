-- Server-side AI message rate limiting.
-- Replaces the client-side localStorage counter that was trivially
-- bypassable by clearing browser storage or using DevTools.
--
-- Also retroactively documents three app_role enum values (starter,
-- premium, enterprise) that exist in the live database but were never
-- written into migration history (added out-of-band via Studio).
-- A rebuild from migrations alone would otherwise recreate only the
-- original 4-value enum and break the Stripe webhook role upsert.
--
-- Also replaces get_user_role so its CASE expression covers every
-- plan the live system can assign, not just the original four.

-- 1. Retroactive enum documentation. IF NOT EXISTS makes this a no-op
-- on the live DB where these values already exist. In Postgres 12+
-- ALTER TYPE ADD VALUE is transaction-safe provided the new value is
-- not referenced as a literal within the same transaction. The
-- get_user_role body below references these values but only as
-- stored text; no runtime usage happens during the migration.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'premium';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'enterprise';

-- 2. Usage tracking table. One row per user per day.
CREATE TABLE IF NOT EXISTS public.ai_message_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  message_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_message_usage_user_date
  ON public.ai_message_usage(user_id, usage_date DESC);

ALTER TABLE public.ai_message_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage (for displaying remaining count).
-- No user-facing INSERT or UPDATE policy: only service_role writes,
-- which bypasses RLS. Users cannot tamper with their counters.
CREATE POLICY "Users view own ai usage"
  ON public.ai_message_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all ai usage"
  ON public.ai_message_usage FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.ai_message_usage IS
  'Per-user per-day AI Assistant message counter. Authoritative source for rate limiting; supersedes the client-side localStorage counter.';

-- 3. Atomic increment-and-check RPC.
-- Inserts or increments a counter then checks against the caller-supplied
-- limit. If over, decrements back so the stored count reflects reality.
-- Caller passes -1 for unlimited plans (but those should skip this call
-- entirely to save a round trip).
CREATE OR REPLACE FUNCTION public.increment_ai_usage(_user_id uuid, _limit integer)
RETURNS TABLE(allowed boolean, current_count integer, daily_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _today date := CURRENT_DATE;
  _current integer;
BEGIN
  INSERT INTO public.ai_message_usage (user_id, usage_date, message_count, updated_at)
  VALUES (_user_id, _today, 1, NOW())
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    message_count = public.ai_message_usage.message_count + 1,
    updated_at = NOW()
  RETURNING public.ai_message_usage.message_count INTO _current;

  IF _limit = -1 OR _current <= _limit THEN
    RETURN QUERY SELECT true, _current, _limit;
  ELSE
    UPDATE public.ai_message_usage
       SET message_count = message_count - 1
     WHERE user_id = _user_id AND usage_date = _today;
    RETURN QUERY SELECT false, _current - 1, _limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, integer) TO authenticated;

-- 4. Replace get_user_role with a CASE covering every live plan value.
-- Priority: admin beats every paid tier, higher tiers beat lower tiers.
-- lite is retained for back-compat even though the CHECK constraint
-- user_roles_role_not_lite prevents new assignments.
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY
    CASE role
      WHEN 'admin'      THEN 1
      WHEN 'enterprise' THEN 2
      WHEN 'premium'    THEN 3
      WHEN 'pro'        THEN 4
      WHEN 'starter'    THEN 5
      WHEN 'lite'       THEN 6
      WHEN 'free'       THEN 7
    END
  LIMIT 1;
$$;
