
CREATE OR REPLACE FUNCTION public.get_public_preview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
  demo_tickers text[] := ARRAY['F','VTI','EUR/USD'];
  demo_theme_id uuid := 'a9ea5734-7afc-4d88-9a23-f0bf07affd5b'; -- Congressional Bipartisan Trading
  v_demo_assets jsonb;
  v_blurred_assets jsonb;
  v_total_assets bigint;
  v_demo_themes jsonb;
  v_blurred_themes jsonb;
  v_total_themes bigint;
  v_demo_signal jsonb;
  v_total_signals bigint;
BEGIN
  -- Demo assets: 3 named tickers with full data
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'ticker', a.ticker,
    'name', a.name,
    'exchange', a.exchange,
    'asset_class', a.asset_class,
    'score', COALESCE(a.hybrid_score, a.computed_score, 50),
    'hybrid_score', a.hybrid_score,
    'computed_score', a.computed_score,
    'score_explanation', a.score_explanation,
    'score_computed_at', a.score_computed_at,
    'price', (SELECT close FROM prices p WHERE p.ticker = a.ticker ORDER BY date DESC LIMIT 1),
    'price_change_pct', (
      WITH recent AS (
        SELECT close, date FROM prices p WHERE p.ticker = a.ticker ORDER BY date DESC LIMIT 2
      )
      SELECT CASE WHEN COUNT(*) = 2 THEN
        ROUND((((MAX(close) FILTER (WHERE date = (SELECT MAX(date) FROM recent))) -
                (MIN(close) FILTER (WHERE date = (SELECT MIN(date) FROM recent)))) /
               NULLIF((MIN(close) FILTER (WHERE date = (SELECT MIN(date) FROM recent))), 0)) * 100, 2)
      END FROM recent
    )
  )), '[]'::jsonb) INTO v_demo_assets
  FROM assets a WHERE a.ticker = ANY(demo_tickers);

  -- Blurred assets: top 50 by hybrid_score (names only, no scores/prices)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'ticker', a.ticker,
    'name', a.name,
    'exchange', a.exchange,
    'asset_class', a.asset_class
  )), '[]'::jsonb) INTO v_blurred_assets
  FROM (
    SELECT id, ticker, name, exchange, asset_class
    FROM assets
    WHERE NOT (ticker = ANY(demo_tickers))
      AND hybrid_score IS NOT NULL
    ORDER BY hybrid_score DESC NULLS LAST
    LIMIT 50
  ) a;

  SELECT COUNT(*) INTO v_total_assets FROM assets;

  -- Demo theme: Congressional Bipartisan Trading with full data
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'score', t.score,
    'is_demo', t.is_demo,
    'ai_summary', t.ai_summary,
    'tickers', t.tickers,
    'keywords', t.keywords,
    'signal_count', COALESCE((SELECT signal_count FROM theme_scores ts WHERE ts.theme_id = t.id ORDER BY computed_at DESC LIMIT 1), 0),
    'last_calculated_at', (SELECT computed_at FROM theme_scores ts WHERE ts.theme_id = t.id ORDER BY computed_at DESC LIMIT 1),
    'created_at', t.created_at
  )), '[]'::jsonb) INTO v_demo_themes
  FROM themes t WHERE t.id = demo_theme_id;

  -- Blurred themes: 30 other themes (names visible, scores null)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'keywords', t.keywords
  )), '[]'::jsonb) INTO v_blurred_themes
  FROM (
    SELECT id, name, keywords FROM themes
    WHERE id <> demo_theme_id
    ORDER BY COALESCE(score, 0) DESC NULLS LAST
    LIMIT 30
  ) t;

  SELECT COUNT(*) INTO v_total_themes FROM themes;

  -- Demo signal: most recent active
  SELECT to_jsonb(s) INTO v_demo_signal
  FROM (
    SELECT id, ticker, signal_type, status, entry_price, exit_target, stop_loss,
           peak_price, position_size_pct, score_at_entry, ai_score_at_entry,
           expires_at, created_at, reason, last_live_price, last_live_price_at
    FROM trade_signals
    WHERE status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  ) s;

  SELECT COUNT(*) INTO v_total_signals FROM trade_signals WHERE status = 'active';

  result := jsonb_build_object(
    'demo_assets', v_demo_assets,
    'blurred_assets', v_blurred_assets,
    'total_asset_count', v_total_assets,
    'demo_themes', v_demo_themes,
    'blurred_themes', v_blurred_themes,
    'total_theme_count', v_total_themes,
    'demo_signal', v_demo_signal,
    'total_active_signal_count', v_total_signals,
    'generated_at', now()
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_preview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_preview() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_preview() IS
'Public preview payload for anonymous landing visitors. Returns a bounded set: 3 fully-spec''d demo assets (F, VTI, EUR/USD), the Congressional Bipartisan Trading demo theme with full data, the most recent active signal, plus 50 blurred asset names and 30 blurred theme names with sensitive fields stripped. Counts reflect real totals. SECURITY DEFINER with locked search_path; payload is enumerated in SQL so the surface is auditable and cannot accidentally leak gated data.';
