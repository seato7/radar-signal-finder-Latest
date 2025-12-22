# Testing Guide

## Overview
This guide covers testing for the Opportunity Radar platform, which uses a hybrid architecture:
- **Railway Python Backend**: FastAPI with TwelveData price ingestion
- **Supabase Edge Functions**: 90+ data ingestion and AI functions
- **Supabase PostgreSQL**: Primary database

---

## Backend Tests (Python/FastAPI)

### Running Tests
```bash
# Run all backend tests
cd backend
pytest -v

# Run with coverage
pytest --cov=backend --cov-report=html

# Run specific test file
pytest tests/test_scoring.py -v

# Run tests matching pattern
pytest -k "test_price" -v
```

### Test Files
| File | Coverage |
|------|----------|
| `tests/test_main.py` | Health endpoints, API routes |
| `tests/test_scoring.py` | Scoring decay, weights |
| `tests/test_prices.py` | TwelveData price ingestion |
| `tests/test_assets.py` | Asset CRUD operations |
| `tests/test_bots.py` | Trading bot logic |
| `tests/test_alerts.py` | Alert generation |
| `tests/test_watchlist.py` | Watchlist operations |
| `tests/test_cache.py` | Redis caching |
| `tests/test_subscriptions.py` | Stripe subscriptions |

### Sample Test
```python
# tests/test_scoring.py
import pytest
from backend.scoring import compute_decay, compute_theme_score

def test_decay_half_life():
    """Signal at half-life should have ~50% weight"""
    decay = compute_decay(days_ago=30, half_life=30)
    assert 0.49 < decay < 0.51

def test_fresh_signal_full_weight():
    """Fresh signal should have full weight"""
    decay = compute_decay(days_ago=0, half_life=30)
    assert decay == 1.0
```

---

## Edge Function Tests

### Manual Testing
```bash
# Test ingestion function
curl -X POST https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-news-rss \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"

# Test with payload
curl -X POST https://detxhoqiarohjevedmxh.supabase.co/functions/v1/chat-assistant \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is the top opportunity?"}]}'
```

### Check Function Logs
```bash
# Via Supabase CLI
supabase functions list
supabase functions logs ingest-news-rss --tail
```

---

## Integration Tests

### Full Pipeline Test
```bash
# 1. Trigger ingestion
curl -X POST .../functions/v1/trigger-all-ingestions

# 2. Check ingest logs
curl .../functions/v1/api-ingest-logs?limit=20

# 3. Verify data freshness
curl .../functions/v1/api-data-staleness

# 4. Check for errors
curl .../functions/v1/api-alerts-errors
```

### Database Validation
```sql
-- Check recent prices
SELECT ticker, close_price, updated_at
FROM prices
ORDER BY updated_at DESC
LIMIT 10;

-- Check signal counts by type
SELECT signal_type, COUNT(*) as count
FROM signals
WHERE observed_at > NOW() - INTERVAL '24 hours'
GROUP BY signal_type
ORDER BY count DESC;

-- Check theme scores
SELECT t.name, ts.score, ts.computed_at
FROM themes t
JOIN theme_scores ts ON t.id = ts.theme_id
ORDER BY ts.computed_at DESC
LIMIT 10;
```

---

## Manual Testing Checklist

### Authentication
- [ ] Sign up with email
- [ ] Login/logout
- [ ] Password reset
- [ ] Session persistence

### Core Features
- [ ] View radar dashboard
- [ ] View theme details
- [ ] Add/remove watchlist items
- [ ] Create/manage alerts
- [ ] View asset details

### AI Features
- [ ] AI chat assistant responds
- [ ] Theme "Why Now?" summaries load
- [ ] Signal explanations work
- [ ] Risk assessment displays

### Payments (Stripe)
- [ ] Checkout flow works
- [ ] Subscription upgrades
- [ ] Customer portal access
- [ ] Webhook processing

### Data Pipeline
- [ ] Prices updating (check TwelveData scheduler)
- [ ] RSS feeds ingesting
- [ ] Signals generating
- [ ] Theme scores computing

---

## Smoke Tests (Production)

### Health Endpoints
```bash
# Railway backend health
curl https://opportunity-radar-api-production.up.railway.app/api/health

# Supabase edge function health
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/health-metrics
```

### Data Freshness
```bash
# Check data staleness
curl https://detxhoqiarohjevedmxh.supabase.co/functions/v1/api-data-staleness
```

### Critical Checks
1. **Prices**: Updated within last 30 minutes (Hot tier) or 24 hours (Standard)
2. **Signals**: Fresh signals in last hour
3. **Themes**: Scores computed in last 4 hours
4. **Alerts**: System generating alerts

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)
```yaml
name: CI
on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r backend/requirements.txt
      - run: pytest backend/tests/ -v --tb=short

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
```

---

## Troubleshooting

### Test Failures
1. Check environment variables are set
2. Verify database connectivity
3. Check API rate limits
4. Review error logs

### Flaky Tests
- Add retry logic for network-dependent tests
- Mock external APIs where possible
- Use fixtures for consistent data

### Performance Issues
- Profile slow tests with `pytest --durations=10`
- Consider parallel test execution with `pytest-xdist`
