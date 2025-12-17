-- Create news coverage tracker table for intelligent rotation
CREATE TABLE IF NOT EXISTS public.news_coverage_tracker (
  ticker TEXT PRIMARY KEY,
  last_processed_at TIMESTAMP WITH TIME ZONE,
  process_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.news_coverage_tracker ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "News coverage tracker readable by everyone"
  ON public.news_coverage_tracker
  FOR SELECT
  USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage news coverage tracker"
  ON public.news_coverage_tracker
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Index for efficient rotation queries
CREATE INDEX idx_news_coverage_last_processed 
  ON public.news_coverage_tracker(last_processed_at ASC NULLS FIRST);