-- ============================================
-- OPTIMIZED Supabase Cron Job Setup
-- Cost-optimized ingestion pipeline for Opportunity Radar
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- HIGH FREQUENCY (15 minutes)
-- ============================================

-- Prices ingestion (every 15 minutes - Yahoo only, no fallback)
SELECT cron.schedule(
  '15min-prices-ingest',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-prices-yahoo',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- MEDIUM FREQUENCY (3 hours)
-- ============================================

-- Breaking news (every 3 hours - down from 15 min)
SELECT cron.schedule(
  '3h-breaking-news',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-breaking-news',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- STANDARD FREQUENCY (6 hours)
-- ============================================

-- FRED Economic Data
SELECT cron.schedule(
  '6h-fred-economics',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-fred-economics',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Crypto On-Chain Metrics
SELECT cron.schedule(
  '6h-crypto-onchain',
  '5 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-crypto-onchain',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- 13F Holdings
SELECT cron.schedule(
  '6h-13f-holdings',
  '10 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-13f-holdings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Earnings Reports
SELECT cron.schedule(
  '6h-earnings',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-earnings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Google Trends
SELECT cron.schedule(
  '6h-google-trends',
  '20 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-google-trends',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Options Flow
SELECT cron.schedule(
  '6h-options-flow',
  '25 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-options-flow',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Patents
SELECT cron.schedule(
  '6h-patents',
  '30 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-patents',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Congressional Trades
SELECT cron.schedule(
  '6h-congressional-trades',
  '35 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-congressional-trades',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Dark Pool Activity
SELECT cron.schedule(
  '6h-dark-pool',
  '40 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-dark-pool',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ETF Flows
SELECT cron.schedule(
  '6h-etf-flows',
  '45 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-etf-flows',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- FINRA Dark Pool
SELECT cron.schedule(
  '6h-finra-darkpool',
  '50 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-finra-darkpool',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Form 4 Insider Trading
SELECT cron.schedule(
  '6h-form4',
  '55 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-form4',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Job Postings
SELECT cron.schedule(
  '6h-job-postings',
  '0 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-job-postings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- News Sentiment
SELECT cron.schedule(
  '6h-news-sentiment',
  '5 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-news-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Policy Feeds
SELECT cron.schedule(
  '6h-policy-feeds',
  '10 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-policy-feeds',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Reddit Sentiment
SELECT cron.schedule(
  '6h-reddit-sentiment',
  '15 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-reddit-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Search Trends
SELECT cron.schedule(
  '6h-search-trends',
  '20 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-search-trends',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Short Interest
SELECT cron.schedule(
  '6h-short-interest',
  '25 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-short-interest',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Smart Money Flow
SELECT cron.schedule(
  '6h-smart-money',
  '30 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-smart-money',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- StockTwits Sentiment
SELECT cron.schedule(
  '6h-stocktwits',
  '35 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-stocktwits',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Supply Chain Intelligence
SELECT cron.schedule(
  '6h-supply-chain',
  '40 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-supply-chain',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- COT Reports
SELECT cron.schedule(
  '6h-cot-reports',
  '45 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-cot-reports',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Advanced Technicals
SELECT cron.schedule(
  '6h-advanced-technicals',
  '50 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-advanced-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Pattern Recognition
SELECT cron.schedule(
  '6h-pattern-recognition',
  '55 1,7,13,19 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-pattern-recognition',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Forex Technicals
SELECT cron.schedule(
  '6h-forex-technicals',
  '0 2,8,14,20 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-technicals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- AI Research
SELECT cron.schedule(
  '6h-ai-research',
  '5 2,8,14,20 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-ai-research',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Forex Sentiment
SELECT cron.schedule(
  '6h-forex-sentiment',
  '10 2,8,14,20 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-forex-sentiment',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Signal Generation (Alerts)
SELECT cron.schedule(
  '6h-generate-alerts',
  '15 2,8,14,20 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Theme Discovery
SELECT cron.schedule(
  '6h-theme-discovery',
  '20 2,8,14,20 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/mine-and-discover-themes',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- SYSTEM HEALTH & CLEANUP (Every 15 Minutes)
-- ============================================

SELECT cron.schedule(
  'health-monitoring',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-alerts-errors',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Cleanup Orphaned Logs (every hour)
SELECT cron.schedule(
  'cleanup-orphaned-logs',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/cleanup-orphaned-logs',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Daily Ingestion Digest (9AM AEST = 11PM UTC previous day)
SELECT cron.schedule(
  'daily-ingestion-digest',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/daily-ingestion-digest',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- UTILITY QUERIES FOR MANAGEMENT
-- ============================================

-- View all scheduled jobs
-- SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- View recent job runs with errors
-- SELECT * FROM cron.job_run_details 
-- WHERE status != 'succeeded' 
-- ORDER BY start_time DESC LIMIT 20;

-- Unschedule a specific job
-- SELECT cron.unschedule('job-name-here');

-- Unschedule ALL jobs (CAREFUL!)
-- SELECT cron.unschedule(jobname) FROM cron.job;

-- Check last run times
-- SELECT 
--   j.jobname,
--   j.schedule,
--   MAX(r.start_time) as last_run,
--   MAX(CASE WHEN r.status = 'succeeded' THEN r.start_time END) as last_success
-- FROM cron.job j
-- LEFT JOIN cron.job_run_details r ON j.jobid = r.jobid
-- GROUP BY j.jobname, j.schedule
-- ORDER BY last_run DESC;

-- ============================================
-- OPTIMIZATION SUMMARY
-- ============================================
-- 
-- Key Changes:
-- ✅ ingest-prices-yahoo: Every 15 minutes (Yahoo only, no Perplexity fallback)
-- ✅ ingest-breaking-news: Every 3 hours (down from 15 min)
-- ✅ ingest-crypto-onchain: Every 6 hours (down from daily)
-- ✅ ingest-fred-economics: Every 6 hours (now scheduled)
-- ✅ All 26 dormant functions: Now on 6-hour schedule
-- 
-- Expected Results:
-- 📊 Data freshness: ≤15min for prices, ≤3h for news, ≤6h for all else
-- 💰 Perplexity API usage: <200 calls/day (down from 900+)
-- 🔄 All ingestion now automated (no manual triggers needed)
-- ⚡ Staggered execution prevents resource contention
