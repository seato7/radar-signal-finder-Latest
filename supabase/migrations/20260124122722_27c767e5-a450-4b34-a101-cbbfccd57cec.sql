-- SECTION C: Create price coverage tracking tables

-- 1) price_coverage_daily - daily snapshot of price freshness per ticker
CREATE TABLE IF NOT EXISTS public.price_coverage_daily (
  snapshot_date date NOT NULL,
  asset_id uuid NULL,
  ticker text NOT NULL,
  asset_class text NULL,
  vendor text NOT NULL DEFAULT 'twelvedata',
  last_price_date date NULL,
  days_stale integer NOT NULL DEFAULT 9999,
  points_30d integer NOT NULL DEFAULT 0,
  points_90d integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('fresh', 'stale', 'missing', 'unsupported')),
  reason text NOT NULL DEFAULT '',
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (snapshot_date, ticker, vendor)
);

-- Indexes for price_coverage_daily
CREATE INDEX IF NOT EXISTS idx_price_coverage_daily_status ON public.price_coverage_daily(snapshot_date, status);
CREATE INDEX IF NOT EXISTS idx_price_coverage_daily_asset_class ON public.price_coverage_daily(snapshot_date, asset_class);
CREATE INDEX IF NOT EXISTS idx_price_coverage_daily_days_stale ON public.price_coverage_daily(snapshot_date, days_stale DESC);

-- 2) price_ingestion_log - per-ticker vendor diagnostics
CREATE TABLE IF NOT EXISTS public.price_ingestion_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL,
  vendor text NOT NULL DEFAULT 'twelvedata',
  ticker text NOT NULL,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  response_code integer NULL,
  vendor_status text NOT NULL CHECK (vendor_status IN ('ok', 'no_data', 'invalid_symbol', 'rate_limited', 'error')),
  rows_inserted integer NOT NULL DEFAULT 0,
  newest_date_returned date NULL,
  error_message text NOT NULL DEFAULT '',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for price_ingestion_log
CREATE INDEX IF NOT EXISTS idx_price_ingestion_log_ticker ON public.price_ingestion_log(ticker);
CREATE INDEX IF NOT EXISTS idx_price_ingestion_log_vendor_status ON public.price_ingestion_log(vendor_status);
CREATE INDEX IF NOT EXISTS idx_price_ingestion_log_run_id ON public.price_ingestion_log(run_id);
CREATE INDEX IF NOT EXISTS idx_price_ingestion_log_requested_at ON public.price_ingestion_log(requested_at DESC);

-- 3) signal_generation_diagnostics - exclusion tracking
CREATE TABLE IF NOT EXISTS public.signal_generation_diagnostics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL,
  generator text NOT NULL,
  excluded_reason text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  sample_tickers text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now()
);

-- Indexes for signal_generation_diagnostics
CREATE INDEX IF NOT EXISTS idx_signal_gen_diag_date ON public.signal_generation_diagnostics(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_signal_gen_diag_generator ON public.signal_generation_diagnostics(generator);

-- 4) Alter assets table - add price tracking columns
-- Using rank_status (text) instead of is_rankable (boolean) because:
-- - Allows distinguishing exclusion reasons: 'rankable', 'stale_price', 'missing_price', 'unsupported', 'no_signals'
-- - Query use-case: SELECT * FROM assets WHERE rank_status = 'rankable' ORDER BY computed_score DESC
ALTER TABLE public.assets 
  ADD COLUMN IF NOT EXISTS price_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_price_date date,
  ADD COLUMN IF NOT EXISTS days_stale integer DEFAULT 9999,
  ADD COLUMN IF NOT EXISTS price_points_30d integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_status text DEFAULT 'rankable';

-- 5) RLS Policies

-- price_coverage_daily: public read, service role write
ALTER TABLE public.price_coverage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_coverage_daily_select_all" 
  ON public.price_coverage_daily 
  FOR SELECT 
  USING (true);

CREATE POLICY "price_coverage_daily_service_role_all" 
  ON public.price_coverage_daily 
  FOR ALL 
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- price_ingestion_log: public read (for debugging transparency), service role write
-- Justification: Ingestion logs help users understand why their ticker has no data
ALTER TABLE public.price_ingestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_ingestion_log_select_all" 
  ON public.price_ingestion_log 
  FOR SELECT 
  USING (true);

CREATE POLICY "price_ingestion_log_service_role_insert" 
  ON public.price_ingestion_log 
  FOR INSERT 
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- signal_generation_diagnostics: public read, service role write
ALTER TABLE public.signal_generation_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_gen_diag_select_all" 
  ON public.signal_generation_diagnostics 
  FOR SELECT 
  USING (true);

CREATE POLICY "signal_gen_diag_service_role_all" 
  ON public.signal_generation_diagnostics 
  FOR ALL 
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');