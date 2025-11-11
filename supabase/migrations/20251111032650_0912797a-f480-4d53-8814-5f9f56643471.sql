-- Fix search_path for security functions

DROP FUNCTION IF EXISTS check_signal_distribution_skew();
DROP FUNCTION IF EXISTS check_ai_fallback_usage();

-- Recreate with proper security definer settings
CREATE OR REPLACE FUNCTION check_signal_distribution_skew()
RETURNS TABLE(
  alert_type TEXT,
  buy_count BIGINT,
  sell_count BIGINT,
  neutral_count BIGINT,
  buy_percentage NUMERIC,
  sell_percentage NUMERIC,
  neutral_percentage NUMERIC,
  is_skewed BOOLEAN,
  message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buy_count BIGINT;
  v_sell_count BIGINT;
  v_neutral_count BIGINT;
  v_total BIGINT;
  v_buy_pct NUMERIC;
  v_sell_pct NUMERIC;
  v_neutral_pct NUMERIC;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE direction = 'up'),
    COUNT(*) FILTER (WHERE direction = 'down'),
    COUNT(*) FILTER (WHERE direction = 'neutral' OR direction IS NULL),
    COUNT(*)
  INTO v_buy_count, v_sell_count, v_neutral_count, v_total
  FROM signals
  WHERE observed_at > NOW() - INTERVAL '1 hour';

  IF v_total = 0 THEN
    RETURN;
  END IF;

  v_buy_pct := (v_buy_count::NUMERIC / v_total) * 100;
  v_sell_pct := (v_sell_count::NUMERIC / v_total) * 100;
  v_neutral_pct := (v_neutral_count::NUMERIC / v_total) * 100;

  RETURN QUERY SELECT
    'signal_distribution'::TEXT,
    v_buy_count,
    v_sell_count,
    v_neutral_count,
    ROUND(v_buy_pct, 2),
    ROUND(v_sell_pct, 2),
    ROUND(v_neutral_pct, 2),
    (v_buy_pct > 90 OR v_sell_pct > 90) as is_skewed,
    CASE
      WHEN v_buy_pct > 90 THEN '⚠️ SKEW ALERT: ' || ROUND(v_buy_pct, 1)::TEXT || '% of signals are BUY - possible data quality issue'
      WHEN v_sell_pct > 90 THEN '⚠️ SKEW ALERT: ' || ROUND(v_sell_pct, 1)::TEXT || '% of signals are SELL - possible data quality issue'
      ELSE '✅ Signal distribution is balanced'
    END;
END;
$$;

CREATE OR REPLACE FUNCTION check_ai_fallback_usage()
RETURNS TABLE(
  etl_name TEXT,
  total_runs BIGINT,
  fallback_runs BIGINT,
  fallback_percentage NUMERIC,
  is_excessive BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    il.etl_name,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE il.source_used IN ('Perplexity', 'Gemini', 'Lovable AI')) as fallback_runs,
    ROUND((COUNT(*) FILTER (WHERE il.source_used IN ('Perplexity', 'Gemini', 'Lovable AI'))::NUMERIC / COUNT(*)) * 100, 2) as fallback_pct,
    (COUNT(*) FILTER (WHERE il.source_used IN ('Perplexity', 'Gemini', 'Lovable AI'))::NUMERIC / COUNT(*)) > 0.8 as is_excessive,
    CASE
      WHEN (COUNT(*) FILTER (WHERE il.source_used IN ('Perplexity', 'Gemini', 'Lovable AI'))::NUMERIC / COUNT(*)) > 0.8 
      THEN '⚠️ AI Fallback >80% for ' || il.etl_name || ' - primary source may be down'
      ELSE '✅ Normal fallback usage'
    END as message
  FROM ingest_logs il
  WHERE il.started_at > NOW() - INTERVAL '24 hours'
    AND il.status = 'success'
  GROUP BY il.etl_name
  HAVING COUNT(*) >= 3;
END;
$$;