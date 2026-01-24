-- ============================================================================
-- FIX: Price aggregation RPCs with correct DATE math and asset_id joins
-- ============================================================================

-- Drop existing functions to recreate with fixed signatures
DROP FUNCTION IF EXISTS public.get_price_aggregates(date, integer);
DROP FUNCTION IF EXISTS public.update_assets_from_coverage(date, text);
DROP FUNCTION IF EXISTS public.compute_and_update_coverage(date, text, integer);

-- ============================================================================
-- 1. get_price_aggregates: Use DATE subtraction (not INTERVAL on DATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_price_aggregates(
  p_snapshot_date DATE,
  p_freshness_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  ticker TEXT,
  asset_id UUID,
  asset_class TEXT,
  last_price_date DATE,
  days_stale INTEGER,
  points_30d INTEGER,
  points_90d INTEGER,
  status TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date_30d DATE;
  v_date_90d DATE;
BEGIN
  -- DATE arithmetic: subtract integer days from DATE
  v_date_30d := p_snapshot_date - 30;
  v_date_90d := p_snapshot_date - 90;

  RETURN QUERY
  SELECT 
    a.ticker,
    a.id AS asset_id,
    a.asset_class,
    MAX(p.date)::DATE AS last_price_date,
    CASE 
      WHEN MAX(p.date) IS NULL THEN 9999
      ELSE (p_snapshot_date - MAX(p.date)::DATE)::INTEGER
    END AS days_stale,
    COUNT(CASE WHEN p.date >= v_date_30d THEN 1 END)::INTEGER AS points_30d,
    COUNT(CASE WHEN p.date >= v_date_90d THEN 1 END)::INTEGER AS points_90d,
    CASE
      WHEN MAX(p.date) IS NULL THEN 'missing'::TEXT
      WHEN (p_snapshot_date - MAX(p.date)::DATE) > p_freshness_days THEN 'stale'::TEXT
      ELSE 'fresh'::TEXT
    END AS status,
    CASE
      WHEN MAX(p.date) IS NULL THEN 'No price data found in prices table'::TEXT
      WHEN (p_snapshot_date - MAX(p.date)::DATE) > p_freshness_days THEN 
        'Last price ' || (p_snapshot_date - MAX(p.date)::DATE)::TEXT || ' days ago (threshold: ' || p_freshness_days::TEXT || ')'::TEXT
      ELSE 
        'Last price ' || (p_snapshot_date - MAX(p.date)::DATE)::TEXT || ' days ago'::TEXT
    END AS reason
  FROM public.assets a
  LEFT JOIN public.prices p ON p.ticker = a.ticker AND p.date <= p_snapshot_date AND p.date >= v_date_90d
  GROUP BY a.id, a.ticker, a.asset_class;
END;
$function$;

-- ============================================================================
-- 2. update_assets_from_coverage: JOIN by asset_id (not ticker)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_assets_from_coverage(
  p_snapshot_date DATE,
  p_vendor TEXT DEFAULT 'twelvedata'
)
RETURNS TABLE(updated_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.assets a
  SET
    price_status = c.status,
    last_price_date = c.last_price_date,
    days_stale = c.days_stale,
    price_points_30d = c.points_30d,
    rank_status = CASE
      WHEN c.status = 'fresh' THEN 'rankable'
      WHEN c.status = 'stale' THEN 'stale_price'
      WHEN c.status = 'missing' THEN 'missing_price'
      WHEN c.status = 'unsupported' THEN 'unsupported'
      ELSE 'unknown'
    END
  FROM public.price_coverage_daily c
  WHERE c.asset_id = a.id  -- JOIN by asset_id, not ticker
    AND c.snapshot_date = p_snapshot_date
    AND c.vendor = p_vendor;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  RETURN QUERY SELECT v_updated;
END;
$function$;

-- ============================================================================
-- 3. compute_and_update_coverage: Orchestrates everything in one transaction
-- ============================================================================
CREATE OR REPLACE FUNCTION public.compute_and_update_coverage(
  p_snapshot_date DATE,
  p_vendor TEXT DEFAULT 'twelvedata',
  p_freshness_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  coverage_rows_upserted INTEGER,
  assets_updated INTEGER,
  fresh_count INTEGER,
  stale_count INTEGER,
  missing_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coverage_count INTEGER;
  v_assets_updated INTEGER;
  v_fresh INTEGER;
  v_stale INTEGER;
  v_missing INTEGER;
BEGIN
  -- Step 1: Upsert into price_coverage_daily from get_price_aggregates
  WITH agg AS (
    SELECT * FROM public.get_price_aggregates(p_snapshot_date, p_freshness_days)
  ),
  upserted AS (
    INSERT INTO public.price_coverage_daily (
      snapshot_date, asset_id, ticker, asset_class, vendor,
      last_price_date, days_stale, points_30d, points_90d, status, reason
    )
    SELECT 
      p_snapshot_date, agg.asset_id, agg.ticker, agg.asset_class, p_vendor,
      agg.last_price_date, agg.days_stale, agg.points_30d, agg.points_90d, 
      agg.status, agg.reason
    FROM agg
    ON CONFLICT (snapshot_date, ticker, vendor) 
    DO UPDATE SET
      asset_id = EXCLUDED.asset_id,
      asset_class = EXCLUDED.asset_class,
      last_price_date = EXCLUDED.last_price_date,
      days_stale = EXCLUDED.days_stale,
      points_30d = EXCLUDED.points_30d,
      points_90d = EXCLUDED.points_90d,
      status = EXCLUDED.status,
      reason = EXCLUDED.reason
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_coverage_count FROM upserted;

  -- Step 2: Update assets from coverage (by asset_id)
  SELECT * INTO v_assets_updated FROM public.update_assets_from_coverage(p_snapshot_date, p_vendor);

  -- Step 3: Get counts by status
  SELECT 
    COUNT(*) FILTER (WHERE status = 'fresh')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'stale')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'missing')::INTEGER
  INTO v_fresh, v_stale, v_missing
  FROM public.price_coverage_daily
  WHERE snapshot_date = p_snapshot_date AND vendor = p_vendor;

  RETURN QUERY SELECT v_coverage_count, v_assets_updated, v_fresh, v_stale, v_missing;
END;
$function$;

-- ============================================================================
-- 4. Index for prices(ticker, date) to speed up aggregation
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON public.prices(ticker, date);

-- ============================================================================
-- 5. View for tickers containing commas (data quality check)
-- ============================================================================
CREATE OR REPLACE VIEW public.assets_ticker_commas AS
SELECT id, ticker, name, asset_class, created_at
FROM public.assets
WHERE ticker LIKE '%,%';