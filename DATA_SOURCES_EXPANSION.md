# Opportunity Radar - Data Sources Expansion Plan

## 🎯 Implementation Status

### ✅ **Phase 1: Core Foundation (COMPLETE)**
- [x] SEC 13F Filings (Institutional Holdings)
- [x] SEC Form 4 (Insider Transactions)
- [x] Policy Feeds (Government Legislation)
- [x] ETF Flows (Capital Movement)
- [x] Market Data (Price & Momentum)
- [x] AI-Enhanced Analysis (Lovable AI)
- [x] **NEW: Web Search Integration (Perplexity API)** ✨

### 🚀 **Phase 2: Social Intelligence (IN PROGRESS)**

#### 1. **Twitter/X Sentiment Tracking**
**Status:** Backend implementation needed

**What to Track:**
```python
# backend/etl/twitter_sentiment.py

class TwitterTracker:
    def track_cashtags(self):
        # Monitor $TICKER mentions
        # Detect volume spikes (>300% increase = viral)
        # Sentiment analysis (bullish/bearish ratio)
        # Influencer mentions (>100k followers)
        
    def trending_tickers(self):
        # Top 20 most mentioned tickers (1hr window)
        # Velocity scoring (mentions per hour)
        # Compare to historical baseline
        
    def retail_momentum_score(self, ticker: str):
        # Combine: mention volume + sentiment + influencer activity
        # Output: 0-100 retail momentum score
```

**Database Schema Needed:**
```sql
CREATE TABLE social_signals (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    source VARCHAR(20) NOT NULL, -- 'twitter', 'reddit', 'stocktwits'
    mention_count INTEGER,
    sentiment_score FLOAT, -- -1 to +1
    influencer_mentions INTEGER,
    timestamp TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_social_ticker_timestamp ON social_signals(ticker, timestamp);
```

**API Requirements:**
- Twitter API v2 (Elevated access for search)
- Rate limits: 500k tweets/month on basic tier
- Estimated cost: $100/month for Basic tier

---

#### 2. **Reddit Sentiment Analysis**
**Status:** Backend implementation needed

**Subreddits to Monitor:**
- r/wallstreetbets (2M+ members)
- r/stocks (6M+ members)
- r/investing (3M+ members)
- r/SecurityAnalysis (professional)

**What to Track:**
```python
# backend/etl/reddit_sentiment.py

class RedditTracker:
    def hot_tickers(self):
        # Scan top 100 posts from last 24hrs
        # Extract tickers from title + body
        # Award count = community conviction
        # Upvote velocity = trending indicator
        
    def dd_analysis(self):
        # Identify "DD" (due diligence) posts
        # Sentiment: Bullish/Bearish
        # Quality score (post length, sources cited)
        # Track comment sentiment
```

**Implementation:**
```python
import praw  # Python Reddit API Wrapper

reddit = praw.Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent="OpportunityRadar/1.0"
)

# Scan wallstreetbets
for submission in reddit.subreddit("wallstreetbets").hot(limit=100):
    tickers = extract_tickers(submission.title + submission.selftext)
    sentiment = analyze_sentiment(submission.selftext)
    # Store in social_signals table
```

**Cost:** FREE (Reddit API is free for read-only)

---

#### 3. **StockTwits Integration**
**Status:** Backend implementation needed

**Why StockTwits:**
- Purpose-built for stock discussion
- Built-in bullish/bearish sentiment
- More signal, less noise than Twitter

**API Endpoints:**
```python
# backend/etl/stocktwits.py

class StockTwitsTracker:
    def ticker_sentiment(self, ticker: str):
        # GET /streams/symbol/{ticker}.json
        # Returns: messages + sentiment ratio
        
    def trending(self):
        # GET /streams/trending.json
        # Returns: Top 30 trending symbols
```

**Cost:** FREE (30 requests/hour on free tier)

---

### 📊 **Phase 3: Congressional & Political Intelligence**

#### 4. **Congressional Stock Trades**
**Status:** Backend implementation needed

**Data Source:** House Stock Watcher API / Quiver Quantitative

**What to Track:**
```python
# backend/etl/congressional_trades.py

class CongressionalTracker:
    def recent_trades(self, days=7):
        # Scrape latest disclosures
        # Track: Representative, ticker, amount, date
        # Flag: Trades before policy votes
        
    def cluster_analysis(self):
        # Multiple members buying same ticker = strong signal
        # Track party alignment (bipartisan = stronger)
        # Committee membership (oversight = insider info)
```

