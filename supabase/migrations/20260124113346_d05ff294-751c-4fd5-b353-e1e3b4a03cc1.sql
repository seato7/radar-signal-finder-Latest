-- Model Daily Metrics table for tracking performance per model version
CREATE TABLE IF NOT EXISTS public.model_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL,
  snapshot_date date NOT NULL,
  top_n int NOT NULL,
  hit_rate numeric NOT NULL DEFAULT 0,
  mean_return numeric NOT NULL DEFAULT 0,
  median_return numeric NOT NULL DEFAULT 0,
  volatility numeric NOT NULL DEFAULT 0,
  p5_return numeric NOT NULL DEFAULT 0,
  max_drawdown numeric NOT NULL DEFAULT 0,
  cumulative_return numeric NOT NULL DEFAULT 0,
  objective_score numeric NOT NULL DEFAULT 0,
  predictions_count int NOT NULL DEFAULT 0,
  graded_count int NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(model_version, snapshot_date, top_n)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_model_daily_metrics_version_date 
  ON public.model_daily_metrics(model_version, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_model_daily_metrics_objective 
  ON public.model_daily_metrics(objective_score DESC);

-- Enable RLS
ALTER TABLE public.model_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Public read access for model metrics
CREATE POLICY "Model daily metrics readable by everyone" 
  ON public.model_daily_metrics FOR SELECT 
  USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage model daily metrics" 
  ON public.model_daily_metrics FOR ALL 
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Add top_n column to asset_predictions if not exists (to track N=20,50,100)
ALTER TABLE public.asset_predictions 
  ADD COLUMN IF NOT EXISTS top_n int DEFAULT 100;

-- Create index on top_n for filtering
CREATE INDEX IF NOT EXISTS idx_asset_predictions_top_n 
  ON public.asset_predictions(snapshot_date, top_n, rank);