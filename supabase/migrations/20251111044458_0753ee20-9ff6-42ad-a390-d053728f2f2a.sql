-- Add last_updated_at to critical data tables for staleness monitoring
ALTER TABLE prices ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE forex_sentiment ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE crypto_onchain_metrics ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE news_sentiment_aggregate ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE advanced_technicals ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE economic_indicators ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add cache_hit and latency_ms to ingest_logs for monitoring
ALTER TABLE ingest_logs ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT FALSE;
ALTER TABLE ingest_logs ADD COLUMN IF NOT EXISTS latency_ms INTEGER DEFAULT NULL;
ALTER TABLE ingest_logs ADD COLUMN IF NOT EXISTS verified_source TEXT DEFAULT NULL;

-- Add fallback_used boolean to signals for easier querying
ALTER TABLE signals ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN DEFAULT FALSE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prices_last_updated ON prices(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forex_sentiment_last_updated ON forex_sentiment(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_onchain_last_updated ON crypto_onchain_metrics(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_last_updated ON news_sentiment_aggregate(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_advanced_technicals_last_updated ON advanced_technicals(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_last_updated ON economic_indicators(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_logs_cache_hit ON ingest_logs(cache_hit);
CREATE INDEX IF NOT EXISTS idx_signals_fallback_used ON signals(fallback_used);

-- Create view for stale tickers (data older than 5 seconds)
CREATE OR REPLACE VIEW view_stale_tickers AS
SELECT 
  'prices' as table_name,
  ticker,
  'stock' as asset_class,
  last_updated_at,
  EXTRACT(EPOCH FROM (NOW() - last_updated_at)) as seconds_stale
FROM prices
WHERE last_updated_at < NOW() - INTERVAL '5 seconds'
UNION ALL
SELECT 
  'forex_sentiment' as table_name,
  ticker,
  'forex' as asset_class,
  last_updated_at,
  EXTRACT(EPOCH FROM (NOW() - last_updated_at)) as seconds_stale
FROM forex_sentiment
WHERE last_updated_at < NOW() - INTERVAL '5 seconds'
UNION ALL
SELECT 
  'crypto_onchain_metrics' as table_name,
  ticker,
  'crypto' as asset_class,
  last_updated_at,
  EXTRACT(EPOCH FROM (NOW() - last_updated_at)) as seconds_stale
FROM crypto_onchain_metrics
WHERE last_updated_at < NOW() - INTERVAL '5 seconds'
UNION ALL
SELECT 
  'news_sentiment_aggregate' as table_name,
  ticker,
  'stock' as asset_class,
  last_updated_at,
  EXTRACT(EPOCH FROM (NOW() - last_updated_at)) as seconds_stale
FROM news_sentiment_aggregate
WHERE last_updated_at < NOW() - INTERVAL '5 seconds'
UNION ALL
SELECT 
  'advanced_technicals' as table_name,
  ticker,
  asset_class,
  last_updated_at,
  EXTRACT(EPOCH FROM (NOW() - last_updated_at)) as seconds_stale
FROM advanced_technicals
WHERE last_updated_at < NOW() - INTERVAL '5 seconds'
ORDER BY seconds_stale DESC;

-- Create view for fallback usage monitoring
CREATE OR REPLACE VIEW view_fallback_usage AS
SELECT 
  etl_name,
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE source_used IN ('Perplexity', 'Gemini', 'Lovable AI')) as fallback_runs,
  ROUND((COUNT(*) FILTER (WHERE source_used IN ('Perplexity', 'Gemini', 'Lovable AI'))::NUMERIC / COUNT(*)) * 100, 2) as fallback_percentage,
  COUNT(*) FILTER (WHERE cache_hit = TRUE) as cache_hits,
  ROUND((COUNT(*) FILTER (WHERE cache_hit = TRUE)::NUMERIC / COUNT(*)) * 100, 2) as cache_hit_percentage,
  AVG(latency_ms) as avg_latency_ms,
  MAX(latency_ms) as max_latency_ms
FROM ingest_logs
WHERE started_at > NOW() - INTERVAL '1 hour'
  AND status = 'success'
GROUP BY etl_name
ORDER BY fallback_percentage DESC;

-- Create view for API error monitoring
CREATE OR REPLACE VIEW view_api_errors AS
SELECT 
  etl_name,
  COUNT(*) as error_count,
  MAX(started_at) as last_error_at,
  string_agg(DISTINCT error_message, ' | ') as error_messages
FROM ingest_logs
WHERE status IN ('failure', 'failed')
  AND started_at > NOW() - INTERVAL '10 minutes'
GROUP BY etl_name
HAVING COUNT(*) >= 3
ORDER BY error_count DESC;

-- Create function to check for excessive fallback usage in last 10 minutes
CREATE OR REPLACE FUNCTION check_excessive_fallback_usage()
RETURNS TABLE(
  etl_name TEXT,
  fallback_percentage NUMERIC,
  total_runs BIGINT,
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
    ROUND((COUNT(*) FILTER (WHERE il.source_used IN ('Perplexity', 'Gemini', 'Lovable AI'))::NUMERIC / COUNT(*)) * 100, 2) as fallback_pct,
    COUNT(*) as total,
    '⚠️ FALLBACK ALERT: ' || il.etl_name || ' using AI fallback ' || 
    ROUND((COUNT(*) FILTER (WHERE il.source_used IN ('Perplexity', 'Gemini', 'Lovable AI'))::NUMERIC / COUNT(*)) * 100, 1)::TEXT || 
    '% in last 10min' as msg
  FROM ingest_logs il
  WHERE il.started_at > NOW() - INTERVAL '10 minutes'
    AND il.status = 'success'
  GROUP BY il.etl_name
  HAVING (COUNT(*) FILTER (WHERE il.source_used IN ('Perplexity', 'Gemini', 'Lovable AI'))::NUMERIC / COUNT(*)) > 0.02
  ORDER BY fallback_pct DESC;
END;
$$;

-- Create function to get stale tickers by asset class
CREATE OR REPLACE FUNCTION get_stale_tickers(p_asset_class TEXT DEFAULT NULL)
RETURNS TABLE(
  table_name TEXT,
  ticker TEXT,
  asset_class TEXT,
  last_updated_at TIMESTAMP WITH TIME ZONE,
  seconds_stale NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM view_stale_tickers
  WHERE p_asset_class IS NULL OR asset_class = p_asset_class
  ORDER BY seconds_stale DESC;
$$;