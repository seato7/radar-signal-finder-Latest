# Opportunity Radar - Data Sources Guide

## 🎯 Current Implementation Status

### ✅ **Phase 1: Core Foundation (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| SEC 13F Holdings | `ingest-sec-13f-edgar` | Every 6 hrs | ✅ Live |
| SEC Form 4 | `ingest-form4` | Every 6 hrs | ✅ Live |
| Policy Feeds | `ingest-policy-feeds` | Every hour | ✅ Live |
| ETF Flows | `ingest-etf-flows` | Every 15 min | ✅ Live |
| TwelveData Prices | Railway + `ingest-prices-twelvedata` | Tiered | ✅ Live |

### ✅ **Phase 2: Social Intelligence (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| Reddit Sentiment | `ingest-reddit-sentiment` | Every 2 hrs | ✅ Live |
| StockTwits | `ingest-stocktwits` | Every 2 hrs | ✅ Live |
| News RSS | `ingest-news-rss` | Every hour | ✅ Live |
| Breaking News | `ingest-breaking-news` | Every 5 min | ✅ Live |
| News Sentiment | `ingest-news-sentiment` | Every 3 hrs | ✅ Live |

### ✅ **Phase 3: Market Structure (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| Dark Pool (FINRA) | `ingest-finra-darkpool` | Hourly | ✅ Live |
| Options Flow | `ingest-options-flow` | Hourly | ✅ Live |
| Short Interest | `ingest-short-interest` | Daily | ✅ Live |

### ✅ **Phase 4: Political Intelligence (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| Congressional Trades | `ingest-congressional-trades` | Daily | ✅ Live |

### ✅ **Phase 5: Alternative Data (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| Job Postings (Adzuna) | `ingest-job-postings` | Daily | ✅ Live |
| Patent Filings | `ingest-patents` | Daily | ✅ Live |
| Search Trends | `ingest-search-trends` | Daily | ✅ Live |
| Supply Chain | `ingest-supply-chain` | Daily | ✅ Live |

### ✅ **Phase 6: Technical Analysis (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| Advanced Technicals | `ingest-advanced-technicals` | Every 6 hrs | ✅ Live |
| Pattern Recognition | `ingest-pattern-recognition` | Every 6 hrs | ✅ Live |
| Forex Technicals | `ingest-forex-technicals` | Every 4 hrs | ✅ Live |
| Forex Sentiment | `ingest-forex-sentiment` | Every 4 hrs | ✅ Live |

### ✅ **Phase 7: Economic Data (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| FRED Economics | `ingest-fred-economics` | Daily | ✅ Live |
| COT Reports (CFTC) | `ingest-cot-cftc` | Weekly | ✅ Live |
| Economic Calendar | `ingest-economic-calendar` | Daily | ✅ Live |
| Earnings | `ingest-earnings` | Daily | ✅ Live |

### ✅ **Phase 8: Crypto Data (COMPLETE)**

| Source | Edge Function | Schedule | Status |
|--------|---------------|----------|--------|
| Crypto On-chain | `ingest-crypto-onchain` | Every 4 hrs | ✅ Live |

### ✅ **AI-Enhanced Features (COMPLETE)**

| Feature | Edge Function | Status |
|---------|---------------|--------|
| AI Research Reports | `generate-ai-research` | ✅ Live |
| Smart Money Analysis | `ingest-smart-money` | ✅ Live |

---

## 📊 Data Source Details

### Price Data: TwelveData

**Coverage:** 27,000+ assets (Stocks, ETFs, Forex, Crypto)

**Tiered Refresh Strategy:**
| Tier | Assets | Refresh Rate | Credits/Day |
|------|--------|--------------|-------------|
| Hot | Top 50 active | Every 5 min | ~290 |
| Active | 500 watchlist | Every 30 min | ~480 |
| Standard | 26,000+ others | Every 24 hrs | ~30 |

**Rate Limiting:** 55 credits/minute budget

**Implementation:** `backend/services/price_scheduler.py` → Supabase PostgreSQL

---

### SEC 13F Holdings

**Source:** SEC EDGAR API  
**What it tracks:**
- Institutional investor quarterly filings (>$100M AUM)
- New positions = buying conviction
- Position changes (increase/decrease/exit)

**Signal Types:**
- `bigmoney_hold_new` - New position
- `bigmoney_hold_increase` - Position increased >5%
- `bigmoney_hold_decrease` - Position decreased >5%

**CUSIP Mapping:** Uses `cusip_mappings` table with OpenFIGI fallback

---

### SEC Form 4 Insider Transactions

**Source:** SEC EDGAR Atom Feed  
**What it tracks:**
- Insider transactions (executives, directors, >10% owners)
- Must file within 2 days of trade

**Signal Types:**
- `insider_buy` (direction=up)
- `insider_sell` (direction=down)

---

### Dark Pool Activity (FINRA)

**Source:** FINRA ATS/OTC Transparency Data  
**What it tracks:**
- Dark pool volume
- Dark pool percentage of total volume
- Price impact estimates

**Signal Interpretation:**
- High dark pool % + price up = institutional accumulation
- High dark pool % + price down = institutional distribution

---

### Congressional Trades

**Source:** House Stock Watcher / Public Disclosures  
**What it tracks:**
- Representative trading activity
- Trade before policy votes
- Bipartisan convergence

**Signal Value:**
- Multiple members buying same ticker = strong signal
- Committee oversight = potential insider info

