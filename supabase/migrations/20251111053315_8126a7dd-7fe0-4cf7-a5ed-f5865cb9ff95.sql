-- Create test audit table for tracking pipeline validation tests
CREATE TABLE IF NOT EXISTS public.ingest_logs_test_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_suite VARCHAR(100) NOT NULL,
  test_name VARCHAR(200) NOT NULL,
  status VARCHAR(50) NOT NULL, -- PASS, FAIL, WARN, SKIP
  ticker VARCHAR(50),
  expected_result TEXT,
  actual_result TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  execution_time_ms INTEGER,
  tested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_test_audit_tested_at ON public.ingest_logs_test_audit(tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_audit_status ON public.ingest_logs_test_audit(status);
CREATE INDEX IF NOT EXISTS idx_test_audit_suite ON public.ingest_logs_test_audit(test_suite);

-- Enable RLS
ALTER TABLE public.ingest_logs_test_audit ENABLE ROW LEVEL SECURITY;

-- Allow public read access for test results
CREATE POLICY "Test audit results readable by everyone"
ON public.ingest_logs_test_audit
FOR SELECT
USING (true);

-- Service role can manage test results
CREATE POLICY "Service role can manage test audit"
ON public.ingest_logs_test_audit
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create view for test summary
CREATE OR REPLACE VIEW public.view_test_suite_summary AS
SELECT 
  test_suite,
  COUNT(*) as total_tests,
  COUNT(*) FILTER (WHERE status = 'PASS') as passed,
  COUNT(*) FILTER (WHERE status = 'FAIL') as failed,
  COUNT(*) FILTER (WHERE status = 'WARN') as warnings,
  MAX(tested_at) as last_run_at,
  AVG(execution_time_ms) as avg_execution_time_ms
FROM public.ingest_logs_test_audit
WHERE tested_at > NOW() - INTERVAL '24 hours'
GROUP BY test_suite
ORDER BY last_run_at DESC;