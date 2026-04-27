# Opportunity Radar

**Real-time investment opportunity detection powered by multi-signal analysis**

[![CI](https://github.com/your-org/opportunity-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/opportunity-radar/actions/workflows/ci.yml)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Opportunity Radar is a production-ready investment analysis platform that aggregates signals from policy changes, institutional holdings (13F), insider transactions (Form 4), ETF flows, dark pool activity, options flow, and social sentiment to identify high-conviction opportunities before they become obvious.

---

## 🎯 Key Features

- **Multi-Signal Analysis**: 20+ data sources including SEC filings, social sentiment, dark pool activity
- **AI-Powered Insights**: Lovable AI integration for natural language analysis and recommendations
- **Automated Trading Bots**: Connect to Alpaca, IBKR, Coinbase, Binance, Kraken
- **Real-time Alerts**: Slack integration with configurable thresholds
- **27,000+ Assets**: Stocks, ETFs, Forex, Crypto via TwelveData
- **Production-Ready**: Comprehensive logging, metrics, rate limiting, retry logic

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Lovable Cloud)                     │
│               React + Vite + TypeScript + Tailwind                │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────────┐
        │  Railway Backend  │   │  Supabase Edge        │
        │  (Python/FastAPI) │   │  Functions (90+)      │
        │                   │   │                       │
        │  • TwelveData     │   │  • AI Features        │
        │    Price Ingest   │   │  • Data Ingestion     │
        │  • Signal Storage │   │  • User APIs          │
        │  • Bot Engine     │   │  • Payments           │
        └───────────────────┘   └───────────────────────┘
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────────┐
        │     MongoDB       │   │  Supabase PostgreSQL  │
        │   (Railway)       │   │  (Primary Database)   │
        └───────────────────┘   └───────────────────────┘
```

### Hybrid Architecture

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React + Vite + Lovable Cloud | User interface |
| Price Ingestion | Railway Python + TwelveData | 27,000+ assets, tiered scheduling |
| Data Ingestion | 90+ Supabase Edge Functions | RSS, FINRA, Reddit, StockTwits, Firecrawl |
| AI Features | Lovable AI (Gemini 2.5 Flash) | Chat, analysis, risk assessment |
| Primary Database | Supabase PostgreSQL | Prices, signals, ingest logs |
| Signal Storage | MongoDB (Railway) | Signals, assets, themes, users |
| Cron Scheduling | pg_cron (45 jobs) + APScheduler | Automated ingestion |

---

## 📊 Data Sources

### Price Data
- **TwelveData API**: 27,000+ assets (stocks, ETFs, forex, crypto)
- **Tiered Refresh**: Hot (5min), Active (30min), Standard (24hr)
- **Credit Budget**: 55/minute rate limiting

### Signal Sources (Edge Functions)
| Category | Sources |
|----------|---------|
| **Institutional** | SEC 13F Holdings, Form 4 Insiders |
| **Political** | Congressional Trades |
| **Market Structure** | Dark Pool (FINRA), Options Flow, Short Interest |
| **Social Sentiment** | Reddit, StockTwits, News RSS |
| **Alternative** | Job Postings (Adzuna), Patents (USPTO), Search Trends |
| **Technical** | Advanced Technicals, Pattern Recognition |
| **Economic** | FRED Economics, COT Reports, Forex Sentiment |
| **Crypto** | On-chain Metrics |

### AI & Web Scraping
- **Lovable AI**: Natural language analysis, summaries, risk assessment
- **Firecrawl**: Web scraping for sources without APIs

---

## 🚀 Quick Start

### Prerequisites
- Lovable Cloud account (or Supabase + Railway)
- TwelveData API key (free tier: 800 credits/day)

### 1. Clone & Configure

```bash
git clone https://github.com/your-org/opportunity-radar.git
cd opportunity-radar
```

### 2. Set Environment Variables

**Supabase Secrets** (via Lovable Cloud):
- `TWELVEDATA_API_KEY` - Price data
- `FIRECRAWL_API_KEY` - Web scraping
- `SLACK_WEBHOOK_URL` - Alerts (optional)
- `STRIPE_SECRET_KEY` - Payments (optional)

**Railway Environment**:
- `SUPABASE_URL` - Database connection
- `SUPABASE_SERVICE_ROLE_KEY` - Service access
- `MONGO_URL` - MongoDB connection
- `TWELVEDATA_API_KEY` - Price data

### 3. Deploy

Frontend and Edge Functions deploy automatically via Lovable Cloud.

For Railway backend:
```bash
cd backend
railway up
```

### 4. Seed Data

```bash
# Seed canonical themes
railway run python backend/scripts/seed_themes.py

# Trigger initial price ingestion
curl -X POST https://your-railway-url/api/ingest/prices/hot
```

---

## 📱 Access Points

| Service | URL |
|---------|-----|
| Frontend | `https://your-project.lovable.app` |
| Backend API | `https://your-railway-app.up.railway.app` |
| API Docs | `https://your-railway-app.up.railway.app/docs` |
| Edge Functions | `https://your-project.supabase.co/functions/v1/` |

---

## 💳 Plan Matrix

Single source of truth for what each subscription tier sees and does. The
canonical limits live in `src/lib/planLimits.ts`; gating is enforced
server-side via the SECURITY DEFINER RPCs `get_assets_for_user`,
`get_signals_for_user`, `get_themes_for_user`, and
`get_total_signal_return`.

| Feature | Free | Starter ($9.99/mo) | Pro ($34.99/mo) | Premium ($89.99/mo) | Enterprise (Contact) |
|---------|------|--------------------|------------------|--------------------|--------------------|
| AI messages / day | 1 | 5 | 20 | Unlimited | Unlimited |
| Active signals | Teaser only | 1 | 3 | Unlimited | Unlimited |
| Watchlist slots | 1 | 3 | 10 | Unlimited | Unlimited |
| Asset Radar | 3 demo tickers | Stocks | Stocks + ETFs + Forex | All classes | All classes |
| Themes | 1 demo (read-only) | 1 | 3 | Unlimited | Unlimited |
| Alerts | 0 | 1 | 5 | Unlimited | Unlimited |
| Asset scores | Hidden | Hidden | Hidden | Visible | Visible |
| Trading Bots | Coming Soon | Coming Soon | Coming Soon | Coming Soon | Coming Soon |

### Demo Configuration

The Free tier shows a fixed-but-limited preview of every page so visitors can
evaluate the product before paying. Demo configuration is hard-coded in the
RPCs and `planLimits.ts`:

- **Demo tickers**: `F`, `VTI`, `EUR/USD` (the only assets a Free user can
  see on Asset Radar / Asset Detail).
- **Demo theme**: a single theme flagged via `themes.is_demo = true`. Picked
  by migration `20260427000001_plan-gating-rpcs.sql` from the first theme
  whose name matches `dividend`, `blue chip`, or `consumer staples`. Check
  the migration `RAISE NOTICE` output to confirm which theme was flagged.
- **Signals teaser**: Free users receive masked rows from
  `get_signals_for_user` (ticker `***`, prices nulled). The aggregate
  total return is exposed via `get_total_signal_return` so the marketing
  number renders even when individual signals are hidden.

### Trading Bots

The bots feature is disabled platform-wide. `manage-bots /create` returns
HTTP 503 with `error: "feature_coming_soon"` for every plan, including
admin. The frontend renders a Coming Soon state on the Trading Bots page
and hides the Create Bot button.

---

## 💰 Cost Breakdown

| Service | Monthly Cost |
|---------|-------------|
| TwelveData (Pro) | ~$29 |
| Railway (Backend) | ~$5 |
| Lovable Cloud | ~$20 |
| Firecrawl | ~$20 |
| Redis (Upstash) | ~$5 |
| **Total** | **~$80-90** |

Free tier options available for development.

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md) | Complete system architecture |
| [QUICKSTART.md](QUICKSTART.md) | Local development setup |
| [AI_FEATURES_GUIDE.md](AI_FEATURES_GUIDE.md) | AI features implementation |
| [BROKER_SETUP.md](BROKER_SETUP.md) | Multi-broker integration |
| [PAYMENT_GUIDE.md](PAYMENT_GUIDE.md) | Stripe subscription setup |
| [AUTH_SETUP.md](AUTH_SETUP.md) | Authentication configuration |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment |
| [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md) | Data ingestion details |
| [docs/MONITORING.md](docs/MONITORING.md) | Monitoring & alerting |
| [docs/SECURITY.md](docs/SECURITY.md) | Security best practices |
| [docs/TESTING.md](docs/TESTING.md) | Testing guide |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history |

