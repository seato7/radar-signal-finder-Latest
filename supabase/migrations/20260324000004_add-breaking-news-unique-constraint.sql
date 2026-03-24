-- Add unique constraint to breaking_news matching the ON CONFLICT clause used
-- in finnhub-webhook and ingest-finnhub-news upserts: onConflict: 'url,ticker'
ALTER TABLE breaking_news
  ADD CONSTRAINT breaking_news_url_ticker_key
  UNIQUE (url, ticker);
