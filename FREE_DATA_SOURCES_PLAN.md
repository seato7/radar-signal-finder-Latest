# Free Data Sources Implementation Plan

## 🎯 Zero-Cost, High-Value Additions

All sources below are **100% FREE** and can be implemented immediately without any API costs.

---

## 📊 Priority Order (Highest Value First)

### **1. Reddit Sentiment Analysis** ⭐⭐⭐⭐⭐
**Why First:** Massive community, proven predictive power (GME, AMC), completely free

**What You Get:**
- r/wallstreetbets (2M+ members) - retail momentum
- r/stocks (6M+ members) - serious investors
- r/investing (3M+ members) - long-term analysis
- Early detection of viral stocks

**Implementation:** `backend/etl/reddit_sentiment.py` (already coded in guide)

**Value Examples:**
- GME detected 3 weeks early on WSB before squeeze
- Reddit mentions = leading indicator of retail buying
- Award counts = community conviction level

**Cost:** $0 (Reddit API is free for read-only)

---

### **2. Congressional Stock Trades** ⭐⭐⭐⭐⭐
**Why Second:** Legal insider trading by lawmakers, unique data edge

**What You Get:**
- House & Senate stock trades (reported within 45 days)
- Which politicians are buying/selling what
- Policy + congressional trade convergence = gold

**Data Source:** House Stock Watcher (free public data)

**Implementation:** `backend/etl/congressional_trades.py` (already coded)

**Value Examples:**
- Nancy Pelosi buys tech before chip bill → NVDA goes up
- Senators buy defense stocks → Ukraine aid bill passes
- Bipartisan buying = extremely strong signal

**Cost:** $0 (public disclosure data)

---

### **3. Google Trends** ⭐⭐⭐⭐
**Why Third:** Search volume predicts interest, works for consumer stocks

**What You Get:**
- Real-time search trends for tickers + products
- Regional breakdowns
- Correlation with stock prices

**Implementation:** Uses `pytrends` library (free)

**Value Examples:**
- "iPhone" searches → AAPL earnings preview
- "Tesla" searches correlate with TSLA price
- Product launches detected early

**Cost:** $0 (Google Trends API via pytrends)

---

### **4. USPTO Patent Filings** ⭐⭐⭐
**Why Fourth:** Innovation pipeline indicator, forward-looking

**What You Get:**
- Recent patent applications by company
- Technology categories (AI, biotech, chips)
- Competitive moat analysis

**Implementation:** USPTO Public API (free)

**Value Examples:**
- NVDA files 50 AI patents → future products
- Pharma patents → FDA approval pipeline
- Tech patents = competitive advantage

**Cost:** $0 (USPTO API is free)

---

### **5. StockTwits Sentiment** ⭐⭐⭐
**Why Fifth:** Purpose-built for stocks, built-in sentiment

**What You Get:**
- Trending tickers (updated hourly)
- Bullish/bearish ratio per ticker
- Less noise than Twitter

**Limitations:** 30 requests/hour on free tier (enough for your needs)

**Implementation:** Simple REST API

**Value Examples:**
- Detect sentiment shifts before price moves
- Community conviction levels
- Complement to Reddit data

**Cost:** $0 (free tier: 30 req/hour)

---

### **6. Alpha Vantage Earnings Data** ⭐⭐
**Why Sixth:** Earnings surprises move markets

**What You Get:**
- Earnings calendar
- EPS surprises (beat/miss)
- Revenue data

**Limitations:** 25 API calls/day (sufficient for top holdings)

**Implementation:** Simple API key signup

**Value Example:**
- Earnings beat + 13F buying = strong validation

**Cost:** $0 (free tier: 25 calls/day)

---

### **7. FINRA Short Interest** ⭐⭐
**Why Seventh:** Short squeeze detection

**What You Get:**
- Bi-monthly short interest reports
- Days to cover
- Short volume

**Limitations:** Only updated twice/month (vs. daily with paid)

**Implementation:** Scrape FINRA website or use CSV downloads

**Value Example:**
- High short interest + positive news = squeeze potential

**Cost:** $0 (public FINRA data)

---

## 🚀 Free Tier Implementation Roadmap

### **Week 1: Social Intelligence**
1. ✅ Web search already active (Perplexity free tier)
2. Deploy Reddit sentiment tracker
3. Add StockTwits basic tracking

**Deliverables:**
- Social sentiment scores for top 100 tickers
- Reddit trending tickers dashboard
- API endpoint: `/api/social/{ticker}`

---

### **Week 2: Political & Innovation**
1. Deploy Congressional trades scraper
2. Deploy Google Trends tracker
3. Set up USPTO patent monitoring

**Deliverables:**
- Congressional trade alerts
- Search volume trends
- Patent filing counts per ticker
- API endpoint: `/api/congressional/{ticker}`

---

