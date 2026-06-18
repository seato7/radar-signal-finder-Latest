CREATE OR REPLACE FUNCTION public.get_public_signal_performance()
RETURNS TABLE(
  closed_count integer,
  total_return_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status IN ('triggered','stopped','expired'))::integer AS closed_count,
    COALESCE(
      SUM(pnl_pct) FILTER (WHERE status IN ('triggered','stopped','expired')),
      0
    )::numeric AS total_return_pct
  FROM public.trade_signals;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_signal_performance() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_signal_performance() TO authenticated;