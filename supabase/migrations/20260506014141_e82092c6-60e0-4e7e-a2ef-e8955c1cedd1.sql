-- Loosen plan-gating on score visibility RPCs.
-- Free users still get gated (and only see demo tickers), but every paid plan
-- (lite, starter, pro, premium, enterprise, admin) now sees real scores,
-- expected_return, and score_explanation. This fixes "every asset shows 50"
-- for paying customers caused by the RPC returning NULL.

CREATE OR REPLACE FUNCTION public.get_assets_for_user(
  _class_filter text DEFAULT NULL,
  _search text DEFAULT NULL,
  _tickers text[] DEFAULT NULL,
  _sort_mode text DEFAULT 'score-desc',
  _result_limit integer DEFAULT 50,
  _result_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, ticker text, name text, exchange text, asset_class text,
  computed_score numeric, hybrid_score numeric, score_computed_at timestamp with time zone,
  score_explanation jsonb, expected_return numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _plan text := public._effective_plan(auth.uid());
  _show_scores boolean := _plan <> 'free';  -- All paid plans see real scores
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
    b.id, b.ticker, b.name, b.exchange, b.asset_class,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_asset_for_user_by_ticker(_ticker text)
RETURNS TABLE(
  id uuid, ticker text, name text, exchange text, asset_class text, sector text,
  computed_score numeric, hybrid_score numeric, ai_score numeric,
  score_computed_at timestamp with time zone, score_explanation jsonb,
  expected_return numeric, metadata jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _plan text := public._effective_plan(auth.uid());
  _show_scores boolean := _plan <> 'free';  -- All paid plans see real scores
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
    a.id, a.ticker, a.name, a.exchange, a.asset_class, a.sector,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_themes_for_user()
RETURNS TABLE(
  id uuid, name text, keywords text[], alpha numeric, score numeric,
  tickers text[], ai_summary text, is_demo boolean,
  created_at timestamp with time zone, updated_at timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan)
  SELECT
    t.id, t.name, t.keywords, t.alpha::numeric,
    CASE WHEN (SELECT plan FROM p) <> 'free' THEN t.score::numeric ELSE NULL END,
    t.tickers, t.ai_summary, t.is_demo, t.created_at, t.updated_at
  FROM public.themes t
  WHERE (SELECT plan FROM p) <> 'free' OR t.is_demo = true
  ORDER BY COALESCE(t.score, 0) DESC NULLS LAST, t.name;
$function$;