---

### Reddit Sentiment

**Source:** Reddit API  
**Subreddits Monitored:**
- r/wallstreetbets (retail sentiment)
- r/stocks (general discussion)
- r/investing (long-term)
- r/SecurityAnalysis (professional)

**Metrics:**
- Mention count
- Sentiment score (-1 to +1)
- Award count = conviction
- Upvote velocity = trending

**Secrets Required:**
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USERNAME`
- `REDDIT_PASSWORD`

---

### Options Flow

**What it tracks:**
- Unusual call/put activity
- Sweep orders (aggressive buying)
- Open interest changes
- Implied volatility spikes

**Signal Interpretation:**
```
Large call sweep + Institutional 13F buying + Insider purchases
= HIGH CONVICTION short-term move
```

---

### Job Postings (Adzuna)

**Source:** Adzuna API  
**What it tracks:**
- Hiring velocity by company
- Role types (engineering, sales, leadership)
- Growth indicator

**Signal Value:**
- Engineering roles = product development
- Sales roles = revenue expansion
- Mass hiring = scaling operations

**Secrets Required:**
- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`

---

### FRED Economic Data

**Source:** Federal Reserve Economic Data API  
**Indicators Tracked:**
- GDP growth
- Inflation rates
- Employment data
- Interest rates

**Secret Required:** `FRED_API_KEY`

---

### Web Scraping (Firecrawl)

**Used For:** Sources without APIs
- Patent filings (USPTO)
- Breaking news
- Company pages

**Secret Required:** `FIRECRAWL_API_KEY`

---

## 💰 Data Source Costs

### Free Data Sources
| Source | Cost | Notes |
|--------|------|-------|
| SEC EDGAR | Free | Public data |
| FINRA Dark Pool | Free | Public data |
| Reddit API | Free | Rate limited |
| StockTwits | Free | 30 req/hr |
| Congressional Trades | Free | Public disclosure |
| USPTO Patents | Free | Public data |
| FRED | Free | Requires API key |

### Paid Data Sources
| Source | Cost | Notes |
|--------|------|-------|
| TwelveData | $29/mo | Pro tier, 27K assets |
| Firecrawl | $20/mo | 5,000 pages |
| Adzuna | Free tier | Job postings |

### Optional Premium Sources
| Source | Cost | Notes |
|--------|------|-------|
| Unusual Whales | $50-200/mo | Options flow |
| Fintel | $20-50/mo | Short interest |
| Alpha Vantage | Free-$50/mo | Earnings data |

---

## 🏗️ Signal Generation Pipeline

```
Data Source
    ↓
Edge Function: ingest-*
    ↓
Raw Data → PostgreSQL Tables
    ↓
Edge Function: generate-signals-from-*
    ↓
Signals Table (with citations, checksums)
    ↓
Edge Function: compute-signal-scores
    ↓
Composite Scores per Asset
    ↓
Edge Function: compute-theme-scores
    ↓
Theme Scores for UI
```

---

## 📈 Scoring Engine

### Component Weights

```python
combined_score = (
    0.25 * institutional_signals +    # 13F
    0.15 * insider_signals +          # Form 4
    0.15 * policy_signals +           # Government
    0.10 * etf_flows +                # Capital flows
    0.10 * social_sentiment +         # Reddit/StockTwits
    0.08 * dark_pool_signals +        # Market structure
    0.07 * options_flow +             # Derivatives
    0.05 * job_postings +             # Alternative
    0.05 * technical_signals          # Patterns
)
```

### Exponential Decay

Signals decay over time with 30-day half-life:
```
decay = exp(-ln(2) * days_ago / 30)
```

| Age | Weight |
|-----|--------|
| 0 days | 100% |
| 30 days | 50% |
| 60 days | 25% |
| 90 days | 12.5% |

---

## 🔧 Adding New Data Sources

### 1. Create Edge Function

```typescript
// supabase/functions/ingest-new-source/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch from external source
  const data = await fetch("https://api.example.com/data");
  
  // Insert into PostgreSQL
  await supabase.from("new_source_table").upsert(data);
  
  // Log success
  await supabase.from("ingest_logs").insert({
    etl_name: "ingest-new-source",
    status: "success",
    rows_inserted: data.length
  });

  return new Response(JSON.stringify({ success: true }));
});
```

### 2. Add to Config

```toml
# supabase/config.toml
[functions.ingest-new-source]
verify_jwt = false
```

### 3. Schedule with pg_cron

```sql
SELECT cron.schedule(
  'ingest-new-source-hourly',
  '0 * * * *',
  $$SELECT net.http_post(...)$$
);
```

---

## 📊 Data Quality Monitoring

### Automated Checks
- **Staleness alerts**: Data older than expected
- **Skew detection**: 90%+ same direction = data issue
- **Fallback tracking**: AI source usage >80% = primary down

### Health Dashboard
- `/ingestion-health` - Function status
- `/api-data-staleness` - Data freshness
- `watchdog-ingestion-health` - Continuous monitoring

---

## 🚀 Future Data Sources (Roadmap)

### Under Consideration
- [ ] Twitter/X sentiment (API access expensive)
- [ ] LinkedIn job postings (requires partnership)
- [ ] Earnings call transcripts
- [ ] Real-time streaming prices
- [ ] Supply chain shipping data
- [ ] Satellite imagery analysis
