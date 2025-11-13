
-- Drop and recreate asset_signal_summary view
DROP VIEW IF EXISTS asset_signal_summary CASCADE;

CREATE VIEW asset_signal_summary AS
SELECT 
  a.id as asset_id,
  a.ticker,
  a.name,
  a.asset_class,
  COUNT(DISTINCT CASE WHEN s.signal_type LIKE '%flow%' THEN s.id END) as flow_signals,
  COUNT(DISTINCT CASE WHEN s.signal_type LIKE '%institutional%' OR s.signal_type LIKE '%13f%' THEN s.id END) as institutional_signals,
  COUNT(DISTINCT CASE WHEN s.signal_type LIKE '%insider%' THEN s.id END) as insider_signals,
  COUNT(DISTINCT CASE WHEN s.signal_type LIKE '%technical%' OR s.signal_type LIKE '%pattern%' THEN s.id END) as technical_signals,
  COUNT(DISTINCT CASE WHEN s.signal_type LIKE '%sentiment%' THEN s.id END) as sentiment_signals,
  MAX(s.observed_at) as latest_signal_at
FROM assets a
LEFT JOIN signals s ON s.asset_id = a.id AND s.observed_at > NOW() - INTERVAL '30 days'
GROUP BY a.id, a.ticker, a.name, a.asset_class
HAVING COUNT(s.id) > 0;
