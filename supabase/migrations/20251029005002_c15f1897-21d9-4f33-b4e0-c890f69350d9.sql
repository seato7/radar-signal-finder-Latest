-- Fix RLS policies on all market data tables to require authentication
-- This prevents public access and requires users to be logged in

-- Drop existing public read policies
DROP POLICY IF EXISTS "Allow public read access to breaking news" ON public.breaking_news;
DROP POLICY IF EXISTS "Allow public read access to congressional trades" ON public.congressional_trades;
DROP POLICY IF EXISTS "Allow public read access to earnings sentiment" ON public.earnings_sentiment;
DROP POLICY IF EXISTS "Allow public read access to job postings" ON public.job_postings;
DROP POLICY IF EXISTS "Allow public read access to options flow" ON public.options_flow;
DROP POLICY IF EXISTS "Allow public read access to patent filings" ON public.patent_filings;
DROP POLICY IF EXISTS "Allow public read access to search trends" ON public.search_trends;
DROP POLICY IF EXISTS "Allow public read access to short interest" ON public.short_interest;
DROP POLICY IF EXISTS "Allow public read access to social signals" ON public.social_signals;
DROP POLICY IF EXISTS "Allow public read access to supply chain signals" ON public.supply_chain_signals;

-- Create new authenticated-only read policies
CREATE POLICY "Authenticated users can read breaking news"
  ON public.breaking_news
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read congressional trades"
  ON public.congressional_trades
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read earnings sentiment"
  ON public.earnings_sentiment
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read job postings"
  ON public.job_postings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read options flow"
  ON public.options_flow
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read patent filings"
  ON public.patent_filings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read search trends"
  ON public.search_trends
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read short interest"
  ON public.short_interest
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read social signals"
  ON public.social_signals
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read supply chain signals"
  ON public.supply_chain_signals
  FOR SELECT
  TO authenticated
  USING (true);