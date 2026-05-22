CREATE OR REPLACE FUNCTION public._plan_watchlist_slot_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(_plan, 'free'))
    WHEN 'free'       THEN 3
    WHEN 'starter'    THEN 3
    WHEN 'pro'        THEN 10
    WHEN 'premium'    THEN 2147483647
    WHEN 'enterprise' THEN 2147483647
    WHEN 'admin'      THEN 2147483647
    ELSE 3
  END
$$;
REVOKE ALL ON FUNCTION public._plan_watchlist_slot_limit(text) FROM public;