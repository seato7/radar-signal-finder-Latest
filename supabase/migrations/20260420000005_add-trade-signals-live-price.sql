-- Stamp the live TwelveData price that check-trade-exits just observed onto each
-- active trade_signals row so the frontend can render a truly "Live P&L" instead
-- of computing it against yesterday's daily close from the prices table.
--
-- Updated on every check-trade-exits run (every 5 min), not just on exit.

ALTER TABLE public.trade_signals
  ADD COLUMN IF NOT EXISTS last_live_price NUMERIC,
  ADD COLUMN IF NOT EXISTS last_live_price_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_live_price_source TEXT;

ALTER TABLE public.trade_signals
  DROP CONSTRAINT IF EXISTS trade_signals_last_live_price_source_check;

ALTER TABLE public.trade_signals
  ADD CONSTRAINT trade_signals_last_live_price_source_check
  CHECK (last_live_price_source IS NULL OR last_live_price_source IN ('live', 'db', 'none'));
