-- Cleanup migration for 49 dirty tickers identified 2026-04-22
-- Categories: exchange-prefix pollution, wrapper chars, placeholder values,
-- dual-ticker strings, test tickers, edge dots.
-- Primary source of this pollution: supabase/functions/ingest-form4, which
-- accepted raw XBRL issuerTradingSymbol values without normalisation.

BEGIN;

-- ═══════════════════════════════════════════════════════════
-- CATEGORY 1: Exchange prefix pollution (5 rows)
-- ═══════════════════════════════════════════════════════════
UPDATE public.assets SET ticker = 'LNW', exchange = 'ASX'
  WHERE ticker = 'ASX:LNW';
UPDATE public.assets SET ticker = 'SVC', exchange = 'NASDAQ'
  WHERE ticker = 'NASDAQ:SVC';
UPDATE public.assets SET ticker = 'FLG', exchange = 'NYSE'
  WHERE ticker = 'NYSE:FLG';
UPDATE public.assets SET ticker = 'KRC', exchange = 'NYSE'
  WHERE ticker = 'NYSE: KRC';
UPDATE public.assets SET ticker = 'VTEX', exchange = 'NYSE'
  WHERE ticker = 'NYSE: VTEX';

-- ═══════════════════════════════════════════════════════════
-- CATEGORY 2: Wrapper character pollution (3 updates, 1 delete)
-- ═══════════════════════════════════════════════════════════
UPDATE public.assets SET ticker = 'OMEX' WHERE ticker = '"OMEX"';
UPDATE public.assets SET ticker = 'CALX' WHERE ticker = '(CALX)';
UPDATE public.assets SET ticker = 'ENTX' WHERE ticker = '[ENTX]';
-- FS Credit Real Estate is a private trust with no public ticker
DELETE FROM public.assets WHERE ticker = '[NONE';

-- ═══════════════════════════════════════════════════════════
-- CATEGORY 3: Placeholder values (2 rows — both private trusts)
-- ═══════════════════════════════════════════════════════════
DELETE FROM public.assets
  WHERE ticker = 'NA' AND name LIKE '%VINEBROOK%';
DELETE FROM public.assets
  WHERE ticker = 'NONE' AND name LIKE '%Highlands REIT%';

-- ═══════════════════════════════════════════════════════════
-- CATEGORY 4: Trailing dot on preferred (1 row)
-- ═══════════════════════════════════════════════════════════
UPDATE public.assets SET ticker = 'TFIN.PR'
  WHERE ticker = 'TFIN.PR.';

-- ═══════════════════════════════════════════════════════════
-- CATEGORY 5: Dual-ticker comma-separated (4 rows)
-- Keep primary class only — secondary classes can be added separately later
-- ═══════════════════════════════════════════════════════════
UPDATE public.assets SET ticker = 'BFA' WHERE ticker = 'BFA, BFB';
UPDATE public.assets SET ticker = 'GEF' WHERE ticker = 'GEF, GEF-B';
UPDATE public.assets SET ticker = 'HEI' WHERE ticker = 'HEI, HEI.A';
UPDATE public.assets SET ticker = 'LEN' WHERE ticker = 'LEN, LEN.B';

-- ═══════════════════════════════════════════════════════════
-- CATEGORY 6: Dual-ticker space-separated (4 rows)
-- ═══════════════════════════════════════════════════════════
-- Delete the duplicate CRDA entry (keep only one Crawford row)
DELETE FROM public.assets WHERE ticker = 'CRDA -CRDB';
UPDATE public.assets SET ticker = 'CRDA' WHERE ticker = 'CRDA CRDB';
UPDATE public.assets SET ticker = 'FTWU' WHERE ticker = 'FTW U';
-- Z AND ZG → ZG (Zillow Class C) — Z already exists as Class A
UPDATE public.assets SET ticker = 'ZG', exchange = 'NASDAQ'
  WHERE ticker = 'Z AND ZG';

-- ═══════════════════════════════════════════════════════════
-- CATEGORY 7: Exchange test tickers — pure pollution (7 rows)
-- Internal test symbols used by NYSE/NASDAQ quote feeds;
-- should never appear to users.
-- ═══════════════════════════════════════════════════════════
DELETE FROM public.assets WHERE ticker IN (
  'ATEST', 'NTEST', 'PTEST', 'MTEST.A', 'MYSEW', 'ZTST', 'SRTAW'
);

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- VERIFICATION (run manually after migration applies)
-- Should return 0 rows — all pre-existing dirty tickers cleaned.
-- ═══════════════════════════════════════════════════════════
-- SELECT ticker, name FROM public.assets
-- WHERE ticker IN (
--   'ASX:LNW', 'NASDAQ:SVC', 'NYSE:FLG', 'NYSE: KRC', 'NYSE: VTEX',
--   '"OMEX"', '(CALX)', '[ENTX]', '[NONE',
--   'NA', 'NONE', 'TFIN.PR.',
--   'BFA, BFB', 'GEF, GEF-B', 'HEI, HEI.A', 'LEN, LEN.B',
--   'CRDA -CRDB', 'CRDA CRDB', 'FTW U', 'Z AND ZG',
--   'ATEST', 'NTEST', 'PTEST', 'MTEST.A', 'MYSEW', 'ZTST', 'SRTAW'
-- );
