-- Create holdings_13f table for real SEC 13F data
CREATE TABLE IF NOT EXISTS public.holdings_13f (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_cik TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  ticker TEXT,
  cusip TEXT NOT NULL,
  company_name TEXT,
  shares BIGINT NOT NULL,
  value BIGINT NOT NULL, -- in thousands USD
  filing_date DATE NOT NULL,
  period_of_report DATE NOT NULL,
  change_type TEXT, -- 'new', 'increase', 'decrease', 'exit', 'unchanged'
  change_shares BIGINT,
  change_pct NUMERIC,
  previous_shares BIGINT,
  previous_value BIGINT,
  source_url TEXT,
  checksum TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_holdings_13f_ticker ON public.holdings_13f(ticker);
CREATE INDEX IF NOT EXISTS idx_holdings_13f_manager_cik ON public.holdings_13f(manager_cik);
CREATE INDEX IF NOT EXISTS idx_holdings_13f_filing_date ON public.holdings_13f(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_13f_period ON public.holdings_13f(period_of_report DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_13f_change_type ON public.holdings_13f(change_type);
CREATE INDEX IF NOT EXISTS idx_holdings_13f_cusip ON public.holdings_13f(cusip);

-- Enable RLS
ALTER TABLE public.holdings_13f ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Holdings 13F readable by everyone" 
ON public.holdings_13f FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage holdings 13F" 
ON public.holdings_13f FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create news_rss_articles table for RSS feed storage
CREATE TABLE IF NOT EXISTS public.news_rss_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ,
  sentiment_score NUMERIC,
  sentiment_label TEXT,
  relevance_score NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  checksum TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_news_rss_ticker ON public.news_rss_articles(ticker);
CREATE INDEX IF NOT EXISTS idx_news_rss_published ON public.news_rss_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_rss_source ON public.news_rss_articles(source);
CREATE INDEX IF NOT EXISTS idx_news_rss_sentiment ON public.news_rss_articles(sentiment_label);

-- Enable RLS
ALTER TABLE public.news_rss_articles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "News RSS articles readable by everyone" 
ON public.news_rss_articles FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage news RSS articles" 
ON public.news_rss_articles FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);