**Database Schema:**
```sql
CREATE TABLE congressional_trades (
    id SERIAL PRIMARY KEY,
    representative VARCHAR(100),
    ticker VARCHAR(10),
    transaction_type VARCHAR(10), -- 'buy' or 'sell'
    amount_min INTEGER,
    amount_max INTEGER,
    filed_date DATE,
    transaction_date DATE,
    party VARCHAR(20),
    committee VARCHAR(100),
    metadata JSONB
);
```

**Why It Matters:**
- Lawmakers trade before policy changes
- Example: Chip bill → Pelosi buys NVDA
- Bipartisan buying = high conviction

**Cost:** FREE (public disclosure data)

---

### 💹 **Phase 4: Options & Derivatives Signals**

#### 5. **Unusual Options Activity**
**Status:** Requires paid API subscription

**Data Sources:**
- Unusual Whales API ($50-200/month)
- FlowAlgo API ($99-499/month)
- Cheddar Flow ($97/month)

**What to Track:**
```python
# backend/etl/options_flow.py

class OptionsTracker:
    def unusual_activity(self):
        # Large call purchases (bullish bets)
        # Large put purchases (bearish bets)
        # Sweep orders (aggressive institutional buying)
        # Dark pool prints (hidden institutional trades)
        
    def signals(self, ticker: str):
        # Put/Call ratio
        # Open interest changes
        # Implied volatility spikes
        # Near-dated vs. long-dated positioning
```

**Signal Interpretation:**
```
Large call sweep on NVDA $900 strike (1 week expiry)
+ Institutional 13F buying
+ Insider purchases
= HIGH CONVICTION short-term move
```

**Database Schema:**
```sql
CREATE TABLE options_flow (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10),
    option_type VARCHAR(10), -- 'call' or 'put'
    strike FLOAT,
    expiry DATE,
    premium BIGINT,
    volume INTEGER,
    open_interest INTEGER,
    flow_type VARCHAR(20), -- 'sweep', 'block', 'split'
    sentiment VARCHAR(10), -- 'bullish', 'bearish'
    timestamp TIMESTAMP DEFAULT NOW()
);
```

**Recommended:** Start with Unusual Whales API ($50/month basic tier)

---

### 🏢 **Phase 5: Company Growth Indicators**

#### 6. **Job Postings as Leading Indicator**
**Status:** Backend implementation needed

**Data Sources:**
- LinkedIn Jobs API (requires partnership)
- Indeed API scraping
- Company career pages scraping (Firecrawl)

**What to Track:**
```python
# backend/etl/job_postings.py

class JobPostingsTracker:
    def hiring_velocity(self, ticker: str):
        # Track new job postings over time
        # Categorize: Engineering, Sales, Operations
        # Growth = bullish, layoffs = bearish
        
    def role_analysis(self):
        # Engineering roles = product development
        # Sales roles = revenue expansion
        # Leadership roles = scaling operations
```

**Example Insights:**
```
NVDA posts 500 new AI engineer roles in Q1
+ 13F institutional buying
+ Policy support (AI infrastructure bill)
= Company scaling production to meet demand
```

**Implementation:**
```python
# Scrape using Firecrawl
from firecrawl import FirecrawlApp

app = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
careers_data = app.scrape_url("https://nvidia.com/careers")
# Parse job listings, count, categorize
```

**Cost:** 
- Firecrawl: $20/month for 5,000 pages
- Indeed scraping: FREE (rate-limited)

---

#### 7. **Earnings Call Sentiment Analysis**
**Status:** Backend implementation needed

**Data Sources:**
- Alpha Vantage API (FREE tier: 25 calls/day)
- Seeking Alpha transcripts (scraping)
- Financial Modeling Prep API ($15/month)

**What to Track:**
```python
# backend/etl/earnings_sentiment.py

class EarningsAnalyzer:
    def transcript_sentiment(self, ticker: str):
        # AI sentiment analysis of management tone
        # Key phrases: "tailwinds", "headwinds", "beating expectations"
        # Compare guidance to analyst estimates
        
    def quarter_over_quarter(self):
        # Track sentiment changes
        # Improved tone = bullish
        # Defensive language = bearish
```

