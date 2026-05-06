
-- Helper: alert limit per plan
CREATE OR REPLACE FUNCTION public._plan_alert_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _plan
    WHEN 'free'       THEN 0
    WHEN 'starter'    THEN 1
    WHEN 'lite'       THEN 1
    WHEN 'pro'        THEN 5
    WHEN 'premium'    THEN -1
    WHEN 'enterprise' THEN -1
    WHEN 'admin'      THEN -1
    ELSE 0
  END;
$$;

-- Helper: watchlist slot limit per plan
CREATE OR REPLACE FUNCTION public._plan_watchlist_slot_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _plan
    WHEN 'free'       THEN 1
    WHEN 'starter'    THEN 3
    WHEN 'lite'       THEN 3
    WHEN 'pro'        THEN 10
    WHEN 'premium'    THEN -1
    WHEN 'enterprise' THEN -1
    WHEN 'admin'      THEN -1
    ELSE 1
  END;
$$;

-- Trigger function: enforce alerts plan limit
CREATE OR REPLACE FUNCTION public._enforce_alerts_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _plan text;
  _limit integer;
  _current integer;
BEGIN
  -- Bypass for service role (cron jobs / edge functions with service key)
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  _plan := public._effective_plan(NEW.user_id);
  _limit := public._plan_alert_limit(_plan);

  -- Unlimited
  IF _limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _current
  FROM public.alerts
  WHERE user_id = NEW.user_id;

  IF _current >= _limit THEN
    RAISE EXCEPTION 'plan_limit_reached: alert limit % reached for plan %', _limit, _plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function: enforce watchlist plan limit
CREATE OR REPLACE FUNCTION public._enforce_watchlist_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _plan text;
  _limit integer;
  _count integer;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  _plan := public._effective_plan(NEW.user_id);
  _limit := public._plan_watchlist_slot_limit(_plan);

  IF _limit = -1 THEN
    RETURN NEW;
  END IF;

  _count := COALESCE(array_length(NEW.tickers, 1), 0);

  IF _count > _limit THEN
    RAISE EXCEPTION 'plan_limit_reached: watchlist slot limit % reached for plan % (attempted %)', _limit, _plan, _count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS enforce_alerts_plan_limit ON public.alerts;
DROP TRIGGER IF EXISTS enforce_watchlist_plan_limit ON public.watchlist;

CREATE TRIGGER enforce_alerts_plan_limit
BEFORE INSERT ON public.alerts
FOR EACH ROW
EXECUTE FUNCTION public._enforce_alerts_plan_limit();

CREATE TRIGGER enforce_watchlist_plan_limit
BEFORE INSERT OR UPDATE ON public.watchlist
FOR EACH ROW
EXECUTE FUNCTION public._enforce_watchlist_plan_limit();
