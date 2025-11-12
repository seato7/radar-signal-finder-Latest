-- Create ingest_failures table for detailed error tracking
CREATE TABLE IF NOT EXISTS ingest_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etl_name text NOT NULL,
  ticker text,
  error_type text NOT NULL, -- 'api_auth', 'rate_limit', 'validation', 'network', 'unknown'
  error_message text NOT NULL,
  status_code integer,
  retry_count integer DEFAULT 0,
  failed_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE ingest_failures ENABLE ROW LEVEL SECURITY;

-- Service role can manage failures
CREATE POLICY "Service role can manage ingest failures"
ON ingest_failures
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Public read access for monitoring
CREATE POLICY "Public read access to ingest failures"
ON ingest_failures
FOR SELECT
USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ingest_failures_etl_failed_at 
ON ingest_failures(etl_name, failed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingest_failures_error_type 
ON ingest_failures(error_type, failed_at DESC);

-- Create view for duplicate key error tracking
CREATE OR REPLACE VIEW view_duplicate_key_errors AS
SELECT 
  DATE_TRUNC('hour', failed_at) as error_hour,
  etl_name,
  COUNT(*) as error_count,
  MAX(failed_at) as last_occurrence
FROM ingest_failures
WHERE error_type = 'duplicate_key'
  AND failed_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', failed_at), etl_name
HAVING COUNT(*) >= 5
ORDER BY error_hour DESC;