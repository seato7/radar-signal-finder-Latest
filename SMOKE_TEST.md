# Smoke Test Checklist

Run these commands locally after deployment to verify spec compliance.

## Prerequisites

```bash
make up && make seed
```

Wait for all containers to be healthy.

---

## 1. Health & Configuration

### Verify API Health
```bash
curl http://localhost:8000/api/health
# Expected: {"status":"ok"}
```

### Verify Scoring Weights (Spec Compliance)
```bash
curl http://localhost:8000/api/healthz/weights | jq
```

**Expected Output**:
```json
{
  "weights": {
    "PolicyMomentum": 1.0,
    "FlowPressure": 1.0,
    "BigMoneyConfirm": 1.0,
    "InsiderPoliticianConfirm": 0.8,
    "Attention": 0.5,
    "TechEdge": 0.4,
    "RiskFlags": -1.0,
    "CapexMomentum": 0.6
  },
  "half_life_days": 30.0
}
```

✅ **Verify**: HALF_LIFE_DAYS = 30.0 (not 7)

---

## 2. Ingest Pipeline

### Demo Mode
```bash
curl -X POST "http://localhost:8000/api/ingest/run?mode=demo" | jq
```

**Expected**: Returns counts of inserted signals

### Real Mode (with feeds configured)
```bash
# Set environment variables first
export POLICY_FEEDS="https://www.ferc.gov/news-events/rss.xml"
export POLICY_KEYWORDS="hvdc,transformer,transmission,grid,data center,liquid cooling"

curl -X POST "http://localhost:8000/api/ingest/run?mode=real" | jq
```

**Expected**: Returns policy_feeds and theme_mapper stats

---

## 3. Theme Scoring

### Get All Themes
```bash
curl "http://localhost:8000/api/radar/themes?days=30" | jq
```

**Expected**: Array of 3 themes with:
- AI Liquid Cooling
- Water Reuse
- HVDC Transformers

Each theme should have:
- `score` (0-10 range)
- `components` object with weight contributions
- `positives` array (3+ for alert firing)

✅ **Verify**: Scores are in 0-10 range, not 0-100

---

## 4. Alerts

### List Active Alerts
```bash
curl http://localhost:8000/api/alerts | jq
```

### Get Alert Thresholds
```bash
curl http://localhost:8000/api/alerts/thresholds | jq
```

**Expected**:
```json
{
  "score_threshold": 2.0,
  "min_positives": 3,
  "half_life_days": 30.0,
  "momentum_fade_threshold": 0.5
}
```

✅ **Verify**: score_threshold = 2.0 (not 80.0)

### Update Thresholds
```bash
curl -X POST http://localhost:8000/api/alerts/thresholds \
  -H "Content-Type: application/json" \
  -d '{"signal":"policy_approval","threshold":1.5}' | jq
```

### Manually Trigger Alert Check
```bash
curl -X POST http://localhost:8000/api/alerts/check | jq
```

**Expected**: Returns `{"alerts_fired": N, "themes": [...]}`

---

## 5. Assets & Where to Buy

### By Ticker (AU Broker Routing)
```bash
curl "http://localhost:8000/api/assets/by-ticker/ERII" | jq
```

**Expected**:
- `where_to_buy` array with AU-friendly brokers
- For NASDAQ ticker: Stake, Interactive Brokers
- `signals` array
- `themes` array

✅ **Verify**: Endpoint is `/api/assets/by-ticker/{ticker}` (not `/api/assets/{ticker}`)

### Test ASX Asset
```bash
curl "http://localhost:8000/api/assets/by-ticker/BHP" | jq
```

**Expected `where_to_buy`**:
- CommSec
- SelfWealth
- Interactive Brokers

---

## 6. Backtest Exports

### CSV Export
```bash
curl "http://localhost:8000/api/backtest/rows.csv?since_days=120" | head
```

**Expected**: CSV with header row:
```
date,theme_id,theme_name,score,rank,ticker,close,fwd_7d,fwd_30d,fwd_90d,signal_counts,positives
```

