-- Closes the plan-gating rewire by revoking direct SELECT on the three
-- protected tables (assets, trade_signals, themes) from the
-- authenticated and anon roles. After this migration runs, every read
-- of those tables MUST go through a SECURITY DEFINER RPC that applies
-- _effective_plan rules. RLS policies remain in place but are no
-- longer the front line because the role has no SELECT to fall back
-- on.
--
-- Also adds get_asset_tickers_by_ids_for_user, the last RPC the
-- frontend rewire needs. SignalSpotlight previously joined
-- public.signals -> public.assets via the PostgREST embedded resource
-- syntax (assets!inner(ticker, name)); that join requires SELECT on
-- assets and stops working the instant the REVOKE below executes. The
-- new RPC accepts the asset ids returned by the signals query and
-- returns ticker/name only, plan-gated to demo tickers for free.
--
-- The service_role bypasses these REVOKEs by design, so edge
-- functions (e.g. get-themes, score-recompute, etc.) keep working
-- unchanged.

-- 1. Asset metadata lookup by id list.
-- Used by SignalSpotlight and any future caller that holds asset ids
-- and only needs ticker/name (the cheap join pattern PostgREST gave
-- us before SELECT was revoked). Returns nothing for ids the caller
-- is not allowed to see, so no existence-leak.
CREATE OR REPLACE FUNCTION public.get_asset_tickers_by_ids_for_user(_ids uuid[])
RETURNS TABLE(id uuid, ticker text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan)
  SELECT a.id, a.ticker, a.name
    FROM public.assets a
   WHERE a.id = ANY(_ids)
     AND (
       (SELECT plan FROM p) <> 'free'
       OR a.ticker = ANY(ARRAY['F','VTI','EUR/USD'])
     );
$$;

GRANT EXECUTE ON FUNCTION public.get_asset_tickers_by_ids_for_user(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_asset_tickers_by_ids_for_user(uuid[]) TO anon;

-- 2. Revoke direct SELECT on the protected tables.
-- After this point, only the service_role and explicit RPC owners can
-- read these tables. Every authenticated/anon read flows through a
-- plan-aware function. Counterparts for INSERT/UPDATE/DELETE were
-- never granted to authenticated/anon, so this REVOKE is sufficient.
REVOKE SELECT ON public.assets         FROM authenticated, anon;
REVOKE SELECT ON public.trade_signals  FROM authenticated, anon;
REVOKE SELECT ON public.themes         FROM authenticated, anon;
