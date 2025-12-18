
-- ============================================================
-- PHASE 0: PREPARATION - DISABLE ESTIMATION CRON JOBS & PURGE FAKE DATA
-- ============================================================

-- STEP 1: DISABLE ALL ESTIMATION CRON JOBS (22 jobs)
-- These jobs generate fake/estimated data that must be stopped

SELECT cron.unschedule('ingest-advanced-technicals');
SELECT cron.unschedule('ingest-breaking-news');
SELECT cron.unschedule('ingest-cot-cftc');
SELECT cron.unschedule('ingest-cot-reports');
SELECT cron.unschedule('ingest-crypto-onchain');
SELECT cron.unschedule('ingest-dark-pool');
SELECT cron.unschedule('ingest-earnings');
SELECT cron.unschedule('ingest-economic-calendar');
SELECT cron.unschedule('ingest-etf-flows');
SELECT cron.unschedule('ingest-finra-darkpool');
SELECT cron.unschedule('ingest-forex-sentiment');
SELECT cron.unschedule('ingest-forex-technicals');
SELECT cron.unschedule('ingest-google-trends');
SELECT cron.unschedule('ingest-job-postings');
SELECT cron.unschedule('ingest-options-flow');
SELECT cron.unschedule('ingest-patents');
SELECT cron.unschedule('ingest-pattern-recognition');
SELECT cron.unschedule('ingest-reddit-sentiment');
SELECT cron.unschedule('ingest-short-interest');
SELECT cron.unschedule('ingest-smart-money');
SELECT cron.unschedule('ingest-stocktwits');
SELECT cron.unschedule('ingest-supply-chain');

-- Also disable signal generation jobs that process fake data (until ingests are fixed)
SELECT cron.unschedule('generate-darkpool-signals-daily');
SELECT cron.unschedule('generate-cot-signals-weekly');
SELECT cron.unschedule('generate-jobposting-signals-weekly');
SELECT cron.unschedule('hourly-signals-options');
SELECT cron.unschedule('hourly-signals-social');

-- STEP 2: TRUNCATE ALL TABLES WITH FAKE/ESTIMATED DATA
-- WARNING: This removes ALL data from these tables - they will be repopulated with REAL data

TRUNCATE TABLE dark_pool_activity CASCADE;
TRUNCATE TABLE options_flow CASCADE;
TRUNCATE TABLE short_interest CASCADE;
TRUNCATE TABLE crypto_onchain_metrics CASCADE;
TRUNCATE TABLE earnings_sentiment CASCADE;
TRUNCATE TABLE forex_sentiment CASCADE;
TRUNCATE TABLE forex_technicals CASCADE;
TRUNCATE TABLE advanced_technicals CASCADE;
TRUNCATE TABLE supply_chain_signals CASCADE;
TRUNCATE TABLE social_signals CASCADE;
TRUNCATE TABLE patent_filings CASCADE;
TRUNCATE TABLE search_trends CASCADE;
TRUNCATE TABLE smart_money_flow CASCADE;

-- For these tables, keep real data but purge estimated records:
-- job_postings - some from Adzuna API are real
-- cot_reports - some from CFTC API are real
-- breaking_news - some from Firecrawl are real
-- economic_indicators - some from FRED are real

-- Log this cleanup in function_status for audit trail
INSERT INTO function_status (function_name, status, executed_at, metadata)
VALUES (
  'phase-0-cleanup', 
  'success', 
  now(), 
  jsonb_build_object(
    'action', 'DISABLED_ESTIMATION_CRONS_AND_PURGED_FAKE_DATA',
    'cron_jobs_disabled', 27,
    'tables_truncated', 13,
    'timestamp', now()
  )
);
