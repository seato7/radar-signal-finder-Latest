CREATE TABLE IF NOT EXISTS public.backtest_diagnostics (
  snapshot_date date NOT NULL,
  excluded_reason text NOT NULL,
  count int NOT NULL,
  sample_tickers text[] NOT NULL DEFAULT '{}'::text[],
  PRIMARY KEY (snapshot_date, excluded_reason)
);

CREATE INDEX IF NOT EXISTS idx_backtest_diag_date
  ON public.backtest_diagnostics(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_diag_reason
  ON public.backtest_diagnostics(excluded_reason);

ALTER TABLE public.backtest_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backtest diagnostics readable by admins"
  ON public.backtest_diagnostics FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage backtest diagnostics"
  ON public.backtest_diagnostics FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');