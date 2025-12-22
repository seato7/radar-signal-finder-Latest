-- Add unique constraint for ticker+quarter to enable proper upserts
ALTER TABLE public.earnings_sentiment 
ADD CONSTRAINT earnings_sentiment_ticker_quarter_key UNIQUE (ticker, quarter);