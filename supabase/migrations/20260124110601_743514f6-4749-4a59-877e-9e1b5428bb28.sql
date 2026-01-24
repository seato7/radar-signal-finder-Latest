-- 1. Add profitability outputs to assets table
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS expected_return numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_label text DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS model_version text DEFAULT 'v1_alpha',
  ADD COLUMN IF NOT EXISTS score_explanation jsonb DEFAULT '[]'::jsonb;

-- 2. Signal alpha calibration table
CREATE TABLE IF NOT EXISTS public.signal_type_alpha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL,
  horizon text NOT NULL DEFAULT '1d',
  avg_forward_return numeric NOT NULL DEFAULT 0,
  hit_rate numeric NOT NULL DEFAULT 0,
  sample_size int NOT NULL DEFAULT 0,
  std_forward_return numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_type, horizon)
);

CREATE INDEX IF NOT EXISTS idx_signal_type_alpha_type
  ON public.signal_type_alpha(signal_type);

-- Enable RLS on signal_type_alpha
ALTER TABLE public.signal_type_alpha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signal type alpha readable by everyone"
  ON public.signal_type_alpha FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage signal type alpha"
  ON public.signal_type_alpha FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- 3. Prediction logging
CREATE TABLE IF NOT EXISTS public.asset_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at timestamptz NOT NULL DEFAULT now(),
  snapshot_date date NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  expected_return numeric NOT NULL,
  confidence_score numeric NOT NULL,
  confidence_label text NOT NULL,
  rank int NOT NULL,
  model_version text NOT NULL,
  feature_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_asset_predictions_snapshot_rank
  ON public.asset_predictions(snapshot_date, rank);

CREATE INDEX IF NOT EXISTS idx_asset_predictions_ticker
  ON public.asset_predictions(ticker);

-- Enable RLS on asset_predictions
ALTER TABLE public.asset_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asset predictions readable by everyone"
  ON public.asset_predictions FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage asset predictions"
  ON public.asset_predictions FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- 4. Prediction grading results
CREATE TABLE IF NOT EXISTS public.asset_prediction_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES public.asset_predictions(id) ON DELETE CASCADE,
  horizon text NOT NULL DEFAULT '1d',
  realized_return numeric NOT NULL DEFAULT 0,
  hit boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_prediction_results_pred
  ON public.asset_prediction_results(prediction_id);

CREATE INDEX IF NOT EXISTS idx_asset_prediction_results_horizon
  ON public.asset_prediction_results(horizon);

-- Enable RLS on asset_prediction_results
ALTER TABLE public.asset_prediction_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asset prediction results readable by everyone"
  ON public.asset_prediction_results FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage asset prediction results"
  ON public.asset_prediction_results FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- 5. Signal dedupe index (using existing checksum column)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_signals_checksum
  ON public.signals(checksum)
  WHERE checksum IS NOT NULL;

-- 6. Fast lookups index for signal-asset queries
CREATE INDEX IF NOT EXISTS idx_signals_asset_type_observed
  ON public.signals(asset_id, signal_type, observed_at DESC);

-- 7. Index for price lookups by ticker and date (used by alpha calculation)
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date
  ON public.prices(ticker, date DESC);