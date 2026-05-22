CREATE OR REPLACE FUNCTION public.search_assets(q text, result_limit integer DEFAULT 50, filter_asset_class text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, ticker text, name text, exchange text, asset_class text, sector text, computed_score numeric, hybrid_score numeric, ai_score numeric, effective_score numeric, score_computed_at timestamp with time zone, score_explanation jsonb, relevance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q_trimmed TEXT;
  q_tokens TEXT[];
  q_lower TEXT;
  _plan TEXT := public._effective_plan(auth.uid());
  _is_free BOOLEAN := _plan = 'free';
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
    _allowed_classes := NULL;
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
      -- Field-nulling: Free sees all matches, but score fields are nulled for non-demo tickers
      CASE WHEN _is_free AND NOT (a.ticker = ANY(_demo_tickers)) THEN NULL ELSE a.computed_score END AS computed_score,
      CASE WHEN _is_free AND NOT (a.ticker = ANY(_demo_tickers)) THEN NULL ELSE a.hybrid_score END AS hybrid_score,
      CASE WHEN _is_free AND NOT (a.ticker = ANY(_demo_tickers)) THEN NULL ELSE a.ai_score END AS ai_score,
      CASE WHEN _is_free AND NOT (a.ticker = ANY(_demo_tickers)) THEN NULL ELSE a.effective_score END AS effective_score,
      CASE WHEN _is_free AND NOT (a.ticker = ANY(_demo_tickers)) THEN NULL ELSE a.score_computed_at END AS score_computed_at,
      CASE WHEN _is_free AND NOT (a.ticker = ANY(_demo_tickers)) THEN NULL ELSE a.score_explanation END AS score_explanation,
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
      -- Free now sees the full asset universe (field-nulled). Paid tiers still gated by asset class.
      (_allowed_classes IS NULL OR a.asset_class = ANY(_allowed_classes))
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
            SELECT 1 FROM unnest(q_tokens) tok
            WHERE tok <> ''
              AND position(tok IN lower(a.name)) = 0
              AND position(tok IN lower(a.ticker)) = 0
          )
        )
      )
  )
  SELECT
    s.id, s.ticker, s.name, s.exchange, s.asset_class, s.sector,
    s.computed_score, s.hybrid_score, s.ai_score, s.effective_score,
    s.score_computed_at, s.score_explanation, s.relevance
  FROM scored s
  ORDER BY s.relevance DESC, s.ticker
  LIMIT result_limit;
END;
$function$;