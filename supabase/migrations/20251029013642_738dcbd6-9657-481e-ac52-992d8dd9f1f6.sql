-- Create social_signals table for Reddit and StockTwits sentiment
CREATE TABLE IF NOT EXISTS public.social_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('reddit', 'stocktwits')),
  mention_count INTEGER NOT NULL DEFAULT 0,
  sentiment_score FLOAT NOT NULL DEFAULT 0,
  bullish_count INTEGER NOT NULL DEFAULT 0,
  bearish_count INTEGER NOT NULL DEFAULT 0,
  post_volume INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_social_signals_ticker ON public.social_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_social_signals_created_at ON public.social_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_signals_source ON public.social_signals(source);

-- Enable RLS
ALTER TABLE public.social_signals ENABLE ROW LEVEL SECURITY;

-- Allow public read access for social signals
CREATE POLICY "Allow public read access to social signals"
  ON public.social_signals
  FOR SELECT
  USING (true);

-- Allow service role to insert
CREATE POLICY "Allow service role to insert social signals"
  ON public.social_signals
  FOR INSERT
  WITH CHECK (true);

-- Create congressional_trades table
CREATE TABLE IF NOT EXISTS public.congressional_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  representative TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  amount_range TEXT,
  disclosure_date DATE,
  party TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_congressional_trades_ticker ON public.congressional_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_congressional_trades_date ON public.congressional_trades(transaction_date DESC);

ALTER TABLE public.congressional_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to congressional trades"
  ON public.congressional_trades
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert congressional trades"
  ON public.congressional_trades
  FOR INSERT
  WITH CHECK (true);

-- Create patent_filings table
CREATE TABLE IF NOT EXISTS public.patent_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  patent_number TEXT,
  title TEXT NOT NULL,
  filing_date DATE NOT NULL,
  grant_date DATE,
  category TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patent_filings_ticker ON public.patent_filings(ticker);
CREATE INDEX IF NOT EXISTS idx_patent_filings_date ON public.patent_filings(filing_date DESC);

ALTER TABLE public.patent_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to patent filings"
  ON public.patent_filings
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert patent filings"
  ON public.patent_filings
  FOR INSERT
  WITH CHECK (true);

-- Create search_trends table
CREATE TABLE IF NOT EXISTS public.search_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  search_volume INTEGER NOT NULL,
  trend_score FLOAT NOT NULL,
  timeframe TEXT DEFAULT 'daily',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_trends_ticker ON public.search_trends(ticker);
CREATE INDEX IF NOT EXISTS idx_search_trends_created_at ON public.search_trends(created_at DESC);

ALTER TABLE public.search_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to search trends"
  ON public.search_trends
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert search trends"
  ON public.search_trends
  FOR INSERT
  WITH CHECK (true);

-- Create short_interest table
CREATE TABLE IF NOT EXISTS public.short_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  short_volume BIGINT NOT NULL,
  short_interest_ratio FLOAT,
  days_to_cover FLOAT,
  report_date DATE NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_short_interest_ticker ON public.short_interest(ticker);
CREATE INDEX IF NOT EXISTS idx_short_interest_date ON public.short_interest(report_date DESC);

ALTER TABLE public.short_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to short interest"
  ON public.short_interest
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert short interest"
  ON public.short_interest
  FOR INSERT
  WITH CHECK (true);

-- Create earnings_sentiment table
CREATE TABLE IF NOT EXISTS public.earnings_sentiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  earnings_date DATE NOT NULL,
  sentiment_score FLOAT NOT NULL,
  surprise_pct FLOAT,
  analyst_rating TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_earnings_sentiment_ticker ON public.earnings_sentiment(ticker);
CREATE INDEX IF NOT EXISTS idx_earnings_sentiment_date ON public.earnings_sentiment(earnings_date DESC);

ALTER TABLE public.earnings_sentiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to earnings sentiment"
  ON public.earnings_sentiment
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert earnings sentiment"
  ON public.earnings_sentiment
  FOR INSERT
  WITH CHECK (true);

-- Create breaking_news table
CREATE TABLE IF NOT EXISTS public.breaking_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL,
  sentiment_score FLOAT,
  published_at TIMESTAMPTZ NOT NULL,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_breaking_news_ticker ON public.breaking_news(ticker);
CREATE INDEX IF NOT EXISTS idx_breaking_news_published ON public.breaking_news(published_at DESC);

ALTER TABLE public.breaking_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to breaking news"
  ON public.breaking_news
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert breaking news"
  ON public.breaking_news
  FOR INSERT
  WITH CHECK (true);

-- Create options_flow table
CREATE TABLE IF NOT EXISTS public.options_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),
  strike_price FLOAT NOT NULL,
  expiration_date DATE NOT NULL,
  volume INTEGER NOT NULL,
  premium FLOAT,
  trade_date DATE NOT NULL,
  sentiment TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_options_flow_ticker ON public.options_flow(ticker);
CREATE INDEX IF NOT EXISTS idx_options_flow_trade_date ON public.options_flow(trade_date DESC);

ALTER TABLE public.options_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to options flow"
  ON public.options_flow
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert options flow"
  ON public.options_flow
  FOR INSERT
  WITH CHECK (true);

-- Create job_postings table
CREATE TABLE IF NOT EXISTS public.job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  location TEXT,
  job_count INTEGER DEFAULT 1,
  posted_date DATE NOT NULL,
  category TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_ticker ON public.job_postings(ticker);
CREATE INDEX IF NOT EXISTS idx_job_postings_posted_date ON public.job_postings(posted_date DESC);

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to job postings"
  ON public.job_postings
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert job postings"
  ON public.job_postings
  FOR INSERT
  WITH CHECK (true);

-- Create supply_chain_signals table
CREATE TABLE IF NOT EXISTS public.supply_chain_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  supplier_name TEXT,
  event_description TEXT NOT NULL,
  impact_score FLOAT,
  report_date DATE NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_chain_ticker ON public.supply_chain_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_supply_chain_report_date ON public.supply_chain_signals(report_date DESC);

ALTER TABLE public.supply_chain_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to supply chain signals"
  ON public.supply_chain_signals
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert supply chain signals"
  ON public.supply_chain_signals
  FOR INSERT
  WITH CHECK (true);