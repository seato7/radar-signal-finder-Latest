-- Add missing unique constraints to prevent duplicate data
ALTER TABLE prices 
ADD CONSTRAINT unique_ticker_date UNIQUE (ticker, date);

-- Add missing indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_news_sentiment_ticker_date 
ON news_sentiment_aggregate(ticker, date);

CREATE INDEX IF NOT EXISTS idx_crypto_onchain_ticker 
ON crypto_onchain_metrics(ticker, timestamp);

CREATE INDEX IF NOT EXISTS idx_smart_money_ticker 
ON smart_money_flow(ticker, timestamp);

-- Add check constraints for data integrity
ALTER TABLE signals 
ADD CONSTRAINT check_magnitude_range 
CHECK (magnitude >= 0 AND magnitude <= 1);

ALTER TABLE signals 
ADD CONSTRAINT check_confidence_range 
CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));

-- Ensure prices table has positive values
ALTER TABLE prices 
ADD CONSTRAINT check_positive_price 
CHECK (close > 0);

-- Add constraints to advanced_technicals
ALTER TABLE advanced_technicals
ADD CONSTRAINT check_stochastic_k_range 
CHECK (stochastic_k IS NULL OR (stochastic_k >= 0 AND stochastic_k <= 100));

ALTER TABLE advanced_technicals
ADD CONSTRAINT check_stochastic_d_range 
CHECK (stochastic_d IS NULL OR (stochastic_d >= 0 AND stochastic_d <= 100));