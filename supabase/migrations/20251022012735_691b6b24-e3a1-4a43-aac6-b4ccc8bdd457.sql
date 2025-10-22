-- Create social signals table for Reddit and StockTwits
CREATE TABLE IF NOT EXISTS social_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('reddit', 'stocktwits')),
    mention_count INTEGER DEFAULT 0,
    sentiment_score FLOAT CHECK (sentiment_score BETWEEN -1 AND 1),
    bullish_count INTEGER DEFAULT 0,
    bearish_count INTEGER DEFAULT 0,
    post_volume INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_social_ticker ON social_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_social_source ON social_signals(source);
CREATE INDEX IF NOT EXISTS idx_social_created_at ON social_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_ticker_timestamp ON social_signals(ticker, created_at DESC);

-- Create congressional trades table
CREATE TABLE IF NOT EXISTS congressional_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    representative VARCHAR(100) NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    transaction_type VARCHAR(10) CHECK (transaction_type IN ('buy', 'sell', 'exchange')),
    amount_min INTEGER,
    amount_max INTEGER,
    filed_date DATE NOT NULL,
    transaction_date DATE NOT NULL,
    party VARCHAR(20),
    chamber VARCHAR(20) CHECK (chamber IN ('house', 'senate')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_congress_ticker ON congressional_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_congress_date ON congressional_trades(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_congress_rep ON congressional_trades(representative);

-- Create search trends table for Google Trends
CREATE TABLE IF NOT EXISTS search_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL,
    keyword VARCHAR(100) NOT NULL,
    search_volume INTEGER,
    trend_change FLOAT,
    region VARCHAR(10) DEFAULT 'US',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trends_ticker ON search_trends(ticker);
CREATE INDEX IF NOT EXISTS idx_trends_period ON search_trends(period_end DESC);

-- Create patent filings table
CREATE TABLE IF NOT EXISTS patent_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL,
    company VARCHAR(100),
    patent_number VARCHAR(50),
    patent_title TEXT,
    filing_date DATE,
    technology_category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_patent_ticker ON patent_filings(ticker);
CREATE INDEX IF NOT EXISTS idx_patent_filing_date ON patent_filings(filing_date DESC);

-- Create earnings sentiment table
CREATE TABLE IF NOT EXISTS earnings_sentiment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL,
    quarter VARCHAR(10),
    sentiment_score FLOAT CHECK (sentiment_score BETWEEN -1 AND 1),
    earnings_surprise FLOAT,
    revenue_surprise FLOAT,
    earnings_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_earnings_ticker ON earnings_sentiment(ticker);
CREATE INDEX IF NOT EXISTS idx_earnings_date ON earnings_sentiment(earnings_date DESC);

-- Create short interest table
CREATE TABLE IF NOT EXISTS short_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL,
    short_volume BIGINT,
    float_percentage FLOAT,
    days_to_cover FLOAT,
    report_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_short_ticker ON short_interest(ticker);
CREATE INDEX IF NOT EXISTS idx_short_report_date ON short_interest(report_date DESC);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE social_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE congressional_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE patent_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_sentiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_interest ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - allow public read access (these are public market signals)
CREATE POLICY "Allow public read access to social signals"
    ON social_signals FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to congressional trades"
    ON congressional_trades FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to search trends"
    ON search_trends FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to patent filings"
    ON patent_filings FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to earnings sentiment"
    ON earnings_sentiment FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to short interest"
    ON short_interest FOR SELECT
    USING (true);

-- Create service role policies for insert/update/delete
CREATE POLICY "Allow service role to manage social signals"
    ON social_signals FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Allow service role to manage congressional trades"
    ON congressional_trades FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Allow service role to manage search trends"
    ON search_trends FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Allow service role to manage patent filings"
    ON patent_filings FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Allow service role to manage earnings sentiment"
    ON earnings_sentiment FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Allow service role to manage short interest"
    ON short_interest FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');