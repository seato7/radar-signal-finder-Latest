# 🚀 Deployment Guide - Opportunity Radar

## Prerequisites
- [x] Backend running locally on Paperspace
- [x] Frontend built and tested
- [ ] Production domain purchased
- [ ] Stripe account created
- [ ] Data source URLs collected

---

## Step 1: Backend Deployment (Paperspace)

### Option A: Keep on Paperspace + Add Nginx Reverse Proxy

```bash
# SSH into your Paperspace machine
ssh paperspace@your-paperspace-ip

# Install nginx
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/opportunity-radar

# Add this configuration:
```

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/opportunity-radar /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d api.your-domain.com

# Update backend/.env
cd ~/radar-signal-finder
nano backend/.env
```

Add to backend/.env:
```bash
FRONTEND_PUBLIC_URL=https://your-frontend-domain.com
JWT_SECRET_KEY=$(openssl rand -hex 32)  # Generate secure secret
```

```bash
# Restart services
docker-compose down
docker-compose up -d --build
```

### Option B: Deploy to Railway/Render (Easier)

#### Railway:
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub repo
4. Add environment variables from `backend/.env.production.example`
5. Deploy!

#### Render:
1. Go to [render.com](https://render.com)
2. New → Web Service → Connect GitHub repo
3. Build Command: `docker build -f backend/Dockerfile .`
4. Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables
6. Deploy!

---

## Step 2: Configure Stripe

```bash
# 1. Create Stripe account at https://stripe.com

# 2. Get API keys from https://dashboard.stripe.com/apikeys

# 3. Create products in Stripe Dashboard:
#    - Product: "Opportunity Radar Lite" - $9.99/month
#    - Product: "Opportunity Radar Pro" - $49/month

# 4. Note the Price IDs

# 5. Set up webhook:
#    - URL: https://api.your-domain.com/api/payments/webhook
#    - Events: customer.subscription.created, customer.subscription.deleted, invoice.payment_succeeded

# 6. Add to backend/.env:
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_LITE_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
```

---

## Step 3: Configure Data Sources

### SEC Filings (Free)
```bash
POLICY_FEEDS=https://www.sec.gov/news/pressreleases.rss,https://www.federalreserve.gov/feeds/press_all.xml
```

### Price Data
Options:
1. **Alpha Vantage** (Free tier: 5 calls/min)
   - Sign up: https://www.alphavantage.co/support/#api-key
   - Export: https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=AAPL&apikey=YOUR_KEY&datatype=csv

2. **Yahoo Finance** (via yfinance)
   - No API key needed
   - Create Python script to export CSVs and upload to S3/your server

3. **Polygon.io** ($29/month starter)
   - Professional data
   - Real-time updates

```bash
# Add to backend/.env
PRICE_CSV_URLS=https://your-server.com/prices/AAPL.csv,https://your-server.com/prices/MSFT.csv
```

### OpenFIGI (Free for symbol mapping)
```bash
# Sign up: https://www.openfigi.com/api
OPENFIGI_API_KEY=YOUR_KEY
```

---

## Step 4: Frontend Deployment

### Deploy to Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Update .env.production
echo "VITE_API_URL=https://api.your-domain.com" > .env.production

# Deploy
vercel --prod
```

### Deploy to Netlify
```bash
# Build
npm run build

# Deploy via Netlify CLI or web interface
# Environment variables: VITE_API_URL=https://api.your-domain.com
```

---

## Step 5: DNS Configuration

Point your domains to:
- `app.your-domain.com` → Vercel/Netlify
- `api.your-domain.com` → Paperspace IP (if using Option A) or Railway/Render (if using Option B)

---

## Step 6: Initialize Database

```bash
# SSH into backend server
ssh paperspace@your-ip

# Seed themes
docker-compose exec backend python -m backend.scripts.seed_themes

# Run initial data ingest
curl -X POST "https://api.your-domain.com/api/ingest/run?mode=demo"
```

---

## Step 7: Create Admin User

```bash
# Register first user via frontend

# SSH to backend
docker-compose exec backend python

# In Python shell:
from backend.db import get_db
import asyncio

async def make_admin():
    db = await get_db()
    result = await db.users.update_one(
        {"email": "your-email@example.com"},
        {"$set": {"role": "admin"}}
    )
    print(f"Updated {result.modified_count} user")

asyncio.run(make_admin())
exit()
```

---

## Step 8: Test Everything

### Checklist:
- [ ] Can register new account
- [ ] Can login
- [ ] Dashboard loads with data
- [ ] Can create bot
- [ ] Can subscribe to Lite plan
- [ ] Stripe webhook working (check Stripe dashboard)
- [ ] Admin dashboard accessible
- [ ] Alerts generating

---

## Step 9: Production Monitoring

### Add monitoring:
```bash
# Option 1: Sentry (errors)
npm install @sentry/react

# Option 2: LogRocket (session replay)
npm install logrocket

# Option 3: Datadog (infrastructure)
```

### Health checks:
- API: https://api.your-domain.com/api/healthz
- Metrics: https://api.your-domain.com/api/healthz/metrics

---

## Troubleshooting

### Backend not accessible
```bash
# Check if containers running
docker ps

# Check logs
docker-compose logs backend

# Test locally
curl http://localhost:8000/api/health
```

### CORS errors
```bash
# Update backend/main.py CORS settings
# Make sure FRONTEND_PUBLIC_URL matches your frontend domain
```

### Stripe webhook failing
```bash
# Test webhook locally with Stripe CLI:
stripe listen --forward-to localhost:8000/api/payments/webhook
```

### No data showing
```bash
# Check if ETL ran
curl https://api.your-domain.com/api/healthz/metrics

# Manual trigger
curl -X POST "https://api.your-domain.com/api/ingest/run?mode=demo"
```

---

## Next Steps After Launch

1. Set up daily ETL cron job
2. Configure email alerts (SendGrid/Mailgun)
3. Add analytics (PostHog/Mixpanel)
4. Create legal pages (Privacy Policy, Terms)
5. Set up customer support (Intercom/Crisp)
6. Add monitoring alerts (PagerDuty/Opsgenie)

---

## Quick Commands Reference

```bash
# Restart backend
docker-compose restart backend

# View logs
docker-compose logs -f backend

# Rebuild
docker-compose up -d --build

# Check database
docker-compose exec mongo mongosh opportunity_radar

# Generate JWT secret
openssl rand -hex 32
```
