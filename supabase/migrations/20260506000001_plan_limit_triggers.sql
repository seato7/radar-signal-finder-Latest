-- Server-side plan-limit enforcement at the DB layer.
--
-- Why triggers and not just function checks: the watchlist write path
-- in src/pages/Watchlist.tsx hits supabase.from('watchlist').insert
-- and .update directly from the browser, so a function-only check is
-- not on the production path. The alerts table likewise grew a
-- "Users can insert their own alerts" RLS policy in f20b4fe to
-- support manage-alert-settings under the post-getClaims auth flip,
-- which means any authenticated user can also write directly via
-- DevTools. Closing both gaps requires enforcement that fires
-- regardless of which client path the caller takes.
--
-- The edge functions (manage-alert-settings, get-watchlist POST) keep
-- their own pre-flight checks so the legitimate paths can return a
-- 403 with current/limit fields for upgrade-CTA UX. The triggers are
-- the actual security boundary.
--
-- Service-role inserts bypass: cron-driven generate-alerts inserts
-- alerts on behalf of users at threshold crossings; those must not
-- be capped by the per-user subscription limit. auth.role() returns
-- 'service_role' for those connections.

-- 1. Plan-tier limit lookups. Numbers mirror src/lib/planLimits.ts;
-- when changing here, change there too. -1 means unlimited.
CREATE OR REPLACE FUNCTION public._plan_alert_limit(_plan text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _plan
    WHEN 'free'       THEN 0
    WHEN 'starter'    THEN 1
    WHEN 'pro'        THEN 5
    WHEN 'premium'    THEN -1
    WHEN 'enterprise' THEN -1
    WHEN 'admin'      THEN -1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public._plan_watchlist_slot_limit(_plan text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _plan
    WHEN 'free'       THEN 1
    WHEN 'starter'    THEN 3
    WHEN 'pro'        THEN 10
    WHEN 'premium'    THEN -1
    WHEN 'enterprise' THEN -1
    WHEN 'admin'      THEN -1
    ELSE 1
  END;
$$;

REVOKE ALL ON FUNCTION public._plan_alert_limit(text) FROM public;
REVOKE ALL ON FUNCTION public._plan_watchlist_slot_limit(text) FROM public;

-- 2. Alerts INSERT trigger.
-- Counts the user's existing alert rows and refuses if the new row
-- would push them over their plan cap. UPDATE is not gated; it only
-- ever changes status (via update-alert) and never the user_id.
CREATE OR REPLACE FUNCTION public._enforce_alerts_plan_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan text;
  _limit integer;
  _current integer;
BEGIN
  -- Cron-driven inserts (generate-alerts via service-role) bypass.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  _plan := public._effective_plan(NEW.user_id);
  _limit := public._plan_alert_limit(_plan);

  IF _limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _current
    FROM public.alerts
   WHERE user_id = NEW.user_id;

  IF _current >= _limit THEN
    RAISE EXCEPTION 'plan_limit_reached: alert limit % reached for plan %',
      _limit, _plan
      USING ERRCODE = 'check_violation',
            HINT    = format('current=%s limit=%s plan=%s', _current, _limit, _plan);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_alerts_plan_limit ON public.alerts;
CREATE TRIGGER enforce_alerts_plan_limit
  BEFORE INSERT ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public._enforce_alerts_plan_limit();

-- 3. Watchlist INSERT and UPDATE trigger.
-- Watchlist is one row per user (UNIQUE INDEX on user_id) with
-- tickers stored as a TEXT[] array; slot count is array_length. The
-- production add-to-watchlist path is an UPDATE that grows the
-- array, so the trigger must fire on UPDATE as well as INSERT.
CREATE OR REPLACE FUNCTION public._enforce_watchlist_plan_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan text;
  _limit integer;
  _new_count integer;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  _plan := public._effective_plan(NEW.user_id);
  _limit := public._plan_watchlist_slot_limit(_plan);

  IF _limit = -1 THEN
    RETURN NEW;
  END IF;

  _new_count := COALESCE(array_length(NEW.tickers, 1), 0);

  IF _new_count > _limit THEN
    RAISE EXCEPTION 'plan_limit_reached: watchlist slot limit % reached for plan %',
      _limit, _plan
      USING ERRCODE = 'check_violation',
            HINT    = format('current=%s limit=%s plan=%s', _new_count, _limit, _plan);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_watchlist_plan_limit ON public.watchlist;
CREATE TRIGGER enforce_watchlist_plan_limit
  BEFORE INSERT OR UPDATE ON public.watchlist
  FOR EACH ROW
  EXECUTE FUNCTION public._enforce_watchlist_plan_limit();
