-- Add unique constraint to search_trends to enable idempotent upserts.
-- One trend reading per ticker per end-date (period_end = the day the function runs).
-- Duplicate rows have been accumulating on every successful run since the table was created.

-- Remove duplicate rows first, keeping the latest per (ticker, period_end).
DELETE FROM search_trends a
WHERE a.id != (
  SELECT id FROM search_trends b
  WHERE b.ticker = a.ticker
    AND b.period_end = a.period_end
  ORDER BY b.created_at DESC
  LIMIT 1
);

ALTER TABLE search_trends
  ADD CONSTRAINT search_trends_ticker_period_end_unique UNIQUE (ticker, period_end);
