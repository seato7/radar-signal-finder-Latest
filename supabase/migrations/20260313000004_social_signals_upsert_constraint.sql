-- Add signal_date column for day-level deduplication.
-- created_at is a full timestamp and cannot serve as a unique key per day.
ALTER TABLE social_signals
  ADD COLUMN IF NOT EXISTS signal_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill signal_date from existing created_at values
UPDATE social_signals SET signal_date = created_at::date WHERE signal_date IS NULL;

ALTER TABLE social_signals
  ADD CONSTRAINT social_signals_ticker_source_date_key
  UNIQUE (ticker, source, signal_date);
