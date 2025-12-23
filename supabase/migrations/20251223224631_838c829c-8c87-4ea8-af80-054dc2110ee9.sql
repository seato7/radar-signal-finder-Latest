-- Add computed_score and score_computed_at columns to assets table
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS computed_score NUMERIC DEFAULT 50;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS score_computed_at TIMESTAMPTZ;

-- Create index for efficient score-based sorting
CREATE INDEX IF NOT EXISTS idx_assets_computed_score ON public.assets(computed_score DESC NULLS LAST);

-- Create composite index for score sorting with asset class filter
CREATE INDEX IF NOT EXISTS idx_assets_score_class ON public.assets(asset_class, computed_score DESC NULLS LAST);