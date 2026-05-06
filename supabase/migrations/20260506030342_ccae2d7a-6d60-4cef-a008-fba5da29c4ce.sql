-- Add plan-gating to search_assets() RPC for defence-in-depth.
-- Mirrors logic in get_assets_for_user / get_asset_for_user_by_ticker:
--  * Free users: only see the 3 demo tickers (F, VTI, EUR/USD)
--  * Starter: stocks only
--  * Pro: stocks, ETFs, forex
--  * Premium/Enterprise/Admin: all asset classes
-- Score columns are also nulled for free users (parity with get_assets_for_user).

CREATE OR REPLACE FUNCTION public.search_assets(
  q text,
  result_limit integer DEFAULT 50,
  filter_asset_class text DEFAULT NULL::text
)
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
  effective_score numeric,
  score_computed_at timestamp with time zone,
  score_explanation jsonb,
  relevance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q_trimmed TEXT;
  q_tokens TEXT[];
  q_lower TEXT;
  _plan TEXT := public._effective_plan(auth.uid());
  _show_scores BOOLEAN := _plan <> 'free';
  _demo_tickers TEXT[] := ARRAY['F','VTI','EUR/USD'];
  _allowed_classes TEXT[];
BEGIN
  q_trimmed := trim(q);

  IF q_trimmed IS NULL OR length(q_trimmed) < 1 THEN
    RETURN;
  END IF;

  IF _plan = 'starter' THEN
    _allowed_classes := ARRAY['stock'];
  ELSIF _plan = 'pro' THEN
    _allowed_classes := ARRAY['stock','etf','forex'];
  ELSE
    _allowed_classes := NULL; -- premium/enterprise/admin/free => no class restriction (free is restricted by demo-ticker filter below)
  END IF;

  q_lower := lower(q_trimmed);
  q_tokens := string_to_array(q_lower, ' ');

  RETURN QUERY
  WITH scored AS (
    SELECT
      a.id,
      a.ticker,
      a.name,
      a.exchange,
      a.asset_class,
      a.sector,
      a.computed_score,
      a.hybrid_score,
      a.ai_score,
      a.effective_score,
      a.score_computed_at,
      a.score_explanation,
      (CASE
        WHEN lower(a.ticker) = q_lower THEN 1000
        WHEN lower(a.ticker) LIKE q_lower || '%' THEN 900
        WHEN lower(a.name) LIKE q_lower || '%' THEN 800
        WHEN lower(a.ticker) LIKE '%' || q_lower || '%' THEN 700
        WHEN lower(a.name) LIKE '%' || q_lower || '%' THEN 600
        ELSE 500 * GREATEST(
          similarity(lower(a.ticker), q_lower),
          similarity(lower(a.name), q_lower)
        )
      END)::NUMERIC AS relevance
    FROM public.assets a
    WHERE
      -- PLAN GATING: free users restricted to demo tickers
      (_plan <> 'free' OR a.ticker = ANY(_demo_tickers))
      -- PLAN GATING: paid tiers restricted by asset class
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
    s.id, s.ticker, s.name, s.exchange, s.asset_class, s.sector,
    CASE WHEN _show_scores THEN s.computed_score ELSE NULL END,
    CASE WHEN _show_scores THEN s.hybrid_score   ELSE NULL END,
    CASE WHEN _show_scores THEN s.ai_score       ELSE NULL END,
    CASE WHEN _show_scores THEN s.effective_score ELSE NULL END,
    s.score_computed_at,
    CASE WHEN _show_scores THEN s.score_explanation ELSE NULL END,
    s.relevance
  FROM scored s
  WHERE s.relevance > 150
  ORDER BY s.relevance DESC, s.effective_score DESC NULLS LAST, s.ticker ASC
  LIMIT result_limit;
END;
$function$;