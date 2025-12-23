-- Create form4_insider_trades table for SEC Form 4 insider trading data
CREATE TABLE public.form4_insider_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES public.assets(id),
  filing_date DATE NOT NULL,
  transaction_date DATE,
  insider_name TEXT NOT NULL,
  insider_title TEXT,
  transaction_type TEXT, -- 'P' for purchase, 'S' for sale, 'A' for award, etc.
  shares BIGINT,
  price_per_share NUMERIC,
  total_value NUMERIC,
  shares_owned_after BIGINT,
  is_direct_ownership BOOLEAN DEFAULT true,
  form_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  checksum TEXT,
  UNIQUE(ticker, filing_date, insider_name, transaction_type, shares)
);

-- Enable RLS
ALTER TABLE public.form4_insider_trades ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Form4 trades readable by everyone"
ON public.form4_insider_trades
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage form4 trades"
ON public.form4_insider_trades
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create indexes
CREATE INDEX idx_form4_ticker_date ON public.form4_insider_trades(ticker, filing_date DESC);
CREATE INDEX idx_form4_asset_id ON public.form4_insider_trades(asset_id);
CREATE INDEX idx_form4_checksum ON public.form4_insider_trades(checksum);

-- Create policy_feeds table for policy/regulatory data
CREATE TABLE public.policy_feeds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT,
  policy_type TEXT NOT NULL, -- 'regulatory', 'legislation', 'executive_order', etc.
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  source_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  impact_assessment TEXT, -- 'positive', 'negative', 'neutral'
  impact_score NUMERIC,
  affected_sectors TEXT[],
  affected_tickers TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  checksum TEXT UNIQUE
);

-- Enable RLS
ALTER TABLE public.policy_feeds ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Policy feeds readable by everyone"
ON public.policy_feeds
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage policy feeds"
ON public.policy_feeds
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create indexes
CREATE INDEX idx_policy_feeds_ticker ON public.policy_feeds(ticker);
CREATE INDEX idx_policy_feeds_published ON public.policy_feeds(published_at DESC);
CREATE INDEX idx_policy_feeds_type ON public.policy_feeds(policy_type);
CREATE INDEX idx_policy_feeds_checksum ON public.policy_feeds(checksum);