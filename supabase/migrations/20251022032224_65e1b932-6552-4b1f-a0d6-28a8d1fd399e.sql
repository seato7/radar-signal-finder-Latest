-- Create table for breaking news and web search results
CREATE TABLE IF NOT EXISTS public.breaking_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  source VARCHAR,
  url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  sentiment_score DOUBLE PRECISION,
  relevance_score DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for Twitter signals
CREATE TABLE IF NOT EXISTS public.twitter_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR NOT NULL,
  mention_count INTEGER DEFAULT 0,
  sentiment_score DOUBLE PRECISION,
  bullish_count INTEGER DEFAULT 0,
  bearish_count INTEGER DEFAULT 0,
  influencer_mentions INTEGER DEFAULT 0,
  tweet_volume INTEGER DEFAULT 0,
  top_tweets JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for options flow data
CREATE TABLE IF NOT EXISTS public.options_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR NOT NULL,
  option_type VARCHAR, -- 'call' or 'put'
  strike_price DOUBLE PRECISION,
  expiration_date DATE,
  premium BIGINT,
  volume INTEGER,
  open_interest INTEGER,
  implied_volatility DOUBLE PRECISION,
  flow_type VARCHAR, -- 'sweep', 'block', 'split', etc.
  sentiment VARCHAR, -- 'bullish', 'bearish', 'neutral'
  trade_date TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for job postings data
CREATE TABLE IF NOT EXISTS public.job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR NOT NULL,
  company VARCHAR NOT NULL,
  job_title VARCHAR,
  department VARCHAR,
  location VARCHAR,
  posting_count INTEGER DEFAULT 1,
  role_type VARCHAR, -- 'engineering', 'sales', 'operations', etc.
  seniority_level VARCHAR,
  posted_date DATE,
  growth_indicator DOUBLE PRECISION, -- percentage change from previous period
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for supply chain data
CREATE TABLE IF NOT EXISTS public.supply_chain_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR NOT NULL,
  signal_type VARCHAR NOT NULL, -- 'shipping', 'inventory', 'supplier', etc.
  metric_name VARCHAR,
  metric_value DOUBLE PRECISION,
  change_percentage DOUBLE PRECISION,
  indicator VARCHAR, -- 'bullish', 'bearish', 'neutral'
  report_date DATE NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_breaking_news_ticker ON public.breaking_news(ticker);
CREATE INDEX IF NOT EXISTS idx_breaking_news_published ON public.breaking_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitter_signals_ticker ON public.twitter_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_twitter_signals_created ON public.twitter_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_options_flow_ticker ON public.options_flow(ticker);
CREATE INDEX IF NOT EXISTS idx_options_flow_trade_date ON public.options_flow(trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_ticker ON public.job_postings(ticker);
CREATE INDEX IF NOT EXISTS idx_supply_chain_ticker ON public.supply_chain_signals(ticker);

-- Enable RLS
ALTER TABLE public.breaking_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitter_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_chain_signals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public read access
CREATE POLICY "Allow public read access to breaking news"
  ON public.breaking_news FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to manage breaking news"
  ON public.breaking_news FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Allow public read access to twitter signals"
  ON public.twitter_signals FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to manage twitter signals"
  ON public.twitter_signals FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Allow public read access to options flow"
  ON public.options_flow FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to manage options flow"
  ON public.options_flow FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Allow public read access to job postings"
  ON public.job_postings FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to manage job postings"
  ON public.job_postings FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Allow public read access to supply chain signals"
  ON public.supply_chain_signals FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to manage supply chain signals"
  ON public.supply_chain_signals FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);