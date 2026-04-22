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
  sector TEXT,
  computed_score NUMERIC,
  hybrid_score NUMERIC,
  ai_score NUMERIC,
  effective_score NUMERIC,
  score_computed_at TIMESTAMPTZ,
  score_explanation JSONB,
  relevance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q_trimmed TEXT;
  q_tokens TEXT[];
  q_lower TEXT;
BEGIN
  q_trimmed := trim(q);

  IF q_trimmed IS NULL OR length(q_trimmed) < 1 THEN
    RETURN;
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
      (filter_asset_class IS NULL OR a.asset_class = filter_asset_class)
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
    s.computed_score, s.hybrid_score, s.ai_score, s.effective_score,
    s.score_computed_at, s.score_explanation,
    s.relevance
  FROM scored s
  WHERE s.relevance > 150
  ORDER BY s.relevance DESC, s.effective_score DESC NULLS LAST, s.ticker ASC
  LIMIT result_limit;
END;
$$;