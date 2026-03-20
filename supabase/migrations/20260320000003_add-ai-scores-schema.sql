-- ai_scores table: stores LLM chain-of-thought scoring results per asset
-- Parallel to formula-based compute-asset-scores; used to produce hybrid_score

CREATE TABLE IF NOT EXISTS ai_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  ticker TEXT NOT NULL,
  ai_score NUMERIC(5,2) CHECK (ai_score >= 0 AND ai_score <= 100),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  direction TEXT CHECK (direction IN ('up', 'down', 'neutral')),
  reasoning TEXT,
  key_signals JSONB DEFAULT '[]',
  formula_score NUMERIC(5,2),
  hybrid_score NUMERIC(5,2),
  model_version TEXT DEFAULT 'v1_hybrid',
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on asset_id so upsert onConflict:'asset_id' keeps one row per asset
-- (latest score; historical scores are preserved via scored_at timestamp)
CREATE UNIQUE INDEX IF NOT EXISTS ai_scores_asset_id_unique ON ai_scores(asset_id);
CREATE INDEX IF NOT EXISTS ai_scores_asset_id_idx ON ai_scores(asset_id);
CREATE INDEX IF NOT EXISTS ai_scores_scored_at_idx ON ai_scores(scored_at DESC);
CREATE INDEX IF NOT EXISTS ai_scores_ticker_idx ON ai_scores(ticker);

-- Add ai_score and hybrid_score columns to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_score NUMERIC(5,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS hybrid_score NUMERIC(5,2);
