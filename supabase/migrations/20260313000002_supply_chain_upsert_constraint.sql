-- Add unique constraint on supply_chain_signals so ingest-supply-chain upserts
-- are idempotent on re-runs. The deduplication key matches the in-memory Map key
-- already used by the function: ticker + signal_type + report_date.

ALTER TABLE supply_chain_signals
  ADD CONSTRAINT supply_chain_signals_ticker_type_date_key
  UNIQUE (ticker, signal_type, report_date);
