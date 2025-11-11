-- Phase 2: Add source_used tracking to signals and ingest_logs

-- Add source_used column to signals table
ALTER TABLE signals 
ADD COLUMN IF NOT EXISTS source_used TEXT DEFAULT 'unknown';

-- Add source_used column to ingest_logs table  
ALTER TABLE ingest_logs
ADD COLUMN IF NOT EXISTS source_used TEXT DEFAULT 'unknown';

-- Create index for faster queries on source usage
CREATE INDEX IF NOT EXISTS idx_signals_source_used ON signals(source_used);
CREATE INDEX IF NOT EXISTS idx_ingest_logs_source_used ON ingest_logs(source_used);

-- Add fallback_count to ingest_logs for tracking AI fallback usage
ALTER TABLE ingest_logs
ADD COLUMN IF NOT EXISTS fallback_count INTEGER DEFAULT 0;

-- Create view for source usage monitoring
CREATE OR REPLACE VIEW source_usage_stats AS
SELECT 
  source_used,
  COUNT(*) as total_signals,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage,
  MIN(observed_at) as first_seen,
  MAX(observed_at) as last_seen
FROM signals
WHERE observed_at > NOW() - INTERVAL '7 days'
GROUP BY source_used
ORDER BY total_signals DESC;

COMMENT ON VIEW source_usage_stats IS 'Track signal source distribution over last 7 days';

-- Create function to detect signal distribution skew
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
  -- Count signals from last ingestion run (last hour)
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

COMMENT ON FUNCTION check_signal_distribution_skew IS 'Detect if >90% of signals are skewed to one direction';

-- Create function to detect excessive AI fallback usage
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
  HAVING COUNT(*) >= 3; -- Only check ETLs with at least 3 runs
END;
$$;