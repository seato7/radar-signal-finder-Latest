-- Priority 1: Create signal_theme_map table for alert pipeline
CREATE TABLE IF NOT EXISTS signal_theme_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES themes(id) ON DELETE CASCADE,
  relevance_score NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(signal_id, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_signal_theme_map_signal ON signal_theme_map(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_theme_map_theme ON signal_theme_map(theme_id);

-- Enable RLS
ALTER TABLE signal_theme_map ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "signal_theme_map_read" ON signal_theme_map FOR SELECT USING (true);

-- Service role can write
CREATE POLICY "signal_theme_map_write" ON signal_theme_map FOR ALL 
  USING (auth.jwt() ->> 'role' = 'service_role');