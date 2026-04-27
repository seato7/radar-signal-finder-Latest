CREATE OR REPLACE FUNCTION public.get_active_signal_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
    FROM public.trade_signals
   WHERE status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.get_active_signal_count() TO public;

CREATE OR REPLACE FUNCTION public.get_total_asset_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM public.assets;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_asset_count() TO public;

CREATE OR REPLACE FUNCTION public.get_assets_diagnostic()
RETURNS TABLE(
  last_score_update timestamptz,
  total_assets bigint,
  scored_assets bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT MAX(a.score_computed_at) FROM public.assets a),
    (SELECT COUNT(*)::bigint FROM public.assets),
    (SELECT COUNT(*)::bigint FROM public.assets WHERE score_computed_at IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assets_diagnostic() TO authenticated;

CREATE OR REPLACE FUNCTION public.supabase_health_check_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  PERFORM 1 FROM public.assets LIMIT 1;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.supabase_health_check_admin() TO authenticated;

DROP FUNCTION IF EXISTS public.get_assets_for_user(text, text, integer, integer, boolean);

CREATE OR REPLACE FUNCTION public.get_assets_for_user(
  _class_filter text DEFAULT NULL,
  _search text DEFAULT NULL,
  _tickers text[] DEFAULT NULL,
  _sort_mode text DEFAULT 'score-desc',
  _result_limit integer DEFAULT 50,
  _result_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  ticker text,
  name text,
  exchange text,
  asset_class text,
  computed_score numeric,
  hybrid_score numeric,
  score_computed_at timestamptz,
  score_explanation jsonb,
  expected_return numeric,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan text := public._effective_plan(auth.uid());
  _show_scores boolean := _plan IN ('premium', 'enterprise', 'admin');
  _allowed_classes text[];
  _demo_tickers text[] := ARRAY['F','VTI','EUR/USD'];
  _q text := NULLIF(trim(_search), '');
BEGIN
  IF _plan = 'starter' THEN
    _allowed_classes := ARRAY['stock'];
  ELSIF _plan = 'pro' THEN
    _allowed_classes := ARRAY['stock','etf','forex'];
  ELSE
    _allowed_classes := NULL;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT a.*
      FROM public.assets a
     WHERE
       (_plan <> 'free' OR a.ticker = ANY(_demo_tickers))
       AND (_class_filter IS NULL OR a.asset_class = _class_filter)
       AND (_allowed_classes IS NULL OR a.asset_class = ANY(_allowed_classes))
       AND (_tickers IS NULL OR a.ticker = ANY(_tickers))
       AND (
         _q IS NULL
         OR a.ticker ILIKE '%' || _q || '%'
         OR a.name   ILIKE '%' || _q || '%'
       )
  ), counted AS (
    SELECT COUNT(*) AS c FROM base
  )
  SELECT
    b.id,
    b.ticker,
    b.name,
    b.exchange,
    b.asset_class,
    CASE WHEN _show_scores THEN b.computed_score::numeric ELSE NULL END,
    CASE WHEN _show_scores THEN b.hybrid_score::numeric  ELSE NULL END,
    b.score_computed_at,
    CASE WHEN _show_scores THEN b.score_explanation     ELSE NULL END,
    CASE WHEN _show_scores THEN b.expected_return::numeric ELSE NULL END,
    (SELECT c FROM counted)
  FROM base b
  ORDER BY
    CASE WHEN _sort_mode = 'score-desc' THEN COALESCE(b.hybrid_score, b.computed_score) END DESC NULLS LAST,
    CASE WHEN _sort_mode = 'score-asc'  THEN COALESCE(b.hybrid_score, b.computed_score) END ASC  NULLS LAST,
    CASE WHEN _sort_mode = 'alpha-desc' THEN b.ticker END DESC,
    CASE WHEN _sort_mode = 'alpha-asc'  THEN b.ticker END ASC,
    b.ticker
  LIMIT
    CASE WHEN _tickers IS NULL THEN _result_limit ELSE GREATEST(_result_limit, array_length(_tickers, 1)) END
  OFFSET
    CASE WHEN _tickers IS NULL THEN _result_offset ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assets_for_user(text, text, text[], text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assets_for_user(text, text, text[], text, integer, integer) TO anon;

CREATE OR REPLACE FUNCTION public.get_asset_for_user_by_ticker(_ticker text)
RETURNS TABLE(
  id uuid,
  ticker text,
  name text,
  exchange text,
  asset_class text,
  sector text,
  computed_score numeric,
  hybrid_score numeric,
  ai_score numeric,
  score_computed_at timestamptz,
  score_explanation jsonb,
  expected_return numeric,
  metadata jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan text := public._effective_plan(auth.uid());
  _show_scores boolean := _plan IN ('premium', 'enterprise', 'admin');
  _demo_tickers text[] := ARRAY['F','VTI','EUR/USD'];
  _allowed_classes text[];
BEGIN
  IF _plan = 'starter' THEN
    _allowed_classes := ARRAY['stock'];
  ELSIF _plan = 'pro' THEN
    _allowed_classes := ARRAY['stock','etf','forex'];
  ELSE
    _allowed_classes := NULL;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.ticker,
    a.name,
    a.exchange,
    a.asset_class,
    a.sector,
    CASE WHEN _show_scores THEN a.computed_score::numeric ELSE NULL END,
    CASE WHEN _show_scores THEN a.hybrid_score::numeric  ELSE NULL END,
    CASE WHEN _show_scores THEN a.ai_score::numeric      ELSE NULL END,
    a.score_computed_at,
    CASE WHEN _show_scores THEN a.score_explanation ELSE NULL END,
    CASE WHEN _show_scores THEN a.expected_return::numeric ELSE NULL END,
    a.metadata
  FROM public.assets a
  WHERE a.ticker ILIKE _ticker
    AND (_plan <> 'free' OR a.ticker = ANY(_demo_tickers))
    AND (_allowed_classes IS NULL OR a.asset_class = ANY(_allowed_classes))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_asset_for_user_by_ticker(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_asset_for_user_by_ticker(text) TO anon;

CREATE OR REPLACE FUNCTION public.get_active_signal_tickers_for_user()
RETURNS TABLE(ticker text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan)
  SELECT s.ticker
    FROM public.trade_signals s
   WHERE s.status = 'active'
     AND (SELECT plan FROM p) <> 'free';
$$;

GRANT EXECUTE ON FUNCTION public.get_active_signal_tickers_for_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_signal_tickers_for_user() TO anon;

CREATE OR REPLACE FUNCTION public.get_active_signal_for_ticker(_ticker text)
RETURNS TABLE(
  id uuid,
  entry_price numeric,
  exit_target numeric,
  stop_loss numeric,
  position_size_pct numeric,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan)
  SELECT
    s.id,
    s.entry_price::numeric,
    s.exit_target::numeric,
    s.stop_loss::numeric,
    s.position_size_pct::numeric,
    s.expires_at,
    s.created_at
  FROM public.trade_signals s
  WHERE s.ticker = _ticker
    AND s.status = 'active'
    AND (SELECT plan FROM p) <> 'free'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_signal_for_ticker(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_signal_for_ticker(text) TO anon;

CREATE OR REPLACE FUNCTION public.get_themes_by_ids_for_user(_ids uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan)
  SELECT t.id, t.name
    FROM public.themes t
   WHERE t.id = ANY(_ids)
     AND (
       (SELECT plan FROM p) <> 'free'
       OR t.is_demo = true
     );
$$;

GRANT EXECUTE ON FUNCTION public.get_themes_by_ids_for_user(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_themes_by_ids_for_user(uuid[]) TO anon;