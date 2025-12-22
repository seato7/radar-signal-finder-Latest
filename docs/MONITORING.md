# Monitoring & Alerting Guide

## Overview

Opportunity Radar uses multiple monitoring layers across the hybrid architecture.

---

## Health Endpoints

### Railway Backend
```bash
# Basic health
curl https://opportunity-radar-api-production.up.railway.app/api/health

# Scheduler status
curl https://opportunity-radar-api-production.up.railway.app/api/health/scheduler

# Response:
{
  "status": "healthy",
  "scheduler": {
    "mode": "credit_budgeted_tiered",
    "scheduler_active": true,
    "total_runs": 1234,
    "successful_runs": 1200,
    "credits_used_today": 45000,
    "tier_stats": {
      "hot": {"assets": 100, "last_refresh": "2024-01-15T10:00:00Z"},
      "active": {"assets": 500, "last_refresh": "2024-01-15T09:30:00Z"},
      "standard": {"assets": 26400, "last_refresh": "2024-01-15T00:00:00Z"}
    }
  }
}
```

### Supabase Edge Functions
```bash
# Health metrics
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/health-metrics

# Ingestion health
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingestion-health

# Data staleness
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-data-staleness

# Error alerts
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-alerts-errors

# Ingest logs
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-ingest-logs?limit=20
```

---

## Database Monitoring

### Function Status
```sql
-- Recent function executions
SELECT function_name, status, executed_at, duration_ms, error_message
FROM function_status
ORDER BY executed_at DESC
LIMIT 20;

-- Function success rates (24h)
SELECT 
  function_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'success') as success,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 1) as success_rate
FROM function_status
WHERE executed_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name
ORDER BY success_rate ASC;
```

### Data Freshness
```sql
-- Check stale functions
SELECT * FROM get_stale_functions();

-- Price data freshness
SELECT 
  asset_class,
  COUNT(*) as assets,
  MIN(updated_at) as oldest,
  MAX(updated_at) as newest,
  AVG(EXTRACT(EPOCH FROM (NOW() - updated_at))/3600) as avg_hours_old
FROM prices
GROUP BY asset_class;

-- Signal freshness by type
SELECT 
  signal_type,
  COUNT(*) as count,
  MAX(observed_at) as latest
FROM signals
WHERE observed_at > NOW() - INTERVAL '7 days'
GROUP BY signal_type
ORDER BY latest DESC;
```

### Ingest Logs
```sql
-- Recent ingestion runs
SELECT 
  etl_name,
  status,
  rows_inserted,
  rows_skipped,
  duration_seconds,
  source_used,
  error_message,
  started_at
FROM ingest_logs
ORDER BY started_at DESC
LIMIT 50;

-- Failed ingestions (24h)
SELECT etl_name, error_message, started_at
FROM ingest_logs
WHERE status = 'failure'
  AND started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;
```

---

## Watchdog System

### Automated Health Checks
The `watchdog-ingestion-health` function runs every 15 minutes:

```typescript
// Checks performed:
1. Function execution recency
2. Data table freshness
3. Signal distribution balance
4. AI fallback usage rates
5. Error rate thresholds

// Alerts triggered for:
- Functions not run in expected interval
- Tables with no recent data
- >90% signal direction skew
- >80% AI fallback usage
- >10% error rate
```

### Circuit Breaker
```sql
-- Check circuit breaker status
SELECT * FROM circuit_breaker_status;

-- Fields:
-- function_name: Which function
-- is_open: true = circuit open (blocking calls)
-- consecutive_failures: Failure count
-- opened_at: When circuit opened
-- reason: Why it opened
```

---

## Slack Alerting

### Setup
1. Create Slack webhook: https://api.slack.com/messaging/webhooks
2. Add to Supabase secrets as `SLACK_WEBHOOK_URL`
3. Alerts automatically sent

### Alert Types

| Alert | Severity | Trigger |
|-------|----------|---------|
| Ingestion Failure | 🔴 Critical | 3+ consecutive failures |
| Stale Data | 🟠 Warning | Critical table >24h old |
| Signal Skew | 🟡 Info | >90% one direction |
| AI Fallback High | 🟡 Info | >80% using fallback |
| Function Timeout | 🔴 Critical | Execution >60s |
| Rate Limit Hit | 🟠 Warning | API quota exceeded |

### Alert Format
```
🔴 INGESTION FAILURE

Function: ingest-news-rss
Status: failure
Error: API rate limit exceeded
Time: 2024-01-15 10:30:00 UTC

Last 3 runs: ❌ ❌ ❌
```

---

## API Usage Monitoring

### TwelveData (Railway)
```sql
-- Daily credit usage
SELECT 
  DATE(started_at) as date,
  SUM((metadata->>'batch_size')::int) as credits_used
FROM ingest_logs
WHERE etl_name LIKE 'twelvedata-%'
  AND status = 'success'
GROUP BY DATE(started_at)
ORDER BY date DESC
LIMIT 7;
```

### All APIs
```sql
-- API usage summary
SELECT * FROM get_api_usage_summary(24);

-- Returns:
-- api_name, total_calls, successful_calls, failed_calls
-- cached_calls, success_rate, avg_response_time_ms, estimated_cost
```

---

## Dashboard Queries

### System Overview
```sql
-- Assets by class
SELECT asset_class, COUNT(*) as count
FROM assets
GROUP BY asset_class;

-- Signals last 24h
SELECT signal_type, COUNT(*) as count
FROM signals
WHERE observed_at > NOW() - INTERVAL '24 hours'
GROUP BY signal_type
ORDER BY count DESC;

-- Theme scores
SELECT t.name, ts.score, ts.computed_at
FROM themes t
JOIN theme_scores ts ON t.id = ts.theme_id
WHERE ts.computed_at = (
  SELECT MAX(computed_at) FROM theme_scores WHERE theme_id = t.id
)
ORDER BY ts.score DESC;
```

### Error Summary
```sql
-- Errors by function (7 days)
SELECT 
  function_name,
  COUNT(*) as error_count,
  array_agg(DISTINCT error_message) as error_types
FROM function_status
WHERE status = 'failure'
  AND executed_at > NOW() - INTERVAL '7 days'
GROUP BY function_name
ORDER BY error_count DESC;
```

---

## Troubleshooting Runbook

### No Data Updates
1. Check scheduler: `GET /api/health/scheduler`
2. Check cron jobs: `SELECT * FROM cron.job;`
3. Check function status: `SELECT * FROM function_status ORDER BY executed_at DESC LIMIT 10;`
4. Check Slack for alerts
5. Manually trigger: `curl -X POST .../trigger-all-ingestions`

### High Error Rate
1. Check error logs: `SELECT * FROM ingest_logs WHERE status = 'failure' ORDER BY started_at DESC;`
2. Check circuit breakers: `SELECT * FROM circuit_breaker_status WHERE is_open = true;`
3. Verify API keys are valid
4. Check rate limits

### Slow Performance
1. Check database size
2. Review query performance
3. Check for missing indexes
4. Monitor Railway/Supabase resources

---

## Metrics to Track

### Daily
- [ ] Price update success rate
- [ ] Signal generation count
- [ ] API error rate
- [ ] Data freshness

### Weekly
- [ ] Credit usage trends
- [ ] Theme score changes
- [ ] New asset additions
- [ ] User engagement

### Monthly
- [ ] Cost review
- [ ] Performance trends
- [ ] Security audit
- [ ] Capacity planning
