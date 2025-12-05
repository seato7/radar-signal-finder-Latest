-- Add unique constraint on assets ticker column for upsert support
ALTER TABLE assets ADD CONSTRAINT assets_ticker_unique UNIQUE (ticker);