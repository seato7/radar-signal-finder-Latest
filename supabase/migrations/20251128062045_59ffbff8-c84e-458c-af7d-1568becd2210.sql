-- Create performance indexes for asset lookups
CREATE INDEX IF NOT EXISTS idx_assets_ticker ON assets(ticker);
CREATE INDEX IF NOT EXISTS idx_assets_asset_class ON assets(asset_class);
CREATE INDEX IF NOT EXISTS idx_assets_exchange ON assets(exchange);
CREATE INDEX IF NOT EXISTS idx_assets_ticker_class ON assets(ticker, asset_class);

-- Create indexes for ingestion logs performance
CREATE INDEX IF NOT EXISTS idx_ingest_logs_etl_started ON ingest_logs(etl_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_logs_status ON ingest_logs(status, started_at DESC);

-- Create indexes for function_status performance
CREATE INDEX IF NOT EXISTS idx_function_status_name_executed ON function_status(function_name, executed_at DESC);

-- Create indexes for signals performance (note: signals has asset_id, not ticker)
CREATE INDEX IF NOT EXISTS idx_signals_observed_at ON signals(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_asset_id ON signals(asset_id);
CREATE INDEX IF NOT EXISTS idx_signals_theme_id ON signals(theme_id);
CREATE INDEX IF NOT EXISTS idx_signals_asset_class ON signals(asset_class);

-- Create indexes for prices performance
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_prices_asset_id ON prices(asset_id);

-- Create indexes for advanced_technicals performance
CREATE INDEX IF NOT EXISTS idx_advanced_technicals_ticker ON advanced_technicals(ticker, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_advanced_technicals_asset_class ON advanced_technicals(asset_class);

-- Create indexes for breaking_news performance
CREATE INDEX IF NOT EXISTS idx_breaking_news_ticker ON breaking_news(ticker, published_at DESC);

-- Create indexes for dark_pool_activity performance
CREATE INDEX IF NOT EXISTS idx_dark_pool_ticker_date ON dark_pool_activity(ticker, trade_date DESC);

-- Create indexes for congressional_trades performance
CREATE INDEX IF NOT EXISTS idx_congressional_trades_ticker ON congressional_trades(ticker, transaction_date DESC);

COMMENT ON INDEX idx_assets_ticker IS 'Fast ticker lookups for ingestion functions';
COMMENT ON INDEX idx_assets_asset_class IS 'Asset class filtering for batch processing';
COMMENT ON INDEX idx_signals_observed_at IS 'Recent signal queries for theme scoring';
