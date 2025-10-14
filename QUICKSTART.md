# Opportunity Radar - Quick Start Guide

## 🎯 What This Does

Opportunity Radar is a financial intelligence platform that:
- Scores market opportunities using 8 weighted components
- Applies exponential decay to prioritize recent signals (30-day half-life)
- Tracks 3 canonical themes: AI Liquid Cooling, Water Reuse, HVDC Transformers
- Provides idempotent ETL pipelines with full citation tracking

## 🚀 Launch in 3 Commands

```bash
# 1. Start all services (MongoDB, Backend, Frontend, Mongo Express)
make up

# 2. Seed the 3 canonical themes
make seed

# 3. Run demo ingest to generate signals
make ingest-demo
```

**Access Points:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Mongo Express: http://localhost:8081

## 📊 Verify It's Working

### Check Health & Weights

```bash
curl http://localhost:8000/api/health
# Expected: {"status":"ok","service":"opportunity-radar"}

curl http://localhost:8000/api/healthz/weights
# Expected: Component weights matching spec
```

**Spec-Compliant Weights:**
```json
{
  "PolicyMomentum": 1.0,
  "FlowPressure": 1.0,
  "BigMoneyConfirm": 1.0,
  "InsiderPoliticianConfirm": 0.8,
  "Attention": 0.5,
  "TechEdge": 0.4,
  "RiskFlags": -1.0,
  "CapexMomentum": 0.6
}
```

### View Themes with Scores

```bash
curl "http://localhost:8000/api/radar/themes?days=45" | jq
```

**Expected Output:**
```json
[
  {
    "id": "theme-ai-liquid-cooling",
    "name": "AI Liquid Cooling",
    "score": 73.2,
    "components": {
      "PolicyMomentum": 5.4,
      "FlowPressure": 8.1,
      "BigMoneyConfirm": 6.7,
      ...
    },
    "as_of": "2025-10-14T...",
    "weights": {...}
  },
  ...
]
```

## 🎨 Frontend Demo Loop

1. Navigate to http://localhost:5173
2. Click **"Run Ingest (Demo)"** button on Home page
3. See 3 themes populate with scores
4. Click **Radar** to explore scored opportunities
5. Click **Themes** to see component breakdowns

## 🧪 Run Tests

```bash
# Run all backend tests
make test

# Expected output:
# ==================== 6 passed in 2.43s ====================
```

**Tests cover:**
- ✅ Health endpoint returns OK
- ✅ Weights endpoint returns spec values
- ✅ Decay function ~0.5 at 30-day half-life
- ✅ Watchlist CRUD operations
- ✅ Component weights match spec exactly

## 🔧 Makefile Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop services |
| `make seed` | Seed canonical themes |
| `make ingest-demo` | Run demo ingest |
| `make be` | View backend logs |
| `make fe` | View frontend logs |
| `make test` | Run backend tests |
| `make clean` | Stop and remove all data |

## 📝 Configuration

### Backend Environment

Create `backend/.env` from template:

```bash
cp backend/.env.example backend/.env
```

**Key Variables:**
- `MONGO_URL` - MongoDB connection (default: mongodb://mongo:27017)
- `HALF_LIFE_DAYS` - Signal decay half-life (default: 30.0)
- `ALERT_SCORE_THRESHOLD` - Alert firing threshold (default: 80.0)
- `FRONTEND_PUBLIC_URL` - Frontend URL for CORS (required)

## 🎯 Canonical Themes

The system seeds 3 production themes:

### 1. AI Liquid Cooling
**ID**: `theme-ai-liquid-cooling`  
**Keywords**: liquid cooling, data center, datacenter, thermal

### 2. Water Reuse
**ID**: `theme-water-reuse`  
**Keywords**: desal, reverse osmosis, water reuse, pipeline

### 3. HVDC Transformers
**ID**: `theme-hvdc-transformers`  
**Keywords**: hvdc, transformer, transmission, interconnector, grid

## 📊 Data Models

### Signal
```python
{
  "signal_type": "policy_keyword",
  "theme_id": "theme-ai-liquid-cooling",
  "magnitude": 1.2,
  "direction": "up",
  "observed_at": datetime,
  "oa_citation": {
    "source": "SEC Filing",
    "url": "https://...",
    "timestamp": "2025-10-14T..."
  },
  "checksum": "sha256...",  # Idempotency key
  "raw": {...}
}
```

### Theme Score Calculation

```python
score = sum(component_value * weight * decay(days_ago))

# Where:
# - component_value: normalized 0-100
# - weight: from WEIGHTS dict
# - decay: exp(-ln(2) * days_ago / 30)
```

## 🐛 Troubleshooting

### Services won't start
```bash
make down
make clean
make up
```

### Frontend can't connect to backend
Check `FRONTEND_PUBLIC_URL` is set in `backend/.env`:
```
FRONTEND_PUBLIC_URL=http://localhost:5173
```

### No themes showing up
Run seed first:
```bash
make seed
make ingest-demo
```

### Tests failing
Ensure MongoDB is running:
```bash
docker-compose ps
# mongo should be "Up"
```

## 🔄 Development Workflow

```bash
# Start fresh
make clean
make up

# Seed themes
make seed

# Run demo ingest (via UI or curl)
make ingest-demo

# Make backend changes, tests auto-reload
make be  # watch logs

# Make frontend changes, HMR active
make fe  # watch logs

# Run tests after changes
make test
```

## 📚 Next Steps

1. **Add Real ETL**: Implement `backend/etl/policy_feeds.py` for real RSS/Atom ingestion
2. **Configure Alerts**: Set up Slack webhook for high-score notifications
3. **Backtest**: Ingest price data and run backtests
4. **Deploy**: Use docker-compose for production deployment

---

## 🎉 You're Ready!

The system is now fully spec-compliant with:
- ✅ HALF_LIFE_DAYS = 30.0
- ✅ Correct component weights
- ✅ Dark theme tokens
- ✅ Strict CORS
- ✅ Idempotent ETL with checksums
- ✅ Full citation tracking

Access the UI at http://localhost:5173 and start exploring! 🚀
