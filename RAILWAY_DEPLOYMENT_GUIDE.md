# Railway Deployment Guide for Opportunity Radar Backend

## Overview
This guide deploys your Python FastAPI backend to Railway, which will handle all the heavy data ingestion that edge functions cannot do due to timeout limits.

## Prerequisites
- Railway account (free tier available): https://railway.app
- GitHub repository connected to your project

---

## Step 1: Create Railway Project

1. Go to https://railway.app and sign up/login
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. Railway will auto-detect the `backend/Dockerfile`

---

## Step 2: Add MongoDB Database

1. In your Railway project, click **"+ New"** → **"Database"** → **"MongoDB"**
2. Railway will provision a MongoDB instance
3. Copy the `MONGO_URL` from the MongoDB service's **Variables** tab

---

## Step 3: Configure Environment Variables

In your Railway backend service, add these environment variables:

```env
# Database (from Railway MongoDB)
MONGO_URL=<paste from Railway MongoDB service>
DB_NAME=opportunity_radar

# Security (generate secure random strings)
JWT_SECRET_KEY=<generate with: openssl rand -base64 32>
BROKER_ENCRYPTION_KEY=<generate with: openssl rand -base64 32>

# Frontend URL (your Lovable app URL)
FRONTEND_PUBLIC_URL=https://your-app.lovable.app

# Admin credentials
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD=<secure password>

# Data Sources (optional - add as needed)
SEC_USER_AGENT=Opportunity Radar your@email.com
ALPHA_VANTAGE_API_KEY=<if you have one>
```

---

## Step 4: Configure Build Settings

In Railway service settings:
- **Root Directory**: `backend`
- **Builder**: Dockerfile
- **Start Command**: (leave empty, Dockerfile handles it)

---

## Step 5: Deploy

1. Click **"Deploy"** in Railway
2. Wait for build to complete (~2-3 minutes)
3. Railway will provide a public URL like `https://your-app.up.railway.app`

---

## Step 6: Update Lovable Frontend

Once deployed, you need to update your frontend to use the Railway backend URL.

### Option A: Use Environment Variable (Recommended)
Add a secret in Lovable Cloud:
- Name: `VITE_BACKEND_URL`
- Value: `https://your-app.up.railway.app`

### Option B: Direct Update
Update `src/lib/api.ts` to use your Railway URL.

---

## Step 7: Test the Deployment

```bash
# Test health endpoint
curl https://your-app.up.railway.app/api/healthz

# Test with authentication
curl https://your-app.up.railway.app/api/radar
```

---

## Step 8: Set Up Cron Jobs (Data Ingestion)

Railway supports cron jobs. Create a new service for scheduled ingestion:

1. In Railway, click **"+ New"** → **"Cron Job"**
2. Set schedule: `0 */6 * * *` (every 6 hours)
3. Command: `curl -X POST https://your-app.up.railway.app/api/ingest/run?mode=real`

---

## Architecture After Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Lovable Frontend                         │
│                  (your-app.lovable.app)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Railway Backend                            │
│              (your-app.up.railway.app)                      │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  FastAPI    │  │  ETL Jobs   │  │  Cron Scheduler     │ │
│  │  (auth,     │  │  (SEC,      │  │  (every 6 hours)    │ │
│  │   radar,    │  │   prices,   │  │                     │ │
│  │   assets)   │  │   form4)    │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Railway MongoDB                         │   │
│  │           (persistent storage)                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼ (optional - AI features only)
┌─────────────────────────────────────────────────────────────┐
│                Supabase Edge Functions                      │
│            (chat-assistant, explain-theme)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Cost Estimate

Railway Hobby Plan ($5/month):
- 512MB RAM (enough for this backend)
- $5 included usage
- MongoDB included

---

## What This Fixes

✅ **No more 60-second timeouts** - Railway has no execution limits  
✅ **Persistent storage** - MongoDB keeps all your data  
✅ **Real cron jobs** - Scheduled ingestion that actually works  
✅ **Full Python ecosystem** - pandas, numpy, all libraries available  
✅ **Proper ETL** - Can process thousands of tickers  

---

## Next Steps After Deployment

1. Run initial data seed: `POST /api/ingest/run?mode=real`
2. Verify data: `GET /api/assets`
3. Test radar: `GET /api/radar`
4. Set up monitoring in Railway dashboard

---

## Troubleshooting

### Build fails
- Check `backend/requirements.txt` for invalid packages
- Ensure `backend/Dockerfile` is valid

### MongoDB connection fails
- Verify `MONGO_URL` is correct
- Check Railway MongoDB service is running

### CORS errors
- Ensure `FRONTEND_PUBLIC_URL` includes your Lovable app URL
- Can be comma-separated for multiple origins

### No data after ingestion
- Check Railway logs for ETL errors
- Verify API keys are set (Alpha Vantage, etc.)
