-- Follow-up to 20260427000001. Adds RPCs needed before the frontend
-- rewire can fully remove direct .from('assets'|'trade_signals') reads:
--   1. get_active_signal_count    - public count for landing-page teaser
--   2. get_assets_diagnostic      - admin-only stats for SystemValidationCard
--   3. supabase_health_check_admin - admin-only connectivity probe
--
-- Also redefines get_assets_for_user with a richer signature so a
-- single RPC can cover the five AssetRadar paths (score-sorted page,
-- alpha-sorted page, ticker-list lookup for "recent" and
-- "gainers/losers" modes, and the default browse). The original from
-- 20260427000001 is dropped because:
--   - Postgres treats parameter list as part of function identity, so
--     additive changes are not possible via CREATE OR REPLACE alone.
--   - No frontend caller has been wired to it yet, so DROP is safe.
--
-- Admin RPCs hard-check has_role(auth.uid(), 'admin') in the body and
-- RAISE EXCEPTION otherwise. Plan-tier masking is unchanged from _001.

-- 1. Public count of active trade signals.
-- Used by Landing.tsx so the marketing teaser renders without any
-- ticker information leaking.
CREATE OR REPLACE FUNCTION public.get_active_signal_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
    FROM public.trade_signals
   WHERE status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.get_active_signal_count() TO public;

-- 1b. Public count of all assets (for the marketing landing page).
-- Returns the gross asset universe size; no per-row content is exposed,
-- so the count alone is fine to share publicly.
CREATE OR REPLACE FUNCTION public.get_total_asset_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM public.assets;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_asset_count() TO public;

-- 2. Admin-only diagnostic over public.assets.
-- Returns the freshness statistics SystemValidationCard renders.
-- Raises on non-admin so the function cannot be used as a backdoor
-- read after table SELECT is revoked.
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

-- 3. Admin-only health check.
-- Proves a round-trip to the database for the debug panel without
-- exposing any row content. Raises on non-admin.
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

-- 4. Redefine get_assets_for_user.
-- Drops the previous five-arg form and recreates with:
--   _tickers text[]  - when non-null, restricts to this set and ignores
--                      class / search / pagination (caller already
--                      ordered the list and will re-sort client-side).
--   _sort_mode text  - 'score-desc' | 'score-asc' | 'alpha-asc'
--                      | 'alpha-desc'. Defaults to 'score-desc'.
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

-- 5. Single-asset lookup by ticker, used by AssetDetail.
-- Returns NULL if the asset would be hidden by plan rules (Free user
-- requesting non-demo ticker), so callers can render an upgrade
-- prompt without leaking existence. Includes additional asset
-- metadata columns (sector, ai_score) that AssetDetail consumes
-- beyond the radar listing shape.
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

-- 6. Active trade-signal tickers visible to the caller.
-- AssetRadar uses this to flag rows in the list that have an active
-- signal. Returns plain ticker strings; for Free users this is empty
-- because get_signals_for_user already masks ticker to '***' and we
-- do not want to leak which demo tickers have signals.
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

-- 7. Active trade-signal lookup for a single ticker, used by AssetDetail
-- to render the active-signal panel. Free users always get NULL since
-- their visible asset set (demo tickers) is unlikely to have signals
-- and we want the upgrade prompt to render.
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

-- 8. Theme-name lookup for a list of theme ids, used by AssetDetail
-- to render the "Associated Themes" badges. Free users see only the
-- single is_demo theme, mirroring get_themes_for_user.
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
