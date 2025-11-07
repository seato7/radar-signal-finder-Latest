-- Add support for multiple asset classes and forex-specific data

-- 1. Expand assets table to support all tradeable asset types
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_class TEXT DEFAULT 'stock';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS base_currency TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS quote_currency TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS contract_size DECIMAL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS pip_value DECIMAL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS spread_typical DECIMAL;

COMMENT ON COLUMN assets.asset_class IS 'Type: stock, forex, crypto, commodity, etf, option, future';
COMMENT ON COLUMN assets.base_currency IS 'For forex pairs: EUR in EUR/USD';
COMMENT ON COLUMN assets.quote_currency IS 'For forex pairs: USD in EUR/USD';

-- 2. Create forex-specific signals table for technical indicators
CREATE TABLE IF NOT EXISTS forex_technicals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- RSI indicators
  rsi_14 DECIMAL,
  rsi_signal TEXT, -- 'oversold', 'overbought', 'neutral'
  
  -- MACD indicators
  macd_line DECIMAL,
  macd_signal DECIMAL,
  macd_histogram DECIMAL,
  macd_crossover TEXT, -- 'bullish', 'bearish', 'none'
  
  -- Moving averages
  sma_50 DECIMAL,
  sma_200 DECIMAL,
  ema_50 DECIMAL,
  ema_200 DECIMAL,
  ma_crossover TEXT, -- 'golden_cross', 'death_cross', 'none'
  
  -- Volatility
  atr_14 DECIMAL,
  bollinger_upper DECIMAL,
  bollinger_middle DECIMAL,
  bollinger_lower DECIMAL,
  
  -- Price data
  close_price DECIMAL,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forex_technicals_ticker ON forex_technicals(ticker);
CREATE INDEX IF NOT EXISTS idx_forex_technicals_timestamp ON forex_technicals(timestamp DESC);

ALTER TABLE forex_technicals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Forex technicals readable by everyone"
  ON forex_technicals FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage forex technicals"
  ON forex_technicals FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 3. Create fundamental indicators table (interest rates, economic data)
CREATE TABLE IF NOT EXISTS economic_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  indicator_type TEXT NOT NULL, -- 'interest_rate', 'gdp', 'cpi', 'unemployment', 'nfp', 'pmi'
  value DECIMAL NOT NULL,
  previous_value DECIMAL,
  forecast_value DECIMAL,
  release_date TIMESTAMPTZ NOT NULL,
  impact TEXT, -- 'high', 'medium', 'low'
  source TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economic_indicators_country ON economic_indicators(country);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_type ON economic_indicators(indicator_type);
CREATE INDEX IF NOT EXISTS idx_economic_indicators_release ON economic_indicators(release_date DESC);

ALTER TABLE economic_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Economic indicators readable by everyone"
  ON economic_indicators FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage economic indicators"
  ON economic_indicators FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 4. Create COT (Commitment of Traders) reports table
CREATE TABLE IF NOT EXISTS cot_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL, -- e.g., 'EUR/USD'
  asset_id UUID REFERENCES assets(id),
  report_date DATE NOT NULL,
  
  -- Institutional positioning
  commercial_long INTEGER,
  commercial_short INTEGER,
  commercial_net INTEGER,
  
  -- Non-commercial (speculators)
  noncommercial_long INTEGER,
  noncommercial_short INTEGER,
  noncommercial_net INTEGER,
  
  -- Retail
  nonreportable_long INTEGER,
  nonreportable_short INTEGER,
  nonreportable_net INTEGER,
  
  -- Analysis
  net_position_change INTEGER,
  sentiment TEXT, -- 'bullish', 'bearish', 'neutral'
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ticker, report_date)
);

CREATE INDEX IF NOT EXISTS idx_cot_ticker ON cot_reports(ticker);
CREATE INDEX IF NOT EXISTS idx_cot_date ON cot_reports(report_date DESC);

ALTER TABLE cot_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "COT reports readable by everyone"
  ON cot_reports FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage COT reports"
  ON cot_reports FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 5. Create forex sentiment table
CREATE TABLE IF NOT EXISTS forex_sentiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Retail sentiment (from brokers)
  retail_long_pct DECIMAL,
  retail_short_pct DECIMAL,
  retail_sentiment TEXT, -- 'bullish', 'bearish', 'neutral'
  
  -- News sentiment
  news_sentiment_score DECIMAL, -- -1 to 1
  news_count INTEGER,
  
  -- Social sentiment
  social_mentions INTEGER,
  social_sentiment_score DECIMAL,
  
  source TEXT, -- 'oanda', 'ig', 'news_api', 'twitter'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forex_sentiment_ticker ON forex_sentiment(ticker);
CREATE INDEX IF NOT EXISTS idx_forex_sentiment_timestamp ON forex_sentiment(timestamp DESC);

ALTER TABLE forex_sentiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Forex sentiment readable by everyone"
  ON forex_sentiment FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage forex sentiment"
  ON forex_sentiment FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 6. Add more broker support columns
ALTER TABLE broker_keys ADD COLUMN IF NOT EXISTS broker_name TEXT;
ALTER TABLE broker_keys ADD COLUMN IF NOT EXISTS supported_assets TEXT[] DEFAULT '{}';
ALTER TABLE broker_keys ADD COLUMN IF NOT EXISTS account_type TEXT; -- 'standard', 'premium', 'pro'

-- 7. Update signals table to reference new signal types
-- (Already flexible with signal_type TEXT)

