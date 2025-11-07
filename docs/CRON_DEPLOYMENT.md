# Cron Job Deployment Guide

## Quick Start

You have **two options** for scheduling data ingestion:

### Option 1: Supabase pg_cron (Recommended)
✅ Native to Supabase
✅ No external dependencies
✅ Runs inside your database

### Option 2: GitHub Actions
✅ Version controlled
✅ Easy to debug via UI
✅ Works if pg_cron has issues

---

## Option 1: Supabase pg_cron Setup

### Step 1: Get Your Service Role Key
1. Go to your Supabase project: https://supabase.com/dashboard/project/detxhoqiarohjevedmxh
2. Navigate to **Settings** → **API**
3. Copy the **service_role** key (not the anon key!)

### Step 2: Run the SQL Script
1. Open **SQL Editor** in your Supabase dashboard
2. Copy the contents of `supabase/migrations/setup_cron_jobs.sql`
3. **IMPORTANT**: Replace `YOUR_SERVICE_ROLE_KEY` with your actual service role key
4. Run the script

### Step 3: Verify Installation
```sql
-- View all scheduled jobs
SELECT jobid, jobname, schedule, active 
FROM cron.job 
ORDER BY jobname;

-- Expected output: 8 jobs
-- ✓ daily-market-close-prices
-- ✓ daily-market-close-technicals
-- ✓ daily-market-close-patterns
-- ✓ weekly-cot-reports
-- ✓ weekly-fred-economics
-- ✓ 6h-ai-research
-- ✓ 6h-forex-sentiment
-- ✓ 6h-signals-generation
-- ✓ health-monitoring
```

### Step 4: Monitor Job Runs
```sql
-- View recent runs
SELECT 
  job.jobname,
  details.status,
  details.start_time,
  details.end_time,
  details.return_message
FROM cron.job_run_details details
JOIN cron.job ON cron.job.jobid = details.jobid
ORDER BY start_time DESC
LIMIT 20;
```

---

## Option 2: GitHub Actions Setup

### Step 1: Add GitHub Secret
1. Go to your GitHub repository settings
2. Navigate to **Secrets and variables** → **Actions**
3. Add new repository secret:
   - Name: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Your service role key from Supabase

### Step 2: (Optional) Add Slack Webhook
If you want Slack notifications:
1. Create a Slack webhook: https://api.slack.com/messaging/webhooks
2. Add another secret:
   - Name: `SLACK_WEBHOOK_URL`
   - Value: Your Slack webhook URL

### Step 3: Enable Workflows
The workflow file is already in `.github/workflows/data-ingestion-cron.yml`

GitHub Actions will automatically:
- Run daily market close jobs @ 4PM EST
- Run weekly jobs on Fridays @ 6PM EST
- Run 6-hourly jobs continuously
- Check for failures and send alerts

### Step 4: Manual Trigger (Optional)
You can manually trigger jobs:
1. Go to **Actions** tab in your GitHub repo
2. Select **Data Ingestion Cron Jobs**
3. Click **Run workflow**
4. Choose job type: `daily_market_close`, `weekly_economic`, `six_hourly`, or `all`

---

## Schedule Overview

| Job | Frequency | Time (EST) | Time (UTC) | Functions |
|-----|-----------|------------|------------|-----------|
| Market Close | Daily | 4:00 PM | 9:00 PM | prices → technicals → patterns |
| Economic Data | Weekly (Fri) | 6:00 PM | 11:00 PM | COT reports → FRED data |
| AI & Sentiment | Every 6h | 0, 6, 12, 18 | 0, 6, 12, 18 | AI research → forex sentiment → signals |
| Health Check | Every 15min | Continuous | Continuous | Alert monitoring |

---

## Monitoring & Troubleshooting

### Check System Health
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/health-metrics
```

### View Ingestion Logs
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-ingest-logs?limit=50
```

### Check for Active Alerts
```bash
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-alerts-errors
```

### Common Issues

#### Jobs Not Running
**pg_cron:**
```sql
-- Check if extensions are enabled
SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');

-- Check job status
SELECT * FROM cron.job WHERE active = false;

-- Re-enable a job
UPDATE cron.job SET active = true WHERE jobname = 'job-name-here';
```

**GitHub Actions:**
- Check **Actions** tab for workflow runs
- Look for error messages in job logs
- Verify `SUPABASE_SERVICE_ROLE_KEY` secret is set

#### High Failure Rate
1. Check `ingest_logs` table:
   ```sql
   SELECT etl_name, status, error_message, started_at 
   FROM ingest_logs 
   WHERE status = 'failure' 
   ORDER BY started_at DESC 
   LIMIT 10;
   ```

2. Common causes:
   - API rate limits exceeded
   - Network timeouts
   - Invalid API keys
   - Data source unavailable

#### Stale Data
If critical tables aren't updating:
```bash
# Manually trigger all jobs
curl -X POST https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-orchestrator \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"frequency":"all"}'
```

---

## Uninstalling Cron Jobs

### pg_cron
```sql
-- Unschedule individual job
SELECT cron.unschedule('job-name-here');

-- Unschedule ALL jobs (CAREFUL!)
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN SELECT jobname FROM cron.job LOOP
    PERFORM cron.unschedule(job_record.jobname);
  END LOOP;
END $$;
```

### GitHub Actions
Delete or disable the workflow file:
- Option 1: Delete `.github/workflows/data-ingestion-cron.yml`
- Option 2: Disable via GitHub UI: **Actions** → **Workflows** → **Disable workflow**

---

## Next Steps

After deployment:
1. ✅ Wait 15 minutes and check `api-alerts-errors` for issues
2. ✅ Monitor `ingest_logs` table for first successful runs
3. ✅ Configure Slack webhook for critical alerts (optional)
4. ✅ Review data freshness in `health-metrics` endpoint
5. ✅ Tune job frequencies based on your needs

## Support

If jobs consistently fail:
1. Check API rate limits and quotas
2. Review edge function logs in Supabase dashboard
3. Verify all required secrets are configured
4. Test functions manually before scheduling
