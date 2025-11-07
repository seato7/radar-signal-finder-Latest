# Monitoring Infrastructure Guide

## Overview

This guide documents the complete monitoring, alerting, and fault-tolerance infrastructure for the Opportunity Radar ingestion system.

## Architecture

### Components

1. **Ingest Logs** (`ingest_logs` table)
   - Records every ETL execution
   - Tracks success/failure, duration, rows processed
   - Enables historical analysis and debugging

2. **Alert System** (`/api-alerts-errors`)
   - Monitors ETL health in real-time
   - Detects stale data in critical tables
   - Identifies stuck/long-running jobs

3. **Retry Protection** (`retry-wrapper.ts`)
   - Exponential backoff for transient failures
   - Up to 3 automatic retries per job
   - Slack alerts on final failure

4. **API Endpoints**
   - `/api-ingest-logs` - Query execution history
   - `/api-alerts-errors` - Get current health status
   - `/api-signals` - Access scored signals

---

## Monitoring Triggers

### 1. ETL Failure Detection

**Trigger Conditions:**
- ETL fails ≥ 3 consecutive times
- Any ETL failure in critical functions

**Critical Functions:**
- `ingest-prices-yahoo`
- `ingest-advanced-technicals`
- `ingest-forex-sentiment`
- `ingest-economic-indicators`
- `generate-signals`

**Response:**
- Alert logged in `/api-alerts-errors`
- Slack notification sent (if webhook configured)
- Status marked as "critical" in health check

### 2. Stale Data Detection

**Trigger Conditions:**
- Critical table has 0 rows for >24 hours
- No new data inserted in >24 hours

**Critical Tables:**
- `prices`
- `signals`
- `forex_sentiment`
- `economic_indicators`
- `cot_reports`

**Response:**
- Alert logged with table name and last update time
- Slack notification with remediation steps
- Status marked as "degraded" or "critical"

### 3. Stuck Job Detection

**Trigger Conditions:**
- Job status = "running" for >60 minutes
- No completion timestamp recorded

**Response:**
- Alert logged with job name and start time
- Manual investigation required
- Possible automatic job termination (future)

---

## Retry Logic

### Exponential Backoff Parameters

```typescript
{
  maxRetries: 3,           // Maximum retry attempts
  initialDelayMs: 1000,    // 1 second initial delay
  maxDelayMs: 30000,       // 30 seconds max delay
  backoffMultiplier: 2     // Delay doubles each retry
}
```

### Retry Schedule

| Attempt | Delay Before Retry |
|---------|-------------------|
| 1       | 0ms (immediate)   |
| 2       | 1,000ms (1s)      |
| 3       | 2,000ms (2s)      |
| 4       | 4,000ms (4s)      |

### When Retries Are Applied

✅ **Retried Automatically:**
- Network timeouts
- Rate limit errors (429)
- Temporary API unavailability (503)
- Database connection errors

❌ **Not Retried:**
- Authentication failures (401, 403)
- Data validation errors
- Malformed requests (400)
- Resource not found (404)

---

## Slack Integration

### Setup

1. Create a Slack webhook URL:
   - Go to https://api.slack.com/apps
   - Create new app → Incoming Webhooks
   - Copy webhook URL

2. Add to environment:
   ```bash
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

3. Restart affected functions

### Alert Format

```
🚨 *Ingestion Alert*
*Function:* ingest-prices-yahoo
*Status:* Failed after all retries
*Error:* Network timeout after 15000ms
*Time:* 2025-01-15T18:30:00Z
*Recommendation:* Check API endpoint availability
```

---

## API Usage

### Query Execution Logs

```bash
GET /api-ingest-logs?limit=50&etl_name=ingest-prices-yahoo&status=failed
```

**Response:**
```json
{
  "summary": {
    "total_runs": 150,
    "success_count": 145,
    "failed_count": 5,
    "avg_duration_seconds": 8.5
  },
  "by_etl": {
    "ingest-prices-yahoo": {
      "runs": 50,
      "successes": 48,
      "failures": 2,
      "avg_duration": 7.2
    }
  },
  "logs": [...]
}
```

### Check Health Status

```bash
GET /api-alerts-errors
```

**Response:**
```json
{
  "summary": {
    "status": "healthy",
    "total_issues": 0,
    "critical_issues": 0,
    "last_check": "2025-01-15T18:00:00Z"
  },
  "alerts": [],
  "diagnostics": {
    "empty_tables": [],
    "stale_tables": [],
    "failed_etls": []
  }
}
```

---

## Troubleshooting

### ETL Keeps Failing

1. Check logs:
   ```bash
   GET /api-ingest-logs?etl_name=<function-name>&status=failed
   ```

2. Review error messages in `error_message` field

3. Common fixes:
   - API key expired → Update secret
   - Rate limit → Reduce frequency
   - Data format changed → Update parser

### Stale Data Warning

1. Check last successful run:
   ```bash
   GET /api-ingest-logs?etl_name=<function-name>&limit=1
   ```

2. Manually trigger ingestion:
   ```bash
   curl -X POST https://PROJECT_ID.supabase.co/functions/v1/<function-name> \
     -H "Authorization: Bearer ANON_KEY"
   ```

3. If persistent → Check cron job configuration

### Stuck Job

1. Identify stuck job:
   ```bash
   GET /api-alerts-errors
   ```

2. Check job logs in Supabase dashboard

3. Manual intervention:
   ```sql
   UPDATE ingest_logs 
   SET status = 'failed', 
       error_message = 'Manually terminated - stuck job',
       completed_at = NOW()
   WHERE id = '<job-id>';
   ```

---

## Maintenance

### Weekly Tasks

- Review failed jobs in `/api-ingest-logs`
- Check stale table warnings
- Verify cron jobs are running on schedule

### Monthly Tasks

- Analyze average job duration trends
- Review retry frequency (high = API issues)
- Clean old logs (optional retention policy)

### Alerting Thresholds

Current thresholds (configurable):
- Failure threshold: 3 consecutive failures
- Stale data threshold: 24 hours
- Stuck job threshold: 60 minutes

To modify, update `api-alerts-errors/index.ts`.

---

## Best Practices

1. **Always use retry wrapper** for external API calls
2. **Log all executions** to `ingest_logs` (success or failure)
3. **Mark critical functions** with `criticalFunction: true`
4. **Test failure scenarios** before production deployment
5. **Monitor Slack alerts** for early warning signs
6. **Document API changes** that affect ingestion

---

## Future Enhancements

- [ ] Automated job termination for stuck processes
- [ ] Historical trend analysis dashboard
- [ ] Predictive alerting (ML-based anomaly detection)
- [ ] Retry backoff per API endpoint
- [ ] Custom alerting channels (email, PagerDuty)
