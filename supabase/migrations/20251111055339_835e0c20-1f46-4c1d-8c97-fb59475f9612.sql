-- Drop existing views if they exist
DROP VIEW IF EXISTS view_stale_tickers;
DROP VIEW IF EXISTS view_fallback_usage;
DROP VIEW IF EXISTS view_api_errors;
DROP VIEW IF EXISTS view_test_suite_summary;

-- Create view for stale tickers across all tables with last_updated_at
CREATE VIEW view_stale_tickers AS
WITH ticker_freshness AS (
  SELECT 'prices' as table_name, ticker, 'stock' as asset_class, last_updated_at
  FROM prices
  WHERE last_updated_at IS NOT NULL
  
  UNION ALL
  
  SELECT 'forex_sentiment', ticker, 'forex', last_updated_at
  FROM forex_sentiment
  WHERE last_updated_at IS NOT NULL
  
  UNION ALL
  
  SELECT 'crypto_onchain_metrics', ticker, 'crypto', last_updated_at
  FROM crypto_onchain_metrics
  WHERE last_updated_at IS NOT NULL
  
  UNION ALL
  
  SELECT 'news_sentiment_aggregate', ticker, 'stock', last_updated_at
  FROM news_sentiment_aggregate
  WHERE last_updated_at IS NOT NULL
  
  UNION ALL
  
  SELECT 'advanced_technicals', ticker, asset_class, last_updated_at
  FROM advanced_technicals
  WHERE last_updated_at IS NOT NULL
)
SELECT 
  table_name,
  ticker,
  asset_class,
  last_updated_at,
  EXTRACT(EPOCH FROM (NOW() - last_updated_at)) as seconds_stale
FROM ticker_freshness
WHERE last_updated_at < NOW() - INTERVAL '5 seconds'
ORDER BY seconds_stale DESC;

-- Create view for fallback usage statistics
CREATE VIEW view_fallback_usage AS
SELECT 
  etl_name,
  COUNT(*) as total_runs,
  COALESCE(SUM(fallback_count), 0) as fallback_count,
  ROUND((COALESCE(SUM(fallback_count), 0)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as fallback_percentage,
  MAX(started_at) as last_run_at
FROM ingest_logs
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY etl_name
ORDER BY fallback_percentage DESC NULLS LAST;

-- Create view for API errors
CREATE VIEW view_api_errors AS
SELECT 
  etl_name,
  status,
  error_message,
  started_at as error_time,
  duration_seconds,
  metadata
FROM ingest_logs
WHERE status IN ('failure', 'failed', 'error')
  AND started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;

-- Create view for test suite summary
CREATE VIEW view_test_suite_summary AS
SELECT 
  test_suite,
  COUNT(*) as total_tests,
  COUNT(*) FILTER (WHERE status = 'PASS') as passed,
  COUNT(*) FILTER (WHERE status = 'FAIL') as failed,
  COUNT(*) FILTER (WHERE status = 'WARN') as warnings,
  MAX(tested_at) as last_run_at
FROM ingest_logs_test_audit
GROUP BY test_suite
ORDER BY last_run_at DESC NULLS LAST;