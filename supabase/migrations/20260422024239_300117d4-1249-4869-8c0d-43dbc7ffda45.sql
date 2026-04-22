BEGIN;

-- Build a temp table of dirty asset IDs that need to be DELETED (not renamed)
CREATE TEMP TABLE _dirty_to_delete ON COMMIT DROP AS
SELECT id FROM public.assets WHERE ticker IN (
  'ASX:LNW',          -- LNW exists clean
  'NYSE:FLG',         -- FLG exists clean
  'NYSE: VTEX',       -- VTEX exists clean
  '"OMEX"',           -- OMEX exists clean
  '(CALX)',           -- CALX exists clean
  '[ENTX]',           -- ENTX exists clean
  '[NONE',            -- private trust, no public ticker
  'GEF, GEF-B',       -- GEF exists clean
  'HEI, HEI.A',       -- HEI exists clean
  'LEN, LEN.B',       -- LEN exists clean
  'CRDA -CRDB',       -- duplicate Crawford
  'FTW U',            -- FTWU exists clean
  'Z AND ZG',         -- ZG exists clean
  'ATEST', 'NTEST', 'PTEST', 'MTEST.A', 'MYSEW', 'ZTST', 'SRTAW'  -- test symbols
)
OR (ticker = 'NA' AND name LIKE '%VINEBROOK%')
OR (ticker = 'NONE' AND name LIKE '%Highlands REIT%');

-- Cascade-delete child rows
DELETE FROM public.ai_scores WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.ai_research_reports WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.advanced_technicals WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.asset_predictions WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.company_fundamentals WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.cot_reports WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.crypto_onchain_metrics WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.dark_pool_activity WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.eps_revisions WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.etf_flows WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.forex_sentiment WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.forex_technicals WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.form4_insider_trades WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.news_sentiment_aggregate WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.pattern_recognition WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.prices WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.smart_money_flow WHERE asset_id IN (SELECT id FROM _dirty_to_delete);
DELETE FROM public.trade_signals WHERE asset_id IN (SELECT id FROM _dirty_to_delete);

-- Now safe to delete the dirty asset rows
DELETE FROM public.assets WHERE id IN (SELECT id FROM _dirty_to_delete);

-- Renames (clean target does not exist)
UPDATE public.assets SET ticker = 'SVC', exchange = 'NASDAQ' WHERE ticker = 'NASDAQ:SVC';
UPDATE public.assets SET ticker = 'KRC', exchange = 'NYSE' WHERE ticker = 'NYSE: KRC';
UPDATE public.assets SET ticker = 'TFIN.PR' WHERE ticker = 'TFIN.PR.';
UPDATE public.assets SET ticker = 'BFA' WHERE ticker = 'BFA, BFB';
UPDATE public.assets SET ticker = 'CRDA' WHERE ticker = 'CRDA CRDB';

COMMIT;