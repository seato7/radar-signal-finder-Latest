-- Create ingestion logs table for tracking all ETL runs
CREATE TABLE IF NOT EXISTS public.ingest_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etl_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'running')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for faster queries
CREATE INDEX idx_ingest_logs_etl_name ON public.ingest_logs(etl_name);
CREATE INDEX idx_ingest_logs_status ON public.ingest_logs(status);
CREATE INDEX idx_ingest_logs_started_at ON public.ingest_logs(started_at DESC);

-- Enable RLS (public read access for monitoring)
ALTER TABLE public.ingest_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for ingest logs"
  ON public.ingest_logs
  FOR SELECT
  USING (true);

CREATE POLICY "Service role write access"
  ON public.ingest_logs
  FOR INSERT
  WITH CHECK (true);