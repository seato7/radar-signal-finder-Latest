-- Add 8 high-recognition assets that were missing from the catalogue
-- and delete the obscure Dotcoin row (with cascade cleanup of child records).

BEGIN;

-- ═══════════════════════════════════════════════════════════
-- DELETE PHASE: First find and clean up child records for Dotcoin
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE
  v_asset_id UUID;
BEGIN
  -- Find the Dotcoin asset ID
  SELECT id INTO v_asset_id FROM public.assets
  WHERE ticker = 'DOT/USD' AND name = 'Dotcoin';
  
  IF v_asset_id IS NOT NULL THEN
    -- Delete from child tables using asset_id
    DELETE FROM public.ai_scores WHERE asset_id = v_asset_id;
    DELETE FROM public.advanced_technicals WHERE asset_id = v_asset_id;
    DELETE FROM public.ai_research_reports WHERE asset_id = v_asset_id;
    DELETE FROM public.company_fundamentals WHERE asset_id = v_asset_id;
    DELETE FROM public.cot_reports WHERE asset_id = v_asset_id;
    DELETE FROM public.crypto_onchain_metrics WHERE asset_id = v_asset_id;
    DELETE FROM public.dark_pool_activity WHERE asset_id = v_asset_id;
    DELETE FROM public.eps_revisions WHERE asset_id = v_asset_id;
    DELETE FROM public.etf_flows WHERE asset_id = v_asset_id;
    DELETE FROM public.forex_sentiment WHERE asset_id = v_asset_id;
    DELETE FROM public.forex_technicals WHERE asset_id = v_asset_id;
    DELETE FROM public.form4_insider_trades WHERE asset_id = v_asset_id;
    DELETE FROM public.smart_money_flow WHERE asset_id = v_asset_id;
    
    -- Delete from tables that reference by asset_id (no ticker column)
    DELETE FROM public.signals WHERE asset_id = v_asset_id;
    DELETE FROM public.asset_predictions WHERE asset_id = v_asset_id;
    
    -- Delete from tables that have ticker column
    DELETE FROM public.prices WHERE ticker = 'DOT/USD';
    DELETE FROM public.trade_signals WHERE ticker = 'DOT/USD';
    DELETE FROM public.trade_signals WHERE asset_id = v_asset_id;
    DELETE FROM public.asset_score_snapshots WHERE ticker = 'DOT/USD';
  END IF;
END $$;

-- Now safe to delete the asset
DELETE FROM public.assets
WHERE ticker = 'DOT/USD'
  AND name = 'Dotcoin';

-- ═══════════════════════════════════════════════════════════
-- ADD PHASE: Insert the 8 high-recognition assets
-- ═══════════════════════════════════════════════════════════

-- ADD: Top S&P 500 REITs missing from catalogue (6 rows)
INSERT INTO public.assets (ticker, name, exchange, asset_class, sector, base_currency, quote_currency, metadata)
VALUES
  ('PLD',  'Prologis Inc.',         'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Industrial"}'::jsonb),
  ('AMT',  'American Tower Corp.',  'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Specialty"}'::jsonb),
  ('WELL', 'Welltower Inc.',        'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Healthcare Facilities"}'::jsonb),
  ('DLR',  'Digital Realty Trust',  'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Office"}'::jsonb),
  ('EQR',  'Equity Residential',    'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Residential"}'::jsonb),
  ('INVH', 'Invitation Homes Inc.', 'NYSE', 'stock', 'Real Estate', 'USD', 'USD', '{"sector":"Real Estate","industry":"REIT - Residential"}'::jsonb)
ON CONFLICT (ticker) DO NOTHING;

-- ADD: Blackstone (1 row). Largest alternative asset manager.
INSERT INTO public.assets (ticker, name, exchange, asset_class, sector, base_currency, quote_currency, metadata)
VALUES
  ('BX', 'Blackstone Inc.', 'NYSE', 'stock', 'Financial Services', 'USD', 'USD', '{"sector":"Financial Services","industry":"Asset Management"}'::jsonb)
ON CONFLICT (ticker) DO NOTHING;

-- ADD: IEFA (1 row). Top-20 ETF globally by AUM (~$130B).
INSERT INTO public.assets (ticker, name, exchange, asset_class, sector, base_currency, quote_currency, metadata)
VALUES
  ('IEFA', 'iShares Core MSCI EAFE ETF', 'CBOE', 'etf', 'International Developed Markets', 'USD', 'USD', '{"sector":"International Developed Markets","issuer":"iShares"}'::jsonb)
ON CONFLICT (ticker) DO NOTHING;

COMMIT;