# Export & Local Development

This guide explains how to export your Opportunity Radar project from Lovable and run it locally.

## Exporting from Lovable

### Option 1: Download ZIP
1. In Lovable, click your project name in the top left
2. Select "Download ZIP"
3. Extract the ZIP file to your desired directory

### Option 2: Push to GitHub
1. Connect your GitHub account in Lovable Settings
2. Click the GitHub button in the top right
3. Follow the prompts to create or update a repository
4. Clone the repository locally:
   ```bash
   git clone https://github.com/your-username/opportunity-radar.git
   cd opportunity-radar
   ```

## Local Development Setup

### Prerequisites
- Docker and Docker Compose
- Make (optional, for convenience commands)
- Git (for Option 2 above)

### Quick Start

1. **Start all services:**
   ```bash
   make up
   # Or without Make:
   docker-compose up -d
   ```

2. **Seed demo data:**
   ```bash
   make seed
   # Or without Make:
   docker-compose exec backend python backend/scripts/seed_themes.py
   docker-compose exec backend python -m pytest backend/tests/ -k "demo"
   ```

3. **Access the application:**
   - Frontend: http://localhost:5173
   - API docs: http://localhost:8000/docs
   - MongoDB Express: http://localhost:8081

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Core
MONGO_URL=mongodb://mongo:27017
DB_NAME=opportunity_radar
FRONTEND_PUBLIC_URL=http://localhost:5173

# SEC (required for real data)
SEC_USER_AGENT="Opportunity Radar hello@youremail.com"
SEC_ACCEPT_LANGUAGE="en-US,en;q=0.9"

# Optional integrations
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
OPENFIGI_API_KEY=your-openfigi-key

# Data sources (comma-separated URLs)
POLICY_FEEDS=https://example.com/rss1,https://example.com/rss2
ETF_FLOWS_CSV_URLS=https://example.com/flows.csv
ETF_SECTOR_MAP_JSON='{"SPY":"broad","XLK":"tech"}'
CUSIP_MAP_CSV_URLS=https://example.com/cusip.csv
PRICE_CSV_URLS=https://example.com/prices.csv

# Alert tuning
ALERT_SCORE_THRESHOLD=2.0
HALF_LIFE_DAYS=30.0
TTL_DAYS=365

# Theme mapper (optional)
SEMANTIC_MAPPER=0
SEMANTIC_THRESHOLD=0.35
```

## Development Commands

```bash
# View logs
docker-compose logs -f

# Run tests
docker-compose exec backend pytest

# Stop services
docker-compose down

# Reset database
docker-compose down -v
docker-compose up -d
make seed
```

## Troubleshooting

### Port conflicts
If ports 5173, 8000, 27017, or 8081 are in use:
1. Edit `docker-compose.yml` to change port mappings
2. Update `FRONTEND_PUBLIC_URL` in `.env` if changing frontend port

### CORS issues
Ensure `FRONTEND_PUBLIC_URL` in backend `.env` matches your actual frontend URL (including port).

### Database connection errors
1. Verify MongoDB is running: `docker-compose ps`
2. Check logs: `docker-compose logs mongo`
3. Ensure MONGO_URL in `.env` is correct

### Frontend build errors
1. Clear node_modules: `rm -rf node_modules && npm install`
2. Check for TypeScript errors: `npm run type-check`
3. Rebuild: `docker-compose up --build frontend`

### Empty data after seed
1. Run seed script again: `make seed`
2. Check backend logs for ETL errors
3. Verify themes were created: Visit http://localhost:8000/docs and test `/api/themes`

## Next Steps

- Configure real data sources in `.env`
- Set up cron jobs for periodic ingestion (see DEPLOYMENT.md)
- Connect Slack webhook for alerts
- Review README.md for architecture details