### **Week 3: Integration & Testing**
1. Update scoring algorithm to include new signals
2. Add social sentiment to radar page
3. Display congressional trades on asset detail pages
4. Test everything

**New Scoring Weights:**
```python
combined_score = (
    0.30 * institutional_signals +    # 13F (existing)
    0.20 * insider_signals +          # Form 4 (existing)
    0.15 * policy_signals +           # Government (existing)
    0.10 * etf_flows +                # ETF (existing)
    0.10 * social_sentiment +         # NEW: Reddit + StockTwits
    0.10 * congressional_trades +     # NEW: Political
    0.05 * web_search_relevance       # NEW: Breaking news (active)
)
```

---

## 💾 Database Migrations (Free Sources Only)

```sql
-- Week 1: Social signals
CREATE TABLE social_signals (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    source VARCHAR(20) CHECK (source IN ('reddit', 'stocktwits')),
    mention_count INTEGER,
    sentiment_score FLOAT,
    bullish_count INTEGER,
    bearish_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Week 2: Political & trends
CREATE TABLE congressional_trades (
    id SERIAL PRIMARY KEY,
    representative VARCHAR(100),
    ticker VARCHAR(10),
    transaction_type VARCHAR(10),
    amount_min INTEGER,
    amount_max INTEGER,
    transaction_date DATE,
    party VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE search_trends (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10),
    search_volume INTEGER,
    trend_change FLOAT,
    period_start DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE patent_filings (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10),
    patent_title TEXT,
    filing_date DATE,
    technology_category VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📈 Expected Impact (Free Sources Only)

### **Before (5 signals):**
- 13F, Form 4, Policy, ETF, Price
- Combined score based on 5 inputs
- Good but limited

### **After (12 signals):**
- All existing +
- Reddit sentiment
- StockTwits sentiment
- Congressional trades
- Google Trends
- Patents
- Web search (active)
- Short interest (FINRA)

**Result:**
- 2.4x more data points
- Better early detection (Reddit/trends)
- Political edge (congressional trades)
- Innovation pipeline (patents)
- Zero additional cost

---

## 🎯 Implementation Priority

### **Start Today:**
1. Reddit sentiment (biggest bang for buck)
2. Congressional trades (unique edge)

### **Week 2:**
3. Google Trends
4. StockTwits

### **Week 3:**
5. Patents
6. FINRA short interest

### **Later (After Users):**
- Twitter API ($100/month) - when you need real-time social
- Options flow ($50/month) - when you need derivatives
- Job postings scraping ($20/month) - nice to have

---

## 💡 Monetization Strategy

### **Free Tier Users Get:**
- Basic access to all signals
- Daily updates (not real-time)
- Top 50 opportunities

### **Paid Users Get (Later):**
- Real-time Twitter sentiment (when you add it)
- Options flow data (when you add it)
- Unlimited watchlist
- Custom alerts
- API access

**Free data sources let you acquire users, prove value, then add paid sources as premium features.**

---

## 📊 Success Metrics (3 Months)

### **Data Quality:**
- False positive rate: <20%
- Early detection: 2-4 weeks before price moves
- Signal convergence: 70%+ of winners have 4+ signals

### **User Growth:**
- 100+ active users → Consider Twitter API
- 500+ users → Add options flow
- 1000+ users → Full premium tier

### **Revenue:**
- $0 cost while building user base
- Monetize later with paid APIs as premium features
- Operational profit from day one

---

## 🚀 Quick Start Commands

```bash
# Install free dependencies
pip install praw pytrends requests beautifulsoup4

# Test Reddit scraper
python -m etl.reddit_sentiment

# Test Congressional trades
python -m etl.congressional_trades

# Test Google Trends
python -m etl.google_trends

# Set up cron jobs (all free sources)
crontab -e
```

```cron
# Reddit - every 6 hours
0 */6 * * * cd /app/backend && python -m etl.reddit_sentiment

# Congressional - daily at 6 AM
0 6 * * * cd /app/backend && python -m etl.congressional_trades

# Google Trends - daily at 8 AM
0 8 * * * cd /app/backend && python -m etl.google_trends

# StockTwits - every 2 hours
0 */2 * * * cd /app/backend && python -m etl.stocktwits

# Patents - weekly on Monday
0 9 * * 1 cd /app/backend && python -m etl.patent_filings
```

---

## 📞 Summary

**Zero-cost expansion:**
- 7 new free data sources
- 2.4x more signals
- Unique competitive edges
- Production-ready code

**Deploy order:**
1. Reddit (this week)
2. Congressional trades (this week)
3. Google Trends (next week)
4. Everything else (month 2)

**Later (after users):**
- Add paid APIs as premium features
- Charge users for real-time Twitter, options flow
- Turn costs into revenue generators

You can scale to 1,000+ users profitably on free data alone! 🚀
