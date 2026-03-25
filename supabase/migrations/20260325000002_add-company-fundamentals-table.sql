CREATE TABLE IF NOT EXISTS public.company_fundamentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  net_margin NUMERIC,
  roa NUMERIC,
  roe NUMERIC,
  revenue_growth_yoy NUMERIC,
  eps_growth_5y NUMERIC,
  beta NUMERIC,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_fundamentals
  ADD CONSTRAINT company_fundamentals_ticker_key UNIQUE (ticker);

CREATE INDEX IF NOT EXISTS idx_company_fundamentals_fetched_at ON public.company_fundamentals(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_fundamentals_net_margin ON public.company_fundamentals(net_margin) WHERE net_margin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_fundamentals_roe ON public.company_fundamentals(roe) WHERE roe IS NOT NULL;
