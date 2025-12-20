-- Add unique constraint for idempotent upserts on congressional_trades
-- This prevents duplicate entries for the same representative, ticker, transaction_date, and transaction_type combination

CREATE UNIQUE INDEX IF NOT EXISTS congressional_trades_unique_trade 
ON public.congressional_trades (representative, ticker, transaction_date, transaction_type);

ALTER TABLE public.congressional_trades 
ADD CONSTRAINT congressional_trades_unique_trade_constraint 
UNIQUE USING INDEX congressional_trades_unique_trade;