**AI Analysis with Lovable AI:**
```typescript
// Use existing Lovable AI to analyze transcripts
const sentiment = await analyzTranscript(transcript);
// Output: bullish/neutral/bearish + confidence score
```

**Cost:** FREE (Alpha Vantage) or $15/month (FMP)

---

### 🔬 **Phase 6: Innovation Pipeline**

#### 8. **Patent Filings Tracker**
**Status:** Backend implementation needed

**Data Source:** USPTO API (FREE)

**What to Track:**
```python
# backend/etl/patent_filings.py

class PatentTracker:
    def recent_filings(self, company: str):
        # Query USPTO database
        # Track: AI, semiconductor, biotech patents
        # Flag: Pending vs. granted
        
    def innovation_score(self, ticker: str):
        # Patent count (last 12 months)
        # Patent quality (citations)
        # Technology categories
```

**Example:**
```
NVDA files 50 new AI chip patents in Q4
+ Institutional buying
+ Insider confidence
= Future product pipeline validation
```

**Implementation:**
```python
import requests

# USPTO Public API
url = "https://developer.uspto.gov/ibd-api/v1/patent/application"
params = {"searchText": "NVIDIA AI chip"}
response = requests.get(url, params=params)
# Parse and store patent data
```

**Cost:** FREE

---

### 📈 **Phase 7: Market Sentiment & Trends**

#### 9. **Google Trends Integration**
**Status:** Backend implementation needed

**Data Source:** Google Trends API (pytrends library)

**What to Track:**
```python
# backend/etl/google_trends.py

from pytrends.request import TrendReq

class GoogleTrendsTracker:
    def search_volume(self, keyword: str):
        # Track interest over time
        # Compare: ticker + product name
        # Regional breakdowns
        
    def correlation(self, ticker: str):
        # Correlate search volume with stock price
        # Example: "Tesla" searches predict TSLA moves
```

**Use Cases:**
- iPhone search volume → AAPL earnings preview
- "ChatGPT" searches → MSFT (OpenAI investor)
- "Nvidia stock" searches → Retail interest

**Cost:** FREE

---

#### 10. **Short Interest & Borrow Rates**
**Status:** Backend implementation needed

**Data Sources:**
- Fintel API ($20-50/month)
- Ortex ($99/month)
- FINRA (bi-monthly reports, FREE)

**What to Track:**
```python
# backend/etl/short_interest.py

class ShortInterestTracker:
    def short_ratio(self, ticker: str):
        # % of float shorted
        # Days to cover
        # Borrow rate (cost to short)
        
    def squeeze_potential(self):
        # High short interest + positive catalyst = squeeze risk
        # Recent examples: GME, AMC
```

**Database Schema:**
```sql
CREATE TABLE short_interest (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10),
    short_interest BIGINT,
    float_percentage FLOAT,
    days_to_cover FLOAT,
    borrow_rate FLOAT,
    report_date DATE,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

**Cost:** $20-99/month depending on provider

---

## 🏗️ **Implementation Architecture**

### **ETL Pipeline Structure**
```
backend/etl/
├── social_sentiment.py      # Twitter, Reddit, StockTwits
├── congressional_trades.py  # Political trades
├── options_flow.py          # Unusual options activity
├── job_postings.py          # Hiring trends
├── earnings_sentiment.py    # Earnings call analysis
├── patent_filings.py        # USPTO data
├── google_trends.py         # Search volume
└── short_interest.py        # Short data
```

### **Database Expansion**
```sql
-- New tables needed
CREATE TABLE social_signals (...);
CREATE TABLE congressional_trades (...);
CREATE TABLE options_flow (...);
CREATE TABLE job_postings (...);
CREATE TABLE earnings_sentiment (...);
CREATE TABLE patent_filings (...);
CREATE TABLE search_trends (...);
CREATE TABLE short_interest (...);
```

### **Scoring Engine Update**
```python
# backend/scoring.py - Enhanced

