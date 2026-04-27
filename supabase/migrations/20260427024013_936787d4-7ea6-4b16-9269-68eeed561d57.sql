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

REVOKE SELECT ON public.assets         FROM authenticated, anon;
REVOKE SELECT ON public.trade_signals  FROM authenticated, anon;
REVOKE SELECT ON public.themes         FROM authenticated, anon;