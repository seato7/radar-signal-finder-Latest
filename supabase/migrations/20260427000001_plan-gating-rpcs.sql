-- Plan-gating foundation: themes.is_demo flag and four SECURITY DEFINER
-- RPCs that centralise plan-tier filtering for assets, trade signals,
-- themes, and a public total-return aggregate. RPCs are introduced
-- here but not yet wired up by the frontend; a follow-up commit will
-- rewire the queries, and a final commit will REVOKE SELECT on the
-- underlying tables so these RPCs become the only path to read them.
--
-- Why centralise in DB rather than gating in the frontend or edge
-- functions: the existing frontend issues 10+ direct reads against
-- public.assets, public.trade_signals, and public.themes via the
-- supabase-js client. With table-level SELECT granted to authenticated
-- and anon, anyone with browser DevTools can bypass any client-side
-- gate. Only revoking SELECT and forcing reads through SECURITY
-- DEFINER RPCs gives us tamper-proof per-plan gating.

-- 1. Demo flag on themes.
-- Existing rows default to false. We pick exactly one theme to act as
-- the Free-tier read-only preview. The pick is by ILIKE on a shortlist
-- of broad-market names (dividend / blue chip / consumer staples);
-- first match wins by created_at.
ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

WITH picked AS (
  SELECT id FROM public.themes
   WHERE is_demo = false
     AND (
       name ILIKE '%dividend%'
       OR name ILIKE '%blue%chip%'
       OR name ILIKE '%consumer%staples%'
     )
   ORDER BY created_at NULLS LAST, name
   LIMIT 1
)
UPDATE public.themes t
   SET is_demo = true
  FROM picked
 WHERE t.id = picked.id;

DO $$
DECLARE
  _picked text;
BEGIN
  SELECT name INTO _picked FROM public.themes WHERE is_demo = true LIMIT 1;
  IF _picked IS NOT NULL THEN
    RAISE NOTICE 'Demo theme picked: %', _picked;
  ELSE
    RAISE NOTICE 'No demo theme picked. No theme name matched dividend / blue chip / consumer staples.';
  END IF;
END $$;

-- 2. Internal helper: resolve effective plan for a user, defaulting to
-- 'free' for anyone without a user_roles row (including anon).
-- Mirrors get_user_role priority but returned as text so callers can
-- compare without enum coercion.
CREATE OR REPLACE FUNCTION public._effective_plan(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT role::text FROM public.user_roles
       WHERE user_id = _user_id
       ORDER BY
         CASE role
           WHEN 'admin'      THEN 1
           WHEN 'enterprise' THEN 2
           WHEN 'premium'    THEN 3
           WHEN 'pro'        THEN 4
           WHEN 'starter'    THEN 5
           WHEN 'lite'       THEN 6
           WHEN 'free'       THEN 7
         END
       LIMIT 1
    ),
    'free'
  );
$$;

REVOKE ALL ON FUNCTION public._effective_plan(uuid) FROM public;

-- 3. Assets RPC.
-- Plan-aware filtering and score masking:
--   free            -> only the three demo tickers (F, VTI, EUR/USD)
--   starter         -> stock only
--   pro             -> stock, etf, forex
--   premium / enterprise / admin -> all classes, scores visible
-- Scores are returned NULL for non-premium tiers, matching the
-- show_scores plan limit. total_count is the post-filter row count
-- before pagination so callers can render a count in the UI.
CREATE OR REPLACE FUNCTION public.get_assets_for_user(
  _class_filter text DEFAULT NULL,
  _search text DEFAULT NULL,
  _result_limit integer DEFAULT 50,
  _result_offset integer DEFAULT 0,
  _sort_desc boolean DEFAULT true
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
    CASE WHEN _sort_desc      THEN COALESCE(b.hybrid_score, b.computed_score) END DESC NULLS LAST,
    CASE WHEN NOT _sort_desc  THEN COALESCE(b.hybrid_score, b.computed_score) END ASC  NULLS LAST,
    b.ticker
  LIMIT _result_limit OFFSET _result_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assets_for_user(text, text, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assets_for_user(text, text, integer, integer, boolean) TO anon;

-- 4. Trade-signals RPC.
-- Free users get masked rows: ticker '***' and price / level fields
-- nulled. The shape preserves a teaser (count of active signals,
-- masked rows visible in the list) without leaking actual
-- recommendations. Paid users see real values. Score-at-entry fields
-- are visible only to premium tiers, mirroring show_scores.
CREATE OR REPLACE FUNCTION public.get_signals_for_user()
RETURNS TABLE(
  id uuid,
  ticker text,
  signal_type text,
  status text,
  asset_id uuid,
  entry_date timestamptz,
  entry_price numeric,
  exit_target numeric,
  stop_loss numeric,
  exit_price numeric,
  exit_date timestamptz,
  expires_at timestamptz,
  position_size_pct numeric,
  pnl_pct numeric,
  peak_price numeric,
  last_live_price numeric,
  last_live_price_at timestamptz,
  last_live_price_source text,
  reason text,
  score_at_entry numeric,
  ai_score_at_entry numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (SELECT public._effective_plan(auth.uid()) AS plan)
  SELECT
    s.id,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN '***'::text ELSE s.ticker END,
    s.signal_type,
    s.status,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.asset_id END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.entry_date END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.entry_price::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.exit_target::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.stop_loss::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.exit_price::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.exit_date END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.expires_at END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.position_size_pct::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.pnl_pct::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.peak_price::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.last_live_price::numeric END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.last_live_price_at END,
    CASE WHEN (SELECT plan FROM p) = 'free' THEN NULL ELSE s.last_live_price_source END,
    CASE WHEN (SELECT plan FROM p) IN ('free','starter') THEN NULL ELSE s.reason END,
    CASE WHEN (SELECT plan FROM p) IN ('premium','enterprise','admin') THEN s.score_at_entry::numeric ELSE NULL END,
    CASE WHEN (SELECT plan FROM p) IN ('premium','enterprise','admin') THEN s.ai_score_at_entry::numeric ELSE NULL END,
    s.created_at,
    s.updated_at
  FROM public.trade_signals s
  ORDER BY s.created_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_signals_for_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_signals_for_user() TO anon;

-- 5. Themes RPC.
-- Free users see only is_demo themes; paid users see all. Score is
-- masked for non-premium tiers, matching show_scores.
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
    CASE WHEN (SELECT plan FROM p) IN ('premium','enterprise','admin') THEN t.score::numeric ELSE NULL END,
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

-- 6. Public aggregate of total realised return across closed signals.
-- Exposed publicly for the marketing teaser; only the rolled-up
-- percentage is leaked, never an individual ticker or amount.
CREATE OR REPLACE FUNCTION public.get_total_signal_return()
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(pnl_pct), 0)::numeric
    FROM public.trade_signals
   WHERE status IN ('triggered','stopped','expired');
$$;

GRANT EXECUTE ON FUNCTION public.get_total_signal_return() TO public;
