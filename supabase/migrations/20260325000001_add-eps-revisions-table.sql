CREATE TABLE IF NOT EXISTS public.eps_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  current_estimate NUMERIC,
  prior_estimate NUMERIC,
  revision_pct NUMERIC,
  revision_direction TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.eps_revisions
  ADD CONSTRAINT eps_revisions_ticker_period_key UNIQUE (ticker, period);

CREATE INDEX IF NOT EXISTS idx_eps_revisions_ticker ON public.eps_revisions(ticker);
CREATE INDEX IF NOT EXISTS idx_eps_revisions_fetched_at ON public.eps_revisions(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_eps_revisions_direction ON public.eps_revisions(revision_direction) WHERE revision_direction IS NOT NULL;
