-- Create table to store daily asset score snapshots for historical tracking
CREATE TABLE public.asset_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  ticker TEXT NOT NULL,
  asset_name TEXT,
  computed_score NUMERIC,
  rank INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(snapshot_date, ticker)
);

-- Create indexes for efficient queries
CREATE INDEX idx_snapshots_date ON public.asset_score_snapshots(snapshot_date);
CREATE INDEX idx_snapshots_rank ON public.asset_score_snapshots(snapshot_date, rank);
CREATE INDEX idx_snapshots_ticker ON public.asset_score_snapshots(ticker);

-- Enable RLS
ALTER TABLE public.asset_score_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read snapshots (public data)
CREATE POLICY "Anyone can read asset score snapshots"
ON public.asset_score_snapshots
FOR SELECT
USING (true);

-- Only service role can insert/update (via edge functions)
CREATE POLICY "Service role can manage snapshots"
ON public.asset_score_snapshots
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');