combined_score = (
    0.25 * institutional_signals +    # 13F
    0.15 * insider_signals +          # Form 4
    0.15 * policy_signals +           # Government
    0.10 * etf_flows +                # Capital flows
    0.10 * social_sentiment +         # NEW: Twitter/Reddit
    0.08 * congressional_trades +     # NEW: Political
    0.07 * options_flow +             # NEW: Derivatives
    0.05 * job_postings +             # NEW: Hiring
    0.05 * web_search_relevance       # NEW: Breaking news
)
```

---

## 💰 **Cost Summary**

### **Free Data Sources**
- ✅ Reddit API
- ✅ StockTwits API (limited)
- ✅ Congressional trades (public data)
- ✅ USPTO patents
- ✅ Google Trends
- ✅ FINRA short interest (bi-monthly)
- ✅ Alpha Vantage (25 calls/day)

### **Paid APIs (Recommended)**
| Service | Cost/Month | Priority | Purpose |
|---------|-----------|----------|---------|
| Perplexity API | ~$20 | HIGH ✅ | Web search (ACTIVE) |
| Twitter API v2 | $100 | HIGH | Social sentiment |
| Unusual Whales | $50 | MEDIUM | Options flow |
| Firecrawl | $20 | MEDIUM | Job postings scraping |
| Financial Modeling Prep | $15 | LOW | Earnings transcripts |
| Fintel | $20 | LOW | Short interest data |

**Total Monthly Cost:** $225 for all paid APIs
**High Priority Only:** $120 (Twitter + Perplexity)

---

## 📊 **Enhanced Signal Convergence**

### **Example: High Conviction Opportunity**

**Ticker: NVDA**
```
PROPRIETARY SIGNALS (Opportunity Radar):
✅ 13F: 8 institutional buys ($500M total)
✅ Form 4: CEO bought $5M worth
✅ Policy: $500M DOE AI infrastructure grant
✅ ETF Flows: $85M into AI sector ETFs

NEW SIGNALS (Enhanced Platform):
✅ Web Search: "NVDA announces $2B Microsoft datacenter deal"
✅ Twitter: Mentions up 400% (viral trend)
✅ Reddit: 3 DD posts on r/wallstreetbets (bullish)
✅ Congressional: 2 senators bought NVDA this week
✅ Options: $10M in call sweeps (bullish bets)
✅ Jobs: 200 new engineer postings
✅ Patents: 15 new AI chip patents filed
✅ Google Trends: Search volume up 300%
✅ Short Interest: Borrow rate spiked (shorts squeezed)

COMBINED SCORE: 97.3/100 🔥
CONVICTION: EXTREME HIGH
RECOMMENDATION: Strong Buy
```

---

## 🚀 **Deployment Roadmap**

### **Week 1-2: Social Intelligence**
- [ ] Implement Twitter sentiment tracker
- [ ] Add Reddit scraper
- [ ] Integrate StockTwits API
- [ ] Create social_signals table
- [ ] Update scoring engine

### **Week 3-4: Political & Options**
- [ ] Congressional trades scraper
- [ ] Integrate Unusual Whales API
- [ ] Create respective database tables
- [ ] Add to scoring algorithm

### **Week 5-6: Company Intelligence**
- [ ] Job postings tracker (Firecrawl)
- [ ] Earnings sentiment analyzer
- [ ] Patent filings scraper

### **Week 7-8: Market Sentiment**
- [ ] Google Trends integration
- [ ] Short interest tracker
- [ ] Final scoring algorithm calibration

### **Week 9-10: Testing & Optimization**
- [ ] Backtest new signals vs. historical data
- [ ] Optimize signal weights
- [ ] Performance tuning
- [ ] Documentation

---

## 🎯 **Success Metrics**

### **Signal Quality**
- **False Positive Rate:** <15% (down from 25%)
- **Early Detection:** Identify opportunities 30-60 days before price moves
- **Multi-Signal Convergence:** 80% of winning trades have 5+ signals

### **Platform Differentiation**
- **Unique Data Points:** 14 signal types (vs. 5 today)
- **Real-Time Context:** Web search + proprietary data
- **Competitive Moat:** No other platform combines all 14 sources

---

## 📞 **Next Steps**

1. ✅ **DONE:** Web search integration (Perplexity)
2. **IMMEDIATE:** Set up Twitter API credentials
3. **NEXT WEEK:** Implement social sentiment ETL
4. **NEXT MONTH:** Add congressional trades + options flow

Ready to implement the backend ETL pipelines? I've documented everything needed for your backend team to build these integrations.
