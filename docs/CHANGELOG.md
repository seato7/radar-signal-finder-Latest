# Changelog

All notable changes to Opportunity Radar are documented here.

---

## [2.0.0] - 2024-12 - Hybrid Architecture Migration

### 🚀 Major Changes
- **Migrated from Railway-only to Hybrid Architecture**
  - Railway Python backend for TwelveData price ingestion
  - Supabase Edge Functions for 90+ data ingestion functions
  - Supabase PostgreSQL as primary database
  
- **Replaced Alpha Vantage with TwelveData**
  - 27,000+ assets supported
  - Tiered refresh strategy (Hot/Active/Standard)
  - Credit-budgeted scheduling (55/min)

- **Added Firecrawl Integration**
  - Web scraping for data sources without APIs
  - Technical analysis extraction
  - News and sentiment scraping

### ✨ Features Added
- AI Chat Assistant (Lovable AI)
- Theme "Why Now?" summaries
- Signal explanations
- Risk assessment
- Daily digest generation
- PDF report export
- Trading bot framework
- Broker key management with encryption
- Key rotation with audit logs

### 📊 Data Sources Added
- Congressional trades
- Dark pool activity (FINRA)
- Options flow
- Short interest
- Job postings (Adzuna)
- Patent filings
- Search trends
- Supply chain signals
- Crypto on-chain metrics
- Forex sentiment/technicals

### 🔧 Infrastructure
- 45+ pg_cron scheduled jobs
- Watchdog monitoring system
- Slack alerting integration
- Circuit breaker pattern
- Rate limiting across APIs

---

## [1.5.0] - 2024-10 - SEC Data Deep Integration

### ✨ Features
- SEC 13F holdings ingestion with delta tracking
- Form 4 insider transaction parsing
- CUSIP to ticker mapping (OpenFIGI fallback)
- Policy feed RSS parsing
- ETF flows with sector aggregation

### 🔧 Improvements
- Idempotent ETL with checksums
- Citation tracking for all signals
- Configurable decay half-life
- Alert threshold tuning

---

## [1.0.0] - 2024-08 - Initial Release

### ✨ Features
- Multi-signal scoring engine
- Theme-based opportunity detection
- Watchlist management
- Basic alerting
- Demo and real ingest modes

### 📦 Stack
- FastAPI backend
- React + Vite frontend
- MongoDB database
- Docker Compose deployment

---

## Migration Notes

### From 1.x to 2.0
1. Database migrated from MongoDB to PostgreSQL
2. Price data source changed to TwelveData
3. Edge functions handle most ingestion
4. Railway backend focuses on price scheduling
5. Authentication moved to Supabase Auth

### Environment Variables Changed
- Removed: `ALPHA_VANTAGE_API_KEY`
- Added: `TWELVEDATA_API_KEY`, `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY`
- Changed: Database connection to Supabase

---

## Roadmap

### Planned
- [ ] Options Greeks analysis
- [ ] Earnings transcript sentiment
- [ ] Portfolio tracking
- [ ] Mobile app
- [ ] Advanced backtesting
- [ ] Multi-currency support

### Under Consideration
- Real-time streaming prices
- Social trading features
- Institutional-grade reporting
- API access for subscribers