---

## 🧮 Scoring System

### Component Weights

| Component | Weight | Description |
|-----------|--------|-------------|
| PolicyMomentum | 1.0 | Regulatory & policy signals |
| FlowPressure | 1.0 | ETF flows & dark pool activity |
| BigMoneyConfirm | 1.0 | 13F filings & institutional activity |
| InsiderPoliticianConfirm | 0.8 | Form 4 insider & congressional trades |
| Attention | 0.5 | Social & news mentions |
| TechEdge | 0.4 | Technical/tech edge signals |
| RiskFlags | -1.0 | Negative risk signals |
| CapexMomentum | 0.6 | Capital expenditure momentum |

### Exponential Decay

Signals decay with half-life = 30 days:
```
decay = exp(-ln(2) * days_ago / half_life)
```

---

## 🤖 Trading Bots

Supported brokers via Model 1 (User API Keys):
- **Alpaca** - US Stocks, Crypto (Paper + Live)
- **Interactive Brokers** - Global markets
- **Coinbase** - Cryptocurrency
- **Binance** - Cryptocurrency (Testnet available)
- **Kraken** - Cryptocurrency

See [BROKER_SETUP.md](BROKER_SETUP.md) for configuration.

---

## 🛠️ Technology Stack

### Backend
- FastAPI (Python 3.11) on Railway
- TwelveData for price data
- MongoDB + PostgreSQL (dual database)

### Frontend
- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Deployed on Lovable Cloud

### Infrastructure
- Supabase PostgreSQL + Edge Functions
- Railway for Python backend
- pg_cron for scheduled jobs
- Upstash Redis for caching

---

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Run specific test
pytest backend/tests/test_scoring.py -v
```

See [docs/TESTING.md](docs/TESTING.md) for complete testing guide.

---

## 📝 License

MIT

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

Built with ⚡ by Opportunity Radar team
