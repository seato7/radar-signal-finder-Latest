-- Extend signals table with composite scoring fields
ALTER TABLE signals 
ADD COLUMN IF NOT EXISTS composite_score numeric,
ADD COLUMN IF NOT EXISTS score_factors jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS signal_classification text,
ADD COLUMN IF NOT EXISTS asset_class text;

-- Add index for efficient querying by score and classification
CREATE INDEX IF NOT EXISTS idx_signals_composite_score ON signals(composite_score DESC) WHERE composite_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_classification ON signals(signal_classification);
CREATE INDEX IF NOT EXISTS idx_signals_asset_class ON signals(asset_class);

-- Create scoring configuration table for dynamic weight management
CREATE TABLE IF NOT EXISTS scoring_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_name text NOT NULL UNIQUE,
  weights jsonb NOT NULL DEFAULT '{
    "technical": 0.30,
    "institutional": 0.25,
    "sentiment": 0.20,
    "macro": 0.15,
    "onchain": 0.10
  }'::jsonb,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on scoring_config
ALTER TABLE scoring_config ENABLE ROW LEVEL SECURITY;

-- Public read access for scoring config
CREATE POLICY "Scoring config readable by everyone"
ON scoring_config FOR SELECT
USING (true);

-- Service role can manage scoring config
CREATE POLICY "Service role can manage scoring config"
ON scoring_config FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- Insert default scoring configuration
INSERT INTO scoring_config (config_name, weights, description, is_active)
VALUES (
  'default',
  '{
    "technical": 0.30,
    "institutional": 0.25,
    "sentiment": 0.20,
    "macro": 0.15,
    "onchain": 0.10
  }'::jsonb,
  'Default composite scoring weights across signal dimensions',
  true
) ON CONFLICT (config_name) DO NOTHING;