### Parquet Export (NEW)
```bash
curl -L "http://localhost:8000/api/backtest/rows.parquet?since_days=120" -o /tmp/rows.parquet
file /tmp/rows.parquet
```

**Expected**: 
```
/tmp/rows.parquet: Apache Parquet
```

✅ **Verify**: Parquet file is valid and smaller than CSV

### Backtest Summary
```bash
curl "http://localhost:8000/api/backtest/summary?since_days=120&group_by=theme" | jq
```

**Expected**:
```json
{
  "since_days": 120,
  "horizons": {
    "7": {"avg": X.XX, "stdev": Y.YY},
    "30": {...},
    "90": {...}
  },
  "group_by": "theme",
  "sample_size": N
}
```

---

## 7. Watchlist

### Get Watchlist
```bash
curl http://localhost:8000/api/watchlist | jq
```

### Add Ticker
```bash
curl -X POST http://localhost:8000/api/watchlist \
  -H "Content-Type: application/json" \
  -d '{"ticker":"TSLA"}' | jq
```

### Remove Ticker
```bash
curl -X DELETE http://localhost:8000/api/watchlist/TSLA | jq
```

---

## 8. Frontend Verification

1. Open http://localhost:5173
2. Click "Run Ingest (Demo)"
3. Verify 3 themes appear with scores
4. Navigate to `/themes` - verify heatmap
5. Navigate to `/asset?ticker=ERII` - verify "Where to Buy" buttons
6. Navigate to `/alerts` - verify alerts list

---

## 9. Regression Checks

### CORS Policy (Production)
With `ENV=production`, verify CORS rejects unknown origins:

```bash
curl -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS http://localhost:8000/api/health -i
```

**Expected**: No `Access-Control-Allow-Origin: *` (should only allow FRONTEND_PUBLIC_URL)

### Signal Checksums (Idempotency)
```bash
# Run ingest twice
curl -X POST "http://localhost:8000/api/ingest/run?mode=demo"
curl -X POST "http://localhost:8000/api/ingest/run?mode=demo"
```

**Expected**: Second run shows `inserted: 0` (all signals already exist)

### Theme Scoring Caching
```bash
# First call
time curl "http://localhost:8000/api/radar/themes?days=30" > /dev/null

# Second call (should be cached, < 10ms)
time curl "http://localhost:8000/api/radar/themes?days=30" > /dev/null
```

✅ **Verify**: Second call is significantly faster (60s cache)

---

## Quick Diagnostic Commands

### View Backend Logs
```bash
make be
```

### View Frontend Logs
```bash
make fe
```

### Run Backend Tests
```bash
make test
```

### View MongoDB Data
Open http://localhost:8081 (mongo-express)
- Username: `admin`
- Password: `pass`

---

## ✅ Success Criteria

All of the following should be true:

- [ ] Health check returns `{"status":"ok"}`
- [ ] Weights show HALF_LIFE_DAYS = 30.0
- [ ] Alert threshold = 2.0 (not 80.0)
- [ ] All 3 canonical themes present after seed
- [ ] Demo ingest creates signals
- [ ] Assets endpoint is `/by-ticker/{ticker}`
- [ ] AU broker routing works (Stake for NASDAQ, CommSec for ASX)
- [ ] Parquet export returns valid Parquet file
- [ ] CSV and Parquet have matching schemas
- [ ] Alert thresholds can be GET and POST
- [ ] Idempotency: re-running ingest inserts 0 new items
- [ ] CORS respects FRONTEND_PUBLIC_URL
- [ ] All tests pass: `make test`

---

## Troubleshooting

### If containers won't start:
```bash
make clean
make up
```

### If MongoDB is empty:
```bash
make seed
make ingest-demo
```

### If tests fail:
```bash
make be  # Check for Python errors
docker-compose logs mongo  # Check MongoDB logs
```

### If frontend can't reach backend:
Check `VITE_API_URL` in `.env`:
```bash
VITE_API_URL=http://localhost:8000
```
