-- Grant Data API access to assets (was missing — anon/authenticated couldn't even count rows)
GRANT SELECT ON public.assets TO anon, authenticated;
GRANT ALL ON public.assets TO service_role;

-- Single source of truth for per-class + tier-coverage asset counts.
CREATE OR REPLACE FUNCTION public.get_asset_universe_counts()
RETURNS TABLE(
  stock bigint,
  etf bigint,
  forex bigint,
  crypto bigint,
  commodity bigint,
  total bigint,
  starter_coverage bigint,
  pro_coverage bigint,
  premium_coverage bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT
      COUNT(*) FILTER (WHERE asset_class = 'stock')::bigint     AS stock,
      COUNT(*) FILTER (WHERE asset_class = 'etf')::bigint       AS etf,
      COUNT(*) FILTER (WHERE asset_class = 'forex')::bigint     AS forex,
      COUNT(*) FILTER (WHERE asset_class = 'crypto')::bigint    AS crypto,
      COUNT(*) FILTER (WHERE asset_class = 'commodity')::bigint AS commodity,
      COUNT(*)::bigint                                          AS total
    FROM public.assets
  )
  SELECT
    stock, etf, forex, crypto, commodity, total,
    stock                                          AS starter_coverage,
    (stock + etf + forex)                          AS pro_coverage,
    total                                          AS premium_coverage
  FROM c;
$$;

GRANT EXECUTE ON FUNCTION public.get_asset_universe_counts() TO anon, authenticated, service_role;