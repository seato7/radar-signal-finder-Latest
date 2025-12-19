-- Create a database function that can call the OpenFIGI API isn't possible from postgres
-- But we can create a helper that tracks what needs processing
-- For now, let's mark a batch of CUSIPs as needing resolution

-- First, let's see what tickers we can resolve from existing holdings_13f data
UPDATE cusip_mappings cm
SET 
  ticker = h.ticker,
  company_name = COALESCE(cm.company_name, h.company_name),
  source = 'holdings_13f',
  verified = true,
  updated_at = NOW()
FROM (
  SELECT DISTINCT cusip, ticker, company_name
  FROM holdings_13f
  WHERE ticker IS NOT NULL AND ticker != ''
) h
WHERE cm.cusip = h.cusip
  AND cm.ticker IS NULL
  AND h.ticker IS NOT NULL;