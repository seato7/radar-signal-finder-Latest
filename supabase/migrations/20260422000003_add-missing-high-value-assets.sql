-- Add 8 high-recognition assets that were missing from the catalogue
-- and delete the obscure Dotcoin row that matched TwelveData's "DOT/USD"
-- ticker (users expect DOT = Polkadot, which already exists as pDOTn/USD).
--
-- All 8 additions have been verified to have live TwelveData coverage
-- via /symbol_search and /cryptocurrencies endpoints.
--
-- ON CONFLICT target: (ticker). assets_ticker_unique is the narrower
-- unique constraint (added 2025-12-05). Targeting (ticker, exchange) would
-- leave cross-exchange duplicates to abort the transaction.
--
-- Sector is populated both at top-level and inside metadata.sector for
-- convention-match: existing 26,956 rows store sector in metadata JSONB,
-- not the top-level column.
--
-- After migration, cron jobs will backfill scores/signals on next run:
--   compute-asset-scores (every 5 min)
--   compute-ai-scores (every 2 hours)
--   ingest-news-rss (every hour)
--   etc.

BEGIN;

-- ═══════════════════════════════════════════════════════════
-- ADD: Top S&P 500 REITs missing from catalogue (6 rows)
-- REIT concentration suggests prior seed list excluded them
-- ═══════════════════════════════════════════════════════════
INSERT INTO public.assets (ticker, name, exchange, asset_class, sector, base_currency, quote_currency, metadata)
VALUES
  ('PLD',  'Prologis Inc.',         'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Industrial"}'::jsonb),
  ('AMT',  'American Tower Corp.',  'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Specialty"}'::jsonb),
  ('WELL', 'Welltower Inc.',        'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Healthcare Facilities"}'::jsonb),
  ('DLR',  'Digital Realty Trust',  'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Office"}'::jsonb),
  ('EQR',  'Equity Residential',    'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Residential"}'::jsonb),
  ('INVH', 'Invitation Homes Inc.', 'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Residential"}'::jsonb)
ON CONFLICT (ticker) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- ADD: Blackstone (1 row). Largest alternative asset manager.
-- ═══════════════════════════════════════════════════════════
INSERT INTO public.assets (ticker, name, exchange, asset_class, sector, base_currency, quote_currency, metadata)
VALUES
  ('BX', 'Blackstone Inc.', 'NYSE', 'stock', 'Financial Services', 'USD', 'USD', '{"sector":"Financial Services","industry":"Asset Management"}'::jsonb)
ON CONFLICT (ticker) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- ADD: IEFA (1 row). Top-20 ETF globally by AUM (~$130B).
-- ═══════════════════════════════════════════════════════════
INSERT INTO public.assets (ticker, name, exchange, asset_class, sector, base_currency, quote_currency, metadata)
VALUES
  ('IEFA', 'iShares Core MSCI EAFE ETF', 'CBOE', 'etf', 'International Developed Markets', 'USD', 'USD', '{"sector":"International Developed Markets","issuer":"iShares"}'::jsonb)
ON CONFLICT (ticker) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- DELETE: Dotcoin (the obscure altcoin TwelveData confusingly
-- names DOT/USD). Real Polkadot already exists as pDOTn/USD.
-- Users searching DOT expect Polkadot; Dotcoin row creates confusion.
-- ═══════════════════════════════════════════════════════════
DELETE FROM public.assets
WHERE ticker = 'DOT/USD'
  AND name = 'Dotcoin';

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION (run manually after migration applies)
-- ═══════════════════════════════════════════════════════════════

-- Should return 8 rows (the newly added assets)
-- SELECT ticker, name, exchange, asset_class
-- FROM public.assets
-- WHERE ticker IN ('PLD','AMT','WELL','DLR','EQR','INVH','BX','IEFA')
-- ORDER BY ticker;

-- Should return 0 rows (Dotcoin removed)
-- SELECT ticker, name FROM public.assets
-- WHERE ticker = 'DOT/USD';

-- Should return 1 row (Polkadot preserved under pDOTn/USD)
-- SELECT ticker, name FROM public.assets
-- WHERE ticker = 'pDOTn/USD';
