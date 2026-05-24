
-- ============================================================
-- PART 1: Enable RLS on tables that were publicly readable
-- ============================================================

-- 1.1 ai_scores — service_role only
ALTER TABLE public.ai_scores ENABLE ROW LEVEL SECURITY;

-- 1.2 backtest_analyses — service_role only
ALTER TABLE public.backtest_analyses ENABLE ROW LEVEL SECURITY;

-- 1.3 company_fundamentals — service_role only
ALTER TABLE public.company_fundamentals ENABLE ROW LEVEL SECURITY;

-- 1.4 eps_revisions — service_role only
ALTER TABLE public.eps_revisions ENABLE ROW LEVEL SECURITY;

-- 1.5 theme_analyses — service_role only
ALTER TABLE public.theme_analyses ENABLE ROW LEVEL SECURITY;

-- 1.6 scoring_config — drop public read, leave service_role mgmt
DROP POLICY IF EXISTS "Scoring config readable by everyone" ON public.scoring_config;

-- 1.7 price_ingestion_log — admin read only
DROP POLICY IF EXISTS "price_ingestion_log_select_all" ON public.price_ingestion_log;
CREATE POLICY "Admins can read price_ingestion_log"
  ON public.price_ingestion_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 1.8 function_status — admin read only
DROP POLICY IF EXISTS "Public read access for monitoring" ON public.function_status;
CREATE POLICY "Admins can read function_status"
  ON public.function_status FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 1.9 ingest_failures — admin read only
DROP POLICY IF EXISTS "Public read access to ingest failures" ON public.ingest_failures;
CREATE POLICY "Admins can read ingest_failures"
  ON public.ingest_failures FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 1.10 ingest_logs_test_audit — admin read only
DROP POLICY IF EXISTS "Test audit results readable by everyone" ON public.ingest_logs_test_audit;
CREATE POLICY "Admins can read ingest_logs_test_audit"
  ON public.ingest_logs_test_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 1.11 twelvedata_rate_limits — service_role only
DROP POLICY IF EXISTS "Public can read rate limit status" ON public.twelvedata_rate_limits;

-- ============================================================
-- PART 2: New SECURITY DEFINER RPCs for the rewired widgets
-- ============================================================

-- 2.1 Top themes with scores (replaces TopThemesCard's direct theme_scores read)
CREATE OR REPLACE FUNCTION public.get_top_themes_with_scores_for_user(p_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, name text, score numeric, component_scores jsonb, is_demo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan),
  ranked AS (
    SELECT DISTINCT ON (t.id)
      t.id, t.name, COALESCE(t.is_demo, false) AS is_demo,
      ts.score, ts.component_scores, ts.computed_at
    FROM public.themes t
    LEFT JOIN public.theme_scores ts ON ts.theme_id = t.id
    ORDER BY t.id, ts.computed_at DESC NULLS LAST
  )
  SELECT
    r.id, r.name,
    CASE WHEN (SELECT plan FROM p) = 'free' AND NOT r.is_demo THEN NULL ELSE r.score::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' AND NOT r.is_demo THEN NULL ELSE r.component_scores END,
    r.is_demo
  FROM ranked r
  WHERE r.score IS NOT NULL
  ORDER BY
    CASE WHEN r.is_demo THEN 0 ELSE 1 END,
    r.score DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
$$;

-- 2.2 Market radar (replaces MarketRadar's direct advanced_technicals read)
CREATE OR REPLACE FUNCTION public.get_market_radar_for_user()
RETURNS TABLE(ticker text, trend_strength text, price_vs_vwap_pct numeric, breakout_signal text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan),
  recent AS (
    SELECT DISTINCT ON (at.ticker)
      at.ticker, at.trend_strength, at.price_vs_vwap_pct, at.breakout_signal, at."timestamp"
    FROM public.advanced_technicals at
    WHERE at.trend_strength IN ('strong_uptrend','strong_downtrend')
    ORDER BY at.ticker, at."timestamp" DESC
  )
  SELECT
    r.ticker,
    r.trend_strength,
    CASE
      WHEN (SELECT plan FROM p) = 'free' AND r.ticker NOT IN ('F','VTI','EUR/USD') THEN NULL
      ELSE r.price_vs_vwap_pct
    END,
    r.breakout_signal
  FROM recent r
  ORDER BY r."timestamp" DESC
  LIMIT 8;
$$;

-- 2.3 Signal spotlight (replaces SignalSpotlight's direct signals read)
CREATE OR REPLACE FUNCTION public.get_signal_spotlight_for_user()
RETURNS TABLE(ticker text, signal_type text, direction text, magnitude numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan),
  candidates AS (
    SELECT s.signal_type, s.direction, s.magnitude, s.asset_id, s.observed_at
    FROM public.signals s
    WHERE (SELECT plan FROM p) <> 'free'
      AND s.direction IS NOT NULL
      AND s.direction <> 'neutral'
      AND s.asset_id IS NOT NULL
    ORDER BY s.observed_at DESC NULLS LAST
    LIMIT 10
  )
  SELECT a.ticker, c.signal_type, c.direction, c.magnitude::numeric
  FROM candidates c
  JOIN public.assets a ON a.id = c.asset_id
  ORDER BY c.magnitude DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_themes_with_scores_for_user(integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_market_radar_for_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_signal_spotlight_for_user() TO authenticated, anon;
