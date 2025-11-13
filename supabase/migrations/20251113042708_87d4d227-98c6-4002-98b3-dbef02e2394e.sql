-- Create function_status heartbeat table for monitoring
CREATE TABLE IF NOT EXISTS public.function_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'skipped')),
  rows_inserted INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  fallback_used TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  source_used TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_function_status_function_name ON public.function_status(function_name);
CREATE INDEX IF NOT EXISTS idx_function_status_executed_at ON public.function_status(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_function_status_status ON public.function_status(status);

-- Create freshness monitoring view
CREATE OR REPLACE VIEW public.view_function_freshness AS
SELECT 
  function_name,
  MAX(executed_at) as last_run,
  EXTRACT(EPOCH FROM (NOW() - MAX(executed_at))) as seconds_since_last_run,
  COUNT(*) FILTER (WHERE status = 'success') as success_count,
  COUNT(*) FILTER (WHERE status = 'failure') as failure_count,
  COUNT(*) FILTER (WHERE status = 'skipped') as skipped_count,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) as success_rate_pct,
  SUM(rows_inserted) as total_rows_inserted,
  SUM(rows_skipped) as total_rows_skipped,
  COUNT(*) FILTER (WHERE fallback_used IS NOT NULL) as fallback_used_count
FROM public.function_status
WHERE executed_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name
ORDER BY last_run DESC;

-- Create function to check staleness
CREATE OR REPLACE FUNCTION public.check_function_staleness(
  p_function_name TEXT,
  p_max_age_minutes INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last_run TIMESTAMPTZ;
  v_age_minutes INTEGER;
BEGIN
  SELECT MAX(executed_at) INTO v_last_run
  FROM public.function_status
  WHERE function_name = p_function_name;
  
  IF v_last_run IS NULL THEN
    RETURN TRUE; -- Never run = stale
  END IF;
  
  v_age_minutes := EXTRACT(EPOCH FROM (NOW() - v_last_run)) / 60;
  
  RETURN v_age_minutes > p_max_age_minutes;
END;
$$;

-- Create alert function for stale data
CREATE OR REPLACE FUNCTION public.get_stale_functions()
RETURNS TABLE(
  function_name TEXT,
  last_run TIMESTAMPTZ,
  minutes_stale NUMERIC,
  expected_interval_minutes INTEGER,
  alert_severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH expected_intervals AS (
    SELECT 'ingest-prices-yahoo'::TEXT as fn, 15 as interval_min UNION ALL
    SELECT 'ingest-breaking-news', 180 UNION ALL
    SELECT 'ingest-news-sentiment', 180 UNION ALL
    SELECT 'ingest-smart-money', 360 UNION ALL
    SELECT 'ingest-pattern-recognition', 360 UNION ALL
    SELECT 'ingest-advanced-technicals', 360 UNION ALL
    SELECT 'ingest-ai-research', 360
  ),
  latest_runs AS (
    SELECT 
      fs.function_name,
      MAX(fs.executed_at) as last_executed
    FROM public.function_status fs
    GROUP BY fs.function_name
  )
  SELECT 
    ei.fn as function_name,
    lr.last_executed as last_run,
    ROUND(EXTRACT(EPOCH FROM (NOW() - lr.last_executed)) / 60, 1) as minutes_stale,
    ei.interval_min as expected_interval_minutes,
    CASE 
      WHEN EXTRACT(EPOCH FROM (NOW() - lr.last_executed)) / 60 > ei.interval_min * 3 THEN 'CRITICAL'
      WHEN EXTRACT(EPOCH FROM (NOW() - lr.last_executed)) / 60 > ei.interval_min * 2 THEN 'WARNING'
      ELSE 'OK'
    END as alert_severity
  FROM expected_intervals ei
  LEFT JOIN latest_runs lr ON ei.fn = lr.function_name
  WHERE lr.last_executed IS NULL 
    OR EXTRACT(EPOCH FROM (NOW() - lr.last_executed)) / 60 > ei.interval_min * 2
  ORDER BY minutes_stale DESC NULLS FIRST;
END;
$$;