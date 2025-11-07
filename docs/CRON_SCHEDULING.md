# Data Pipeline Cron Scheduling Guide

## Overview
This guide details how to schedule automated data ingestion jobs using Supabase pg_cron.

## Prerequisites
Enable required extensions in your Supabase project:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

## Recommended Schedule

### Hourly Jobs (High-Frequency Market Data)
```sql
SELECT cron.schedule(
  'ingest-hourly',
  '0 * * * *', -- Every hour at :00
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"frequency":"hourly"}'::jsonb
  ) as request_id;
  $$
);
```

**Includes:**
- `ingest-prices-yahoo` - OHLCV data
- `ingest-advanced-technicals` - Technical indicators
- `ingest-pattern-recognition` - Chart patterns
- `ingest-news-sentiment` - News aggregation
- `ingest-signals` - Signal generation

### Daily Jobs (End-of-Day Processing)
```sql
SELECT cron.schedule(
  'ingest-daily',
  '0 18 * * *', -- 6:00 PM EST (after market close)
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"frequency":"daily"}'::jsonb
  ) as request_id;
  $$
);
```

**Includes:**
- `ingest-dark-pool` - Dark pool activity
- `ingest-options-flow` - Options flow
- `ingest-short-interest` - Short interest data
- `ingest-congressional-trades` - Congressional trading
- `ingest-earnings` - Earnings data
- `ingest-job-postings` - Job market signals
- `ingest-smart-money` - Smart money flow
- `ingest-social-signals` - Social media sentiment
- `ingest-search-trends` - Google Trends
- `ingest-crypto-onchain` - Crypto on-chain metrics
- `ingest-forex-sentiment` - Forex sentiment
- `ingest-forex-technicals` - Forex indicators

### Weekly Jobs (Heavy Processing)
```sql
SELECT cron.schedule(
  'ingest-weekly',
  '0 9 * * 6', -- Saturdays at 9:00 AM
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-orchestrator',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{"frequency":"weekly"}'::jsonb
  ) as request_id;
  $$
);
```

**Includes:**
- `ingest-cot-cftc` - CFTC Commitments of Traders
- `ingest-fred-economics` - Economic indicators
- `ingest-13f-holdings` - 13F filings
- `ingest-form4` - SEC Form 4 insider trades
- `ingest-etf-flows` - ETF flow data
- `ingest-policy-feeds` - Policy/regulatory feeds
- `ingest-ai-research` - AI-generated research reports

### On-Demand Jobs (Periodic Maintenance)
```sql
-- Generate AI research reports (weekly)
SELECT cron.schedule(
  'generate-ai-research',
  '0 10 * * 0', -- Sundays at 10:00 AM
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-ai-research',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);

-- Health check monitoring (every 15 minutes)
SELECT cron.schedule(
  'health-check',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://detxhoqiarohjevedmxh.supabase.co/functions/v1/health-metrics',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) as request_id;
  $$
);
```

## Managing Cron Jobs

### List All Jobs
```sql
SELECT * FROM cron.job;
```

### Unschedule a Job
```sql
SELECT cron.unschedule('job-name');
```

### View Job Run History
```sql
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

## Monitoring

### Check ETL Logs
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-ingest-logs
```

### Check System Health
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/health-metrics
```

### Check Alerts
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-alerts-errors
```

## Slack Alerts (Optional)

To receive critical alerts in Slack, add your webhook URL as a secret:
1. Create a Slack webhook: https://api.slack.com/messaging/webhooks
2. Add to Supabase secrets as `SLACK_WEBHOOK_URL`
3. Alerts will automatically be sent for:
   - Empty critical tables
   - ETL failures (>3 consecutive)
   - Stale data (>24h old)

## Troubleshooting

### Job Not Running
1. Verify pg_cron is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Check job status: `SELECT * FROM cron.job WHERE jobname = 'your-job-name';`
3. Review logs: `SELECT * FROM cron.job_run_details WHERE jobid = YOUR_JOB_ID;`

### High Failure Rate
1. Check individual ETL logs via `/api-ingest-logs?status=failure`
2. Review error messages in `ingest_logs` table
3. Verify API keys and rate limits

### Stale Data
1. Run diagnostics: `curl .../ingest-diagnostics`
2. Manually trigger: `curl -X POST .../ingest-orchestrator -d '{"frequency":"all"}'`
3. Check if cron job is scheduled correctly

## Best Practices

1. **Stagger Heavy Jobs**: Don't run all jobs at the same time
2. **Monitor Rate Limits**: Watch for 429 errors in logs
3. **Set TTL Policies**: Auto-delete old data to save space
4. **Regular Health Checks**: Monitor health-metrics every 15 minutes
5. **Alert on Critical Failures**: Use Slack integration for immediate notification
6. **Test Before Scheduling**: Run manually first to ensure success
7. **Document Dependencies**: Note which jobs depend on others

## Next Steps

After setting up cron:
1. Run initial full ingestion: `{"frequency":"all"}`
2. Monitor logs for 24 hours
3. Tune frequencies based on data volatility
4. Set up Slack alerts
5. Add custom alerts for specific thresholds
