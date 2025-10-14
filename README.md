# Opportunity Radar

AI-powered financial intelligence platform with transparent scoring, exponential decay models, and AU-friendly trading recommendations.

## 🏗️ Architecture

```
opportunity-radar/
├── backend/           # FastAPI + Python 3.11
│   ├── routers/      # API endpoints
│   ├── etl/          # ETL modules (idempotent)
│   ├── models.py     # Pydantic models
│   ├── scoring.py    # Scoring engine
│   └── tests/        # Backend tests
├── src/              # React + Vite + TypeScript
│   ├── components/   # UI components
│   ├── pages/        # Application pages
│   ├── lib/          # API client
│   └── types/        # TypeScript types
└── docker-compose.yml
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Make (optional but recommended)

### 1. Start Services

```bash
make up
```

This starts:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Mongo Express**: http://localhost:8081

### 2. Seed Canonical Themes

```bash
make seed
```

Seeds the 3 canonical themes:
- AI Liquid Cooling
- Water Reuse  
- HVDC Transformers

### 3. Run Demo Ingest

```bash
make ingest-demo
```

Or click "Run Ingest (Demo)" in the UI at http://localhost:5173

### 4. View Results

Navigate to http://localhost:5173 and explore:
- **Home**: Run ingests and view system status
- **Radar**: See scored themes with components
- **Themes**: Explore theme details

## 🧪 Development

### Backend Commands

```bash
make be          # View backend logs
make test        # Run backend tests
```

### Frontend Commands

```bash
make fe          # View frontend logs
npm run dev      # Run frontend locally
```

### Stop Services

```bash
make down        # Stop containers
make clean       # Stop and remove volumes
```

## 📊 API Endpoints

### Health & Config
- `GET /api/health` - Service health check
- `GET /api/healthz/weights` - Scoring component weights

### Radar
- `GET /api/radar/themes?days=30` - List all themes with scores
- `GET /api/radar/theme/{id}?days=30` - Detailed theme view

### Ingest
- `POST /api/ingest/run?mode=demo|real` - Run ETL pipeline

### Alerts
- `GET /api/alerts` - List active alerts
- `GET /api/alerts/thresholds` - Get alert thresholds
- `POST /api/alerts/thresholds` - Update thresholds

### Watchlist
- `GET /api/watchlist` - Get watchlist
- `POST /api/watchlist` - Add ticker
- `DELETE /api/watchlist/{ticker}` - Remove ticker

### Assets
- `GET /api/assets/{ticker}` - Asset details + where to buy

### Backtest
- `GET /api/backtest/summary?since_days=120` - Backtest summary
- `GET /api/backtest/top_contributors` - Top performing assets
- `GET /api/backtest/rows.csv` - Export backtest data

## ⚙️ Configuration

### Backend (.env)

```bash
cp backend/.env.example backend/.env
```

Key variables:
- `MONGO_URL` - MongoDB connection string
- `ALERT_SCORE_THRESHOLD` - Alert firing threshold (default: 80.0)
- `HALF_LIFE_DAYS` - Signal decay half-life (default: 30.0)
- `SLACK_WEBHOOK` - Optional Slack notifications
- `OPENFIGI_API_KEY` - Optional OpenFIGI for CUSIP mapping

See `backend/.env.example` for all options.

## 🧮 Scoring System

### Components & Weights

| Component | Weight | Description |
|-----------|--------|-------------|
| PolicyMomentum | 1.0 | Regulatory & policy signals |
| FlowPressure | 1.0 | ETF flows & volume anomalies |
| BigMoneyConfirm | 1.0 | 13F filings & institutional activity |
| InsiderPoliticianConfirm | 0.8 | Form 4 insider & politician trades |
| Attention | 0.5 | Social & news mentions |
| TechEdge | 0.4 | Technical/tech edge signals |
| RiskFlags | -1.0 | Negative risk signals |
| CapexMomentum | 0.6 | Capital expenditure momentum |

### Exponential Decay

Signals decay with half-life = 30 days (configurable):

```
decay = exp(-ln(2) * days_ago / half_life)
```

At 30 days: ~50% weight
At 60 days: ~25% weight
At 90 days: ~12.5% weight

## 🔄 ETL Pipeline

### Idempotency

All ETL modules use deterministic checksums:

```python
checksum = sha256(json.dumps(data, sort_keys=True))
```

Re-running ETL jobs never creates duplicates.

### Citation Tracking

Every signal includes `oa_citation`:
- source name
- url (if available)
- timestamp

## 🧪 Testing

```bash
# Run all tests
make test

# Run specific test file
docker-compose exec backend pytest backend/tests/test_scoring.py -v
```

### Test Coverage
- Health endpoint
- Scoring decay function
- ETL idempotency
- Watchlist CRUD
- Backtest endpoints

## 🌏 Where to Buy (AU-Friendly)

Based on exchange/asset type:

- **US Stocks**: Stake, Interactive Brokers AU
- **ASX Stocks**: CommSec, SelfWealth
- **Crypto**: Binance AU, Kraken, KuCoin

## 📦 Production Deployment

### Build & Run

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables

Set production values:
- `FRONTEND_PUBLIC_URL` - Your domain
- `SLACK_WEBHOOK` - Alerts webhook
- `ALERT_SCORE_THRESHOLD` - Tune sensitivity

### CI/CD

GitHub Actions runs on push/PR:
- Backend tests (pytest)
- Frontend build verification

## 🛠️ Technology Stack

### Backend
- FastAPI (Python 3.11)
- Motor (async MongoDB)
- Pydantic v2 (validation)

### Frontend
- React 18
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui

### Infrastructure
- MongoDB 7
- Docker Compose
- GitHub Actions

## 📝 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

Built with ⚡ by Opportunity Radar team
