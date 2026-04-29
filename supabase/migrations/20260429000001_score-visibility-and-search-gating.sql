-- Phase 6.0 closeout. Two changes bundled:
--
-- 1. Score visibility — score is now tied to asset class access, not a
--    separate Premium toggle. Whenever a row is allowed through the
--    plan filter (demo tickers for Free, allowed asset classes for paid
--    tiers), the actual computed/hybrid/AI score is returned. The
--    `_show_scores` gate that nulled scores for free/starter/pro is
--    removed. The product copy ("Asset scores hidden") was driving the
--    wrong intuition; users expected to see scores for the assets they
--    were already allowed to see.
--
--    Affected RPCs: get_assets_for_user, get_asset_for_user_by_ticker,
--    get_themes_for_user. get_themes_by_ids_for_user only returns
--    id/name (no score), so it is unchanged.
--
-- 2. Search gating + relevance — search_assets is the relevance-ranked
--    fuzzy-search RPC AssetRadar uses for ticker/name lookups. Before
--    this migration it had no plan filter and would happily return any
--    asset to a Free user. Now it applies the same demo_tickers /
--    allowed_classes rules as get_assets_for_user. Relevance ordering
--    (exact ticker > ticker prefix > name prefix > substring > fuzzy)
--    is preserved.

-- ─── 1. get_assets_for_user (drop + recreate) ───────────────────────
DROP FUNCTION IF EXISTS public.get_assets_for_user(text, text, text[], text, integer, integer);

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
    b.computed_score::numeric,
    b.hybrid_score::numeric,
    b.score_computed_at,
    b.score_explanation,
    b.expected_return::numeric,
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

-- ─── 2. get_asset_for_user_by_ticker (recreate) ─────────────────────
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
    a.computed_score::numeric,
    a.hybrid_score::numeric,
    a.ai_score::numeric,
    a.score_computed_at,
    a.score_explanation,
    a.expected_return::numeric,
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

-- ─── 3. get_themes_for_user (recreate) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_themes_for_user()
RETURNS TABLE(
  id uuid,
  name text,
  keywords text[],
  alpha numeric,
  score numeric,
  tickers text[],
  ai_summary text,
  is_demo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan)
  SELECT
    t.id,
    t.name,
    t.keywords,
    t.alpha::numeric,
    t.score::numeric,
    t.tickers,
    t.ai_summary,
    t.is_demo,
    t.created_at,
    t.updated_at
  FROM public.themes t
  WHERE (SELECT plan FROM p) <> 'free' OR t.is_demo = true
  ORDER BY COALESCE(t.score, 0) DESC NULLS LAST, t.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_themes_for_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_themes_for_user() TO anon;

-- ─── 4. search_assets (recreate with plan gating) ───────────────────
-- Drop the previous signature so we can change the column list (sector
-- and ai_score / effective_score are no longer returned; the consumer
-- uses computed_score / hybrid_score / score_explanation only).
DROP FUNCTION IF EXISTS public.search_assets(text, integer, text);

CREATE OR REPLACE FUNCTION public.search_assets(
  q TEXT,
  result_limit INT DEFAULT 50,
  filter_asset_class TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  ticker TEXT,
  name TEXT,
  exchange TEXT,
  asset_class TEXT,
  computed_score NUMERIC,
  hybrid_score NUMERIC,
  score_computed_at TIMESTAMPTZ,
  score_explanation JSONB,
  relevance NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q_trimmed TEXT;
  q_tokens TEXT[];
  q_lower TEXT;
  _plan text := public._effective_plan(auth.uid());
  _allowed_classes text[];
  _demo_tickers text[] := ARRAY['F','VTI','EUR/USD'];
BEGIN
  q_trimmed := trim(q);

  IF q_trimmed IS NULL OR length(q_trimmed) < 1 THEN
    RETURN;
  END IF;

  q_lower := lower(q_trimmed);
  q_tokens := string_to_array(q_lower, ' ');

  IF _plan = 'starter' THEN
    _allowed_classes := ARRAY['stock'];
  ELSIF _plan = 'pro' THEN
    _allowed_classes := ARRAY['stock','etf','forex'];
  ELSE
    _allowed_classes := NULL;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      a.id,
      a.ticker,
      a.name,
      a.exchange,
      a.asset_class,
      a.computed_score::numeric AS computed_score,
      a.hybrid_score::numeric AS hybrid_score,
      a.score_computed_at,
      a.score_explanation,
      CASE
        WHEN lower(a.ticker) = q_lower THEN 1000
        WHEN lower(a.ticker) LIKE q_lower || '%' THEN 900
        WHEN lower(a.name) LIKE q_lower || '%' THEN 800
        WHEN lower(a.ticker) LIKE '%' || q_lower || '%' THEN 700
        WHEN lower(a.name) LIKE '%' || q_lower || '%' THEN 600
        ELSE 500 * GREATEST(
          similarity(lower(a.ticker), q_lower),
          similarity(lower(a.name), q_lower)
        )
      END::numeric AS relevance
    FROM public.assets a
    WHERE
      (_plan <> 'free' OR a.ticker = ANY(_demo_tickers))
      AND (_allowed_classes IS NULL OR a.asset_class = ANY(_allowed_classes))
      AND (filter_asset_class IS NULL OR a.asset_class = filter_asset_class)
      AND (
        lower(a.ticker) LIKE '%' || q_lower || '%'
        OR lower(a.name) LIKE '%' || q_lower || '%'
        OR lower(a.exchange) LIKE '%' || q_lower || '%'
        OR similarity(lower(a.ticker), q_lower) > 0.3
        OR similarity(lower(a.name), q_lower) > 0.3
        OR (
          array_length(q_tokens, 1) > 1
          AND NOT EXISTS (
            SELECT 1 FROM unnest(q_tokens) t
            WHERE lower(a.ticker) NOT LIKE '%' || t || '%'
              AND lower(a.name) NOT LIKE '%' || t || '%'
          )
        )
      )
  )
  SELECT
    s.id, s.ticker, s.name, s.exchange, s.asset_class,
    s.computed_score, s.hybrid_score,
    s.score_computed_at, s.score_explanation,
    s.relevance
  FROM scored s
  WHERE s.relevance > 150
  ORDER BY s.relevance DESC, COALESCE(s.hybrid_score, s.computed_score) DESC NULLS LAST, s.ticker ASC
  LIMIT result_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_assets(TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_assets(TEXT, INT, TEXT) TO anon;

COMMENT ON FUNCTION public.search_assets IS
  'Plan-gated relevance-ranked asset search. Free users see only demo tickers; Starter sees stocks; Pro sees stocks/ETFs/forex; Premium+ sees everything. Relevance tiers: exact ticker (1000), ticker prefix (900), name prefix (800), ticker substring (700), name substring (600), trigram similarity (500 * sim).';
