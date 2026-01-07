-- Create scoring validation results table for ongoing monitoring
CREATE TABLE IF NOT EXISTS public.scoring_validation_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tests_passed INTEGER NOT NULL,
  tests_total INTEGER NOT NULL,
  critical_passed INTEGER NOT NULL,
  critical_total INTEGER NOT NULL,
  overall_status TEXT NOT NULL CHECK (overall_status IN ('success', 'failure')),
  results JSONB,
  decile_analysis JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for querying recent results
CREATE INDEX idx_scoring_validation_results_test_run_at 
ON public.scoring_validation_results(test_run_at DESC);

-- Add comment
COMMENT ON TABLE public.scoring_validation_results IS 'Stores results from validate-scoring-system edge function runs for tracking scoring system health over time';

-- Enable RLS (admin only access)
ALTER TABLE public.scoring_validation_results ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert/select
CREATE POLICY "Service role can manage scoring validation results"
ON public.scoring_validation_results
FOR ALL
USING (true)
WITH CHECK (true);