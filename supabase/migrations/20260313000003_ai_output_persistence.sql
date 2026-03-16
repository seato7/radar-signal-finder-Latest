-- Add ai_explanation column to signals table
ALTER TABLE signals ADD COLUMN IF NOT EXISTS ai_explanation TEXT;

-- New table for theme-level AI analysis
CREATE TABLE IF NOT EXISTS theme_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID REFERENCES themes(id),
  theme_name TEXT,
  analysis_type TEXT NOT NULL,
  summary TEXT,
  key_drivers JSONB,
  signal_count INT,
  strength TEXT,
  days_window INT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  model TEXT DEFAULT 'gemini-2.5-flash'
);

-- New table for backtest analyses
CREATE TABLE IF NOT EXISTS backtest_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT,
  insights TEXT NOT NULL,
  backtest_result_snapshot JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  model TEXT DEFAULT 'gemini-2.5-flash'
);
