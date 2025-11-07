-- Enhanced signal types and technical analysis tables

-- 1. Advanced Technical Indicators Table
CREATE TABLE IF NOT EXISTS advanced_technicals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  asset_class TEXT NOT NULL, -- 'stock', 'forex', 'crypto', 'commodity'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Volume indicators
  vwap DECIMAL, -- Volume Weighted Average Price
  obv BIGINT, -- On Balance Volume
  volume_24h BIGINT,
  volume_change_pct DECIMAL,
  
  -- Fibonacci levels
  fib_0 DECIMAL,
  fib_236 DECIMAL,
  fib_382 DECIMAL,
  fib_500 DECIMAL,
  fib_618 DECIMAL,
  fib_786 DECIMAL,
  fib_1000 DECIMAL,
  
  -- Support/Resistance
  support_1 DECIMAL,
  support_2 DECIMAL,
  support_3 DECIMAL,
  resistance_1 DECIMAL,
  resistance_2 DECIMAL,
  resistance_3 DECIMAL,
  
  -- Price action
  current_price DECIMAL,
  price_vs_vwap_pct DECIMAL,
  breakout_signal TEXT, -- 'resistance_break', 'support_break', 'range_bound'
  
  -- Trend strength
  adx DECIMAL, -- Average Directional Index
  trend_strength TEXT, -- 'strong_uptrend', 'weak_uptrend', 'strong_downtrend', 'weak_downtrend', 'sideways'
  
  -- Stochastic
  stochastic_k DECIMAL,
  stochastic_d DECIMAL,
  stochastic_signal TEXT, -- 'overbought', 'oversold', 'neutral'
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advanced_tech_ticker ON advanced_technicals(ticker);
CREATE INDEX IF NOT EXISTS idx_advanced_tech_timestamp ON advanced_technicals(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_advanced_tech_asset_class ON advanced_technicals(asset_class);

ALTER TABLE advanced_technicals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advanced technicals readable by everyone"
  ON advanced_technicals FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage advanced technicals"
  ON advanced_technicals FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 2. Dark Pool Activity (Stocks)
CREATE TABLE IF NOT EXISTS dark_pool_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  trade_date DATE NOT NULL,
  
  dark_pool_volume BIGINT,
  total_volume BIGINT,
  dark_pool_percentage DECIMAL,
  
  -- Dark pool vs lit market ratio
  dp_to_lit_ratio DECIMAL,
  
  -- Price impact
  price_at_trade DECIMAL,
  price_impact_estimate DECIMAL,
  
  -- Signal strength
  signal_type TEXT, -- 'accumulation', 'distribution', 'neutral'
  signal_strength TEXT, -- 'strong', 'moderate', 'weak'
  
  source TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ticker, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_dark_pool_ticker ON dark_pool_activity(ticker);
CREATE INDEX IF NOT EXISTS idx_dark_pool_date ON dark_pool_activity(trade_date DESC);

ALTER TABLE dark_pool_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dark pool activity readable by everyone"
  ON dark_pool_activity FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage dark pool activity"
  ON dark_pool_activity FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 3. Crypto On-Chain Metrics
CREATE TABLE IF NOT EXISTS crypto_onchain_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Network activity
  active_addresses INTEGER,
  active_addresses_change_pct DECIMAL,
  transaction_count BIGINT,
  transaction_count_change_pct DECIMAL,
  
  -- Whale activity
  whale_transaction_count INTEGER,
  large_transaction_volume DECIMAL,
  whale_signal TEXT, -- 'accumulating', 'distributing', 'neutral'
  
  -- Exchange flows
  exchange_inflow DECIMAL,
  exchange_outflow DECIMAL,
  exchange_net_flow DECIMAL,
  exchange_flow_signal TEXT, -- 'bullish_outflow', 'bearish_inflow', 'neutral'
  
  -- Supply metrics
  supply_on_exchanges DECIMAL,
  supply_on_exchanges_pct DECIMAL,
  
  -- HODL metrics
  hodl_waves JSONB, -- Distribution of age of coins
  long_term_holder_supply_pct DECIMAL,
  
  -- Hash rate (for POW coins)
  hash_rate DECIMAL,
  hash_rate_change_pct DECIMAL,
  
  -- Network value
  nvt_ratio DECIMAL, -- Network Value to Transaction ratio
  mvrv_ratio DECIMAL, -- Market Value to Realized Value
  
  -- Fear & Greed
  fear_greed_index INTEGER,
  
  source TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_onchain_ticker ON crypto_onchain_metrics(ticker);
CREATE INDEX IF NOT EXISTS idx_crypto_onchain_timestamp ON crypto_onchain_metrics(timestamp DESC);

ALTER TABLE crypto_onchain_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crypto on-chain metrics readable by everyone"
  ON crypto_onchain_metrics FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage crypto on-chain metrics"
  ON crypto_onchain_metrics FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 4. Smart Money Flow Indicators
CREATE TABLE IF NOT EXISTS smart_money_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  asset_class TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Institutional flow
  institutional_buy_volume BIGINT,
  institutional_sell_volume BIGINT,
  institutional_net_flow BIGINT,
  
  -- Retail flow
  retail_buy_volume BIGINT,
  retail_sell_volume BIGINT,
  retail_net_flow BIGINT,
  
  -- Smart money indicator
  smart_money_index DECIMAL, -- Institutional vs Retail ratio
  smart_money_signal TEXT, -- 'strong_buy', 'buy', 'neutral', 'sell', 'strong_sell'
  
  -- Money flow index
  mfi DECIMAL, -- Money Flow Index (0-100)
  mfi_signal TEXT, -- 'overbought', 'oversold', 'neutral'
  
  -- Chaikin Money Flow
  cmf DECIMAL,
  cmf_signal TEXT, -- 'buying_pressure', 'selling_pressure', 'neutral'
  
  -- Accumulation/Distribution
  ad_line DECIMAL,
  ad_trend TEXT, -- 'accumulation', 'distribution', 'neutral'
  
  source TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smart_money_ticker ON smart_money_flow(ticker);
CREATE INDEX IF NOT EXISTS idx_smart_money_timestamp ON smart_money_flow(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_smart_money_asset_class ON smart_money_flow(asset_class);

ALTER TABLE smart_money_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Smart money flow readable by everyone"
  ON smart_money_flow FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage smart money flow"
  ON smart_money_flow FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 5. News & Sentiment Aggregation
CREATE TABLE IF NOT EXISTS news_sentiment_aggregate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  date DATE NOT NULL,
  
  -- News metrics
  total_articles INTEGER DEFAULT 0,
  positive_articles INTEGER DEFAULT 0,
  negative_articles INTEGER DEFAULT 0,
  neutral_articles INTEGER DEFAULT 0,
  
  -- Sentiment score
  sentiment_score DECIMAL, -- -1 to 1
  sentiment_label TEXT, -- 'very_positive', 'positive', 'neutral', 'negative', 'very_negative'
  
  -- Source breakdown
  sentiment_by_source JSONB, -- {"Bloomberg": 0.8, "Reuters": 0.6, ...}
  
  -- Trending topics
  trending_keywords TEXT[],
  
  -- Buzz score
  buzz_score DECIMAL, -- Normalized attention metric
  buzz_change_pct DECIMAL,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_news_sentiment_ticker ON news_sentiment_aggregate(ticker);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_date ON news_sentiment_aggregate(date DESC);

ALTER TABLE news_sentiment_aggregate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "News sentiment readable by everyone"
  ON news_sentiment_aggregate FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage news sentiment"
  ON news_sentiment_aggregate FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 6. AI-Generated Research Reports
CREATE TABLE IF NOT EXISTS ai_research_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  asset_class TEXT NOT NULL,
  report_type TEXT NOT NULL, -- 'technical', 'fundamental', 'sentiment', 'comprehensive'
  
  -- Report content
  executive_summary TEXT NOT NULL,
  key_findings JSONB, -- Array of key points
  technical_analysis TEXT,
  fundamental_analysis TEXT,
  sentiment_analysis TEXT,
  risk_assessment TEXT,
  
  -- Trade recommendations
  recommendation TEXT, -- 'strong_buy', 'buy', 'hold', 'sell', 'strong_sell'
  confidence_score DECIMAL, -- 0-100
  target_price DECIMAL,
  stop_loss DECIMAL,
  time_horizon TEXT, -- 'short_term', 'medium_term', 'long_term'
  
  -- Data sources used
  data_sources TEXT[],
  signal_count INTEGER,
  
  -- Metadata
  generated_by TEXT, -- AI model used
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Report validity period
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_ticker ON ai_research_reports(ticker);
CREATE INDEX IF NOT EXISTS idx_ai_reports_generated ON ai_research_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reports_type ON ai_research_reports(report_type);

ALTER TABLE ai_research_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI research reports readable by everyone"
  ON ai_research_reports FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage AI research reports"
  ON ai_research_reports FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 7. Pattern Recognition Signals
CREATE TABLE IF NOT EXISTS pattern_recognition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES assets(id),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Pattern details
  pattern_type TEXT NOT NULL, -- 'head_and_shoulders', 'double_top', 'triangle', 'flag', 'wedge', etc.
  pattern_category TEXT, -- 'reversal', 'continuation', 'bilateral'
  
  -- Pattern characteristics
  timeframe TEXT, -- 'intraday', 'daily', 'weekly'
  pattern_completion_pct DECIMAL, -- 0-100, how complete the pattern is
  
  -- Price levels
  entry_price DECIMAL,
  target_price DECIMAL,
  stop_loss_price DECIMAL,
  risk_reward_ratio DECIMAL,
  
  -- Signal strength
  confidence_score DECIMAL, -- 0-100
  historical_success_rate DECIMAL, -- Based on similar patterns
  
  -- Pattern status
  status TEXT, -- 'forming', 'confirmed', 'completed', 'invalidated'
  
  -- Volume confirmation
  volume_confirmed BOOLEAN,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_ticker ON pattern_recognition(ticker);
CREATE INDEX IF NOT EXISTS idx_pattern_detected ON pattern_recognition(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_type ON pattern_recognition(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_status ON pattern_recognition(status);

ALTER TABLE pattern_recognition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pattern recognition readable by everyone"
  ON pattern_recognition FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage pattern recognition"
  ON pattern_recognition FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 8. Create comprehensive views for multi-signal analysis

CREATE OR REPLACE VIEW asset_signal_summary AS
SELECT 
  a.id as asset_id,
  a.ticker,
  a.name,
  a.asset_class,
  a.exchange,
  
  -- Count signals by type
  COUNT(DISTINCT s.id) FILTER (WHERE s.signal_type LIKE '%technical%') as technical_signals,
  COUNT(DISTINCT s.id) FILTER (WHERE s.signal_type LIKE '%sentiment%') as sentiment_signals,
  COUNT(DISTINCT s.id) FILTER (WHERE s.signal_type LIKE '%institutional%') as institutional_signals,
  COUNT(DISTINCT s.id) FILTER (WHERE s.signal_type LIKE '%flow%') as flow_signals,
  
  -- Latest prices and technicals (FIXED: using current_price not close_price)
  (SELECT current_price FROM advanced_technicals WHERE asset_id = a.id ORDER BY timestamp DESC LIMIT 1) as current_price,
  (SELECT trend_strength FROM advanced_technicals WHERE asset_id = a.id ORDER BY timestamp DESC LIMIT 1) as trend,
  
  -- Latest sentiment
  (SELECT sentiment_score FROM news_sentiment_aggregate WHERE asset_id = a.id ORDER BY date DESC LIMIT 1) as news_sentiment,
  
  -- Pattern signals
  COUNT(DISTINCT pr.id) as active_patterns,
  
  -- Last updated
  MAX(s.observed_at) as last_signal_at
  
FROM assets a
LEFT JOIN signals s ON s.asset_id = a.id AND s.observed_at > NOW() - INTERVAL '30 days'
LEFT JOIN pattern_recognition pr ON pr.asset_id = a.id AND pr.status IN ('forming', 'confirmed')
GROUP BY a.id, a.ticker, a.name, a.asset_class, a.exchange;

-- 9. Add columns to existing signals table for enhanced categorization
ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_category TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS confidence_score DECIMAL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS time_horizon TEXT; -- 'short', 'medium', 'long'

COMMENT ON COLUMN signals.signal_category IS 'Category: technical, fundamental, sentiment, flow, institutional';
COMMENT ON COLUMN signals.confidence_score IS 'AI-generated confidence 0-100';
COMMENT ON COLUMN signals.time_horizon IS 'Expected signal timeframe: short (1-7d), medium (1-4w), long (1-6m)';

-- Create indexes on new columns
CREATE INDEX IF NOT EXISTS idx_signals_category ON signals(signal_category);
CREATE INDEX IF NOT EXISTS idx_signals_confidence ON signals(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_signals_time_horizon ON signals(time_horizon);