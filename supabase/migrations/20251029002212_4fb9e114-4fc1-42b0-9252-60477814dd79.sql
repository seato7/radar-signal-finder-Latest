-- Remove Twitter-related data and scheduled job

-- Drop the Twitter signals table
DROP TABLE IF EXISTS public.twitter_signals CASCADE;

-- Remove the Twitter ingestion cron job
SELECT cron.unschedule('ingest-twitter-3hourly');