# Opportunity Radar - Data Sources Guide

## ⚠️ IMPORTANT: Data Accuracy Commitment

**As of December 2025, this project uses ONLY REAL data from verified sources. No estimation, synthetic, or AI-generated data is used as a substitute for real market data.**

---

## 🎯 Current Implementation Status

### ✅ **Real Data Sources (Verified Working)**

| Source | Edge Function | Data Origin | Status |
|--------|---------------|-------------|--------|
| SEC 13F Holdings | `ingest-sec-13f-edgar` | SEC EDGAR API | ✅ REAL |
| SEC Form 4 | `ingest-form4` | SEC EDGAR Atom Feed | ✅ REAL |
| TwelveData Prices | `ingest-prices-twelvedata` | TwelveData API | ✅ REAL |
| Policy Feeds | `ingest-policy-feeds` | Government RSS | ✅ REAL |
| News RSS | `ingest-news-rss` | RSS Feeds | ✅ REAL |
| Short Interest | `ingest-short-interest` | FINRA CDN | ✅ REAL |
| Congressional Trades | `ingest-congressional-trades` | House Stock Watcher | ✅ REAL |
| FRED Economics | `ingest-fred-economics` | FRED API | ✅ REAL |
| StockTwits | `ingest-stocktwits` | StockTwits API | ✅ REAL |
| AI Research Reports | `generate-ai-research` | Lovable AI | ✅ REAL (AI-Generated Analysis) |
| Supply Chain | `ingest-supply-chain` | ISM RSS Feeds | ✅ REAL |

### 🔄 **Data Sources Requiring External APIs (May Return No Data)**

These functions only insert data when real data is available. If no real data is found, nothing is inserted.

| Source | Edge Function | Data Origin | Behavior |
|--------|---------------|-------------|----------|
| Reddit Sentiment | `ingest-reddit-sentiment` | Reddit OAuth API | ✅ Real data only, no fallback |
| Forex Sentiment | `ingest-forex-sentiment` | Myfxbook/OANDA via Firecrawl | ✅ Real data only, no fallback |
| ETF Flows | `ingest-etf-flows` | ETF.com via Firecrawl | ✅ Real data only, no fallback |
| Crypto On-chain | `ingest-crypto-onchain` | Blockchain.com/CoinGecko APIs | ✅ Real data only, no fallback |
| Options Flow | `ingest-options-flow` | Barchart/CBOE via Firecrawl | ✅ Real data only, no fallback |
| Dark Pool | `ingest-dark-pool` | FINRA CDN | ✅ Real data only, no fallback |
| Dark Pool (FINRA) | `ingest-finra-darkpool` | FINRA Scraping | ✅ Real data only, no fallback |
| COT Reports | `ingest-cot-reports` | CFTC Socrata API | ✅ Real data only, no fallback |
| Job Postings | `ingest-job-postings` | Adzuna API | ✅ Real data only, no fallback |
| Patents | `ingest-patents` | USPTO via Firecrawl | ✅ Real data only, no fallback |

### ❌ **Removed/Disabled Features**

The following data sources have been removed because no reliable free API exists:

| Feature | Reason |
|---------|--------|
| Estimated forex sentiment | Replaced with real Myfxbook/OANDA scraping |
| Synthetic ETF flows | Replaced with real ETF.com scraping |
| Generated patent data | Replaced with real USPTO scraping |
| Fake on-chain metrics | Replaced with real Blockchain.com API |
| Estimated options flow | Replaced with real Barchart scraping |
| AI-fallback sentiment | Removed all estimation fallbacks |

---

## 📊 Data Source Details

### Price Data: TwelveData ✅ REAL

**Source:** TwelveData API (Paid)  
**Coverage:** 27,000+ assets (Stocks, ETFs, Forex, Crypto)  
**Status:** Fully operational with rate limiting

**Tiered Refresh Strategy:**
| Tier | Assets | Refresh Rate | Credits/Day |
|------|--------|--------------|-------------|
| Hot | Top 50 active | Every 5 min | ~290 |
| Active | 500 watchlist | Every 30 min | ~480 |
| Standard | 26,000+ others | Every 24 hrs | ~30 |

**Secret Required:** `TWELVEDATA_API_KEY`

---

### SEC 13F Holdings ✅ REAL

**Source:** SEC EDGAR API (Free)  
**What it tracks:**
- Institutional investor quarterly filings (>$100M AUM)
- New positions = buying conviction
- Position changes (increase/decrease/exit)

**Signal Types:**
- `bigmoney_hold_new` - New position
- `bigmoney_hold_increase` - Position increased >5%
- `bigmoney_hold_decrease` - Position decreased >5%

---

### SEC Form 4 Insider Transactions ✅ REAL

**Source:** SEC EDGAR Atom Feed (Free)  
**What it tracks:**
- Insider transactions (executives, directors, >10% owners)
- Must file within 2 days of trade

**Signal Types:**
- `insider_buy` (direction=up)
- `insider_sell` (direction=down)

---

### Dark Pool Activity (FINRA) ✅ REAL

**Source:** FINRA ATS/OTC Transparency CDN (Free)  
**What it tracks:**
- Dark pool volume
- Dark pool percentage of total volume
- Trading venue breakdown