-- 8. Create interest rate differentials view
CREATE OR REPLACE VIEW interest_rate_differentials AS
SELECT 
  a.country as country_a,
  b.country as country_b,
  a.value as rate_a,
  b.value as rate_b,
  (a.value - b.value) as differential,
  CASE 
    WHEN (a.value - b.value) > 1 THEN 'strong_positive'
    WHEN (a.value - b.value) > 0.5 THEN 'positive'
    WHEN (a.value - b.value) < -1 THEN 'strong_negative'
    WHEN (a.value - b.value) < -0.5 THEN 'negative'
    ELSE 'neutral'
  END as differential_signal,
  a.release_date
FROM economic_indicators a
CROSS JOIN economic_indicators b
WHERE a.indicator_type = 'interest_rate'
  AND b.indicator_type = 'interest_rate'
  AND a.country != b.country
  AND a.release_date = (
    SELECT MAX(release_date) 
    FROM economic_indicators 
    WHERE indicator_type = 'interest_rate' AND country = a.country
  )
  AND b.release_date = (
    SELECT MAX(release_date) 
    FROM economic_indicators 
    WHERE indicator_type = 'interest_rate' AND country = b.country
  );

-- 9. Populate major forex pairs
INSERT INTO assets (ticker, exchange, name, asset_class, base_currency, quote_currency, metadata)
VALUES
  ('EUR/USD', 'FOREX', 'Euro / US Dollar', 'forex', 'EUR', 'USD', '{"major": true, "volatility": "medium"}'),
  ('GBP/USD', 'FOREX', 'British Pound / US Dollar', 'forex', 'GBP', 'USD', '{"major": true, "volatility": "medium"}'),
  ('USD/JPY', 'FOREX', 'US Dollar / Japanese Yen', 'forex', 'USD', 'JPY', '{"major": true, "volatility": "low"}'),
  ('USD/CHF', 'FOREX', 'US Dollar / Swiss Franc', 'forex', 'USD', 'CHF', '{"major": true, "volatility": "low"}'),
  ('AUD/USD', 'FOREX', 'Australian Dollar / US Dollar', 'forex', 'AUD', 'USD', '{"major": true, "volatility": "medium"}'),
  ('USD/CAD', 'FOREX', 'US Dollar / Canadian Dollar', 'forex', 'USD', 'CAD', '{"major": true, "volatility": "medium"}'),
  ('NZD/USD', 'FOREX', 'New Zealand Dollar / US Dollar', 'forex', 'NZD', 'USD', '{"major": true, "volatility": "medium"}'),
  ('EUR/GBP', 'FOREX', 'Euro / British Pound', 'forex', 'EUR', 'GBP', '{"cross": true, "volatility": "low"}'),
  ('EUR/JPY', 'FOREX', 'Euro / Japanese Yen', 'forex', 'EUR', 'JPY', '{"cross": true, "volatility": "medium"}'),
  ('GBP/JPY', 'FOREX', 'British Pound / Japanese Yen', 'forex', 'GBP', 'JPY', '{"cross": true, "volatility": "high"}')
ON CONFLICT (ticker, exchange) DO UPDATE SET
  asset_class = EXCLUDED.asset_class,
  base_currency = EXCLUDED.base_currency,
  quote_currency = EXCLUDED.quote_currency,
  metadata = EXCLUDED.metadata;

-- 10. Add major crypto pairs
INSERT INTO assets (ticker, exchange, name, asset_class, base_currency, quote_currency, metadata)
VALUES
  ('BTC/USD', 'CRYPTO', 'Bitcoin / US Dollar', 'crypto', 'BTC', 'USD', '{"market_cap_rank": 1}'),
  ('ETH/USD', 'CRYPTO', 'Ethereum / US Dollar', 'crypto', 'ETH', 'USD', '{"market_cap_rank": 2}'),
  ('BTC/EUR', 'CRYPTO', 'Bitcoin / Euro', 'crypto', 'BTC', 'EUR', '{"market_cap_rank": 1}'),
  ('ETH/EUR', 'CRYPTO', 'Ethereum / Euro', 'crypto', 'ETH', 'EUR', '{"market_cap_rank": 2}'),
  ('SOL/USD', 'CRYPTO', 'Solana / US Dollar', 'crypto', 'SOL', 'USD', '{"market_cap_rank": 5}'),
  ('XRP/USD', 'CRYPTO', 'Ripple / US Dollar', 'crypto', 'XRP', 'USD', '{"market_cap_rank": 6}'),
  ('ADA/USD', 'CRYPTO', 'Cardano / US Dollar', 'crypto', 'ADA', 'USD', '{"market_cap_rank": 7}'),
  ('DOGE/USD', 'CRYPTO', 'Dogecoin / US Dollar', 'crypto', 'DOGE', 'USD', '{"meme": true}')
ON CONFLICT (ticker, exchange) DO UPDATE SET
  asset_class = EXCLUDED.asset_class,
  base_currency = EXCLUDED.base_currency,
  quote_currency = EXCLUDED.quote_currency,
  metadata = EXCLUDED.metadata;

-- 11. Add commodities
INSERT INTO assets (ticker, exchange, name, asset_class, metadata)
VALUES
  ('XAUUSD', 'COMMODITY', 'Gold Spot / US Dollar', 'commodity', '{"category": "precious_metal"}'),
  ('XAGUSD', 'COMMODITY', 'Silver Spot / US Dollar', 'commodity', '{"category": "precious_metal"}'),
  ('CRUDE', 'COMMODITY', 'Crude Oil WTI', 'commodity', '{"category": "energy"}'),
  ('BRENT', 'COMMODITY', 'Brent Crude Oil', 'commodity', '{"category": "energy"}'),
  ('NATGAS', 'COMMODITY', 'Natural Gas', 'commodity', '{"category": "energy"}')
ON CONFLICT (ticker, exchange) DO UPDATE SET
  asset_class = EXCLUDED.asset_class,
  metadata = EXCLUDED.metadata;