**Note:** Data is delayed (T+2 weeks) per FINRA regulations.

---

### Congressional Trades ✅ REAL

**Source:** House Stock Watcher / Public Disclosures (Free)  
**What it tracks:**
- Representative trading activity
- Trade before policy votes
- Bipartisan convergence

---

### Reddit Sentiment ✅ REAL (When Available)

**Source:** Reddit OAuth API  
**Subreddits Monitored:**
- r/wallstreetbets
- r/stocks
- r/investing
- r/SecurityAnalysis

**Behavior:** Only inserts real Reddit data. If API fails, returns empty result - NO estimation.

**Secrets Required:**
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USERNAME`
- `REDDIT_PASSWORD`

---

### Job Postings ✅ REAL (When Available)

**Source:** Adzuna API  
**What it tracks:**
- Hiring velocity by company
- Role types (engineering, sales, leadership)
- Growth indicator

**Behavior:** Only inserts real Adzuna data. If API key missing, returns empty result - NO estimation.

**Secrets Required:**
- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`

---

### FRED Economic Data ✅ REAL

**Source:** Federal Reserve Economic Data API (Free)  
**Indicators Tracked:**
- GDP growth
- Inflation rates
- Employment data
- Interest rates

**Secret Required:** `FRED_API_KEY`

---

### Crypto On-chain ✅ REAL (When Available)

**Sources:**
- Blockchain.com API (BTC data)
- CoinGecko API (Other crypto)

**What it tracks:**
- Active addresses
- Transaction counts
- Hash rate
- Market data

**Behavior:** Only inserts real on-chain data. If APIs fail, returns empty result - NO estimation.

---

### Options Flow ✅ REAL (When Available)

**Sources:**
- Barchart via Firecrawl
- CBOE via Firecrawl

**What it tracks:**
- Unusual call/put activity
- Sweep orders
- Open interest changes

**Behavior:** Only inserts real options data. If scraping fails, returns empty result - NO estimation.

**Secret Required:** `FIRECRAWL_API_KEY`

---

### Forex Sentiment ✅ REAL (When Available)

**Sources:**
- Myfxbook via Firecrawl
- OANDA Sentiment RSS

**What it tracks:**
- Retail positioning
- Long/short ratios
- Sentiment scores

**Behavior:** Only inserts real sentiment data. If scraping fails, returns empty result - NO estimation.

**Secret Required:** `FIRECRAWL_API_KEY`

---

### Patent Filings ✅ REAL (When Available)

**Source:** USPTO via Firecrawl  
**What it tracks:**
- Company patent filings
- Technology categories
- Filing dates

**Behavior:** Only inserts real USPTO data. If scraping fails, returns empty result - NO estimation.

**Secret Required:** `FIRECRAWL_API_KEY`

---

## 💰 Data Source Costs

### Free Data Sources
| Source | Cost | Notes |
|--------|------|-------|
| SEC EDGAR | Free | Public data |
| FINRA Dark Pool | Free | Public data, delayed |
| Congressional Trades | Free | Public disclosure |
| FRED | Free | Requires API key |
| Blockchain.com | Free | BTC data |
| CoinGecko | Free | Rate limited |

### Paid Data Sources
| Source | Cost | Notes |
|--------|------|-------|
| TwelveData | $29/mo | Pro tier, 27K assets |
| Firecrawl | $20/mo | Web scraping |
| Adzuna | Free tier | Job postings |

### Requires API Keys (Free Tier Available)
| Source | Signup | Notes |
|--------|--------|-------|
| Reddit API | reddit.com/prefs/apps | OAuth required |
| Adzuna | developer.adzuna.com | Free tier |
| FRED | fred.stlouisfed.org/docs/api | Free |

---

## 🔧 No-Data Handling

All ingestion functions follow this pattern:

```typescript
// If real data is available:
return { success: true, inserted: count, source: "REAL_SOURCE_NAME" };

// If no real data is available:
return { 
  success: true, 
  inserted: 0, 
  message: "No real data found - no fake data inserted",
  version: "v3_no_estimation"
};
```

**There are NO estimation fallbacks. If real data is unavailable, the function returns 0 records.**

---

## 📊 Data Quality Monitoring

### Automated Checks
- **Staleness alerts**: Data older than expected
- **Source verification**: All records tagged with actual source
- **No estimation tracking**: Fallback usage eliminated

### Health Dashboard
- `/ingestion-health` - Function status
- `/api-data-staleness` - Data freshness
- `watchdog-ingestion-health` - Continuous monitoring

---

## 🚀 Required Secrets

For full functionality, configure these secrets in your backend:

| Secret | Required For |
|--------|--------------|
| `TWELVEDATA_API_KEY` | Price data |
| `FIRECRAWL_API_KEY` | Web scraping (patents, options, forex) |
| `REDDIT_CLIENT_ID` | Reddit sentiment |
| `REDDIT_CLIENT_SECRET` | Reddit sentiment |
| `REDDIT_USERNAME` | Reddit sentiment |
| `REDDIT_PASSWORD` | Reddit sentiment |
| `ADZUNA_APP_ID` | Job postings |
| `ADZUNA_APP_KEY` | Job postings |
| `FRED_API_KEY` | Economic data |
| `SLACK_WEBHOOK_URL` | Alerts (optional) |
