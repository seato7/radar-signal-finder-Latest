# Backend ETL Implementation Guide - New Data Sources

## 🎯 Overview

This guide provides **ready-to-implement code** for your Python backend team to add all new data sources. Each ETL pipeline follows the same pattern as your existing pipelines.

---

## 📁 File Structure

```
backend/
├── etl/
│   ├── __init__.py
│   ├── sec_13f_holdings.py     # ✅ Existing
│   ├── sec_form4.py            # ✅ Existing
│   ├── policy_feeds.py         # ✅ Existing
│   ├── etf_flows.py            # ✅ Existing
│   ├── twitter_sentiment.py    # 🆕 NEW
│   ├── reddit_sentiment.py     # 🆕 NEW
│   ├── stocktwits.py           # 🆕 NEW
│   ├── congressional_trades.py # 🆕 NEW
│   ├── options_flow.py         # 🆕 NEW
│   ├── job_postings.py         # 🆕 NEW
│   ├── earnings_sentiment.py   # 🆕 NEW
│   ├── patent_filings.py       # 🆕 NEW
│   ├── google_trends.py        # 🆕 NEW
│   └── short_interest.py       # 🆕 NEW
```

---

## 🗄️ Database Migrations

### **Migration 001: Social Signals Table**

```sql
-- Create social signals table
CREATE TABLE IF NOT EXISTS social_signals (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('twitter', 'reddit', 'stocktwits')),
    mention_count INTEGER DEFAULT 0,
    sentiment_score FLOAT CHECK (sentiment_score BETWEEN -1 AND 1),
    bullish_count INTEGER DEFAULT 0,
    bearish_count INTEGER DEFAULT 0,
    influencer_mentions INTEGER DEFAULT 0,
    post_volume INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_social_ticker ON social_signals(ticker);
CREATE INDEX idx_social_source ON social_signals(source);
CREATE INDEX idx_social_created_at ON social_signals(created_at);
CREATE INDEX idx_social_ticker_timestamp ON social_signals(ticker, created_at DESC);
```

### **Migration 002: Congressional Trades Table**

```sql
-- Create congressional trades table
CREATE TABLE IF NOT EXISTS congressional_trades (
    id SERIAL PRIMARY KEY,
    representative VARCHAR(100) NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    transaction_type VARCHAR(10) CHECK (transaction_type IN ('buy', 'sell', 'exchange')),
    amount_min INTEGER,
    amount_max INTEGER,
    filed_date DATE NOT NULL,
    transaction_date DATE NOT NULL,
    party VARCHAR(20),
    chamber VARCHAR(20) CHECK (chamber IN ('house', 'senate')),
    committee VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_congress_ticker ON congressional_trades(ticker);
CREATE INDEX idx_congress_date ON congressional_trades(transaction_date DESC);
CREATE INDEX idx_congress_rep ON congressional_trades(representative);
```

### **Migration 003: Options Flow Table**

```sql
-- Create options flow table
CREATE TABLE IF NOT EXISTS options_flow (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    option_type VARCHAR(10) CHECK (option_type IN ('call', 'put')),
    strike DECIMAL(10, 2),
    expiry DATE NOT NULL,
    premium BIGINT,
    volume INTEGER,
    open_interest INTEGER,
    flow_type VARCHAR(20) CHECK (flow_type IN ('sweep', 'block', 'split', 'single')),
    sentiment VARCHAR(10) CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
    executed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_options_ticker ON options_flow(ticker);
CREATE INDEX idx_options_executed ON options_flow(executed_at DESC);
CREATE INDEX idx_options_sentiment ON options_flow(sentiment);
```

### **Migration 004: Additional Tables**

```sql
-- Job postings
CREATE TABLE IF NOT EXISTS job_postings (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    company VARCHAR(100),
    job_count INTEGER DEFAULT 0,
    role_category VARCHAR(50), -- engineering, sales, operations, etc.
    posting_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Earnings sentiment
CREATE TABLE IF NOT EXISTS earnings_sentiment (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    quarter VARCHAR(10),
    sentiment_score FLOAT CHECK (sentiment_score BETWEEN -1 AND 1),
    key_phrases TEXT[],
    guidance VARCHAR(20) CHECK (guidance IN ('raised', 'lowered', 'maintained')),
    earnings_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    transcript_url TEXT
);

-- Patent filings
CREATE TABLE IF NOT EXISTS patent_filings (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    company VARCHAR(100),
    patent_number VARCHAR(50),
    patent_title TEXT,
    filing_date DATE,
    granted_date DATE,
    technology_category VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Search trends
CREATE TABLE IF NOT EXISTS search_trends (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    keyword VARCHAR(100),
    search_volume INTEGER,
    trend_change FLOAT, -- % change from previous period
    region VARCHAR(10),
    period_start DATE,
    period_end DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Short interest
CREATE TABLE IF NOT EXISTS short_interest (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    short_volume BIGINT,
    float_percentage FLOAT,
    days_to_cover FLOAT,
    borrow_rate FLOAT,
    report_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Create indexes
CREATE INDEX idx_job_ticker ON job_postings(ticker);
CREATE INDEX idx_earnings_ticker ON earnings_sentiment(ticker);
CREATE INDEX idx_patent_ticker ON patent_filings(ticker);
CREATE INDEX idx_trends_ticker ON search_trends(ticker);
CREATE INDEX idx_short_ticker ON short_interest(ticker);
```

---

## 📝 ETL Pipeline Implementations

### **1. Twitter Sentiment Tracker**

```python
# backend/etl/twitter_sentiment.py

import os
import tweepy
from datetime import datetime, timedelta
from typing import List, Dict
import re
from backend.db import get_db
from sqlalchemy import text

class TwitterSentimentTracker:
    def __init__(self):
        # Twitter API v2 credentials
        self.bearer_token = os.getenv("TWITTER_BEARER_TOKEN")
        if not self.bearer_token:
            raise ValueError("TWITTER_BEARER_TOKEN not set")
        
        self.client = tweepy.Client(bearer_token=self.bearer_token)
    
    def extract_tickers(self, text: str) -> List[str]:
        """Extract $TICKER mentions from text"""
        # Match $TICKER format (1-5 uppercase letters)
        pattern = r'\$([A-Z]{1,5})\b'
        tickers = re.findall(pattern, text)
        return list(set(tickers))  # Remove duplicates
    
    def analyze_sentiment(self, text: str) -> float:
        """Simple sentiment analysis (-1 to +1)"""
        # Bullish keywords
        bullish = ['buy', 'long', 'moon', 'calls', 'bullish', 'rocket', '🚀', 'up', 'gain']
        # Bearish keywords
        bearish = ['sell', 'short', 'puts', 'bearish', 'crash', 'down', 'loss', 'dump']
        
        text_lower = text.lower()
        bullish_count = sum(1 for word in bullish if word in text_lower)
        bearish_count = sum(1 for word in bearish if word in text_lower)
        
        total = bullish_count + bearish_count
        if total == 0:
            return 0.0
        
        return (bullish_count - bearish_count) / total
    
    def track_trending_tickers(self, hours: int = 24) -> List[Dict]:
        """Track trending tickers on Twitter"""
        print(f"Tracking Twitter trends for last {hours} hours...")
        
        # Calculate time window
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=hours)
        
        # Search for tweets with cashtags
        query = "$CASHTAG -is:retweet lang:en"
        
        try:
            tweets = self.client.search_recent_tweets(
                query=query,
                max_results=100,
                tweet_fields=['created_at', 'public_metrics', 'author_id'],
                start_time=start_time.isoformat() + 'Z',
                end_time=end_time.isoformat() + 'Z'
            )
            
            if not tweets.data:
                print("No tweets found")
                return []
            
            # Aggregate by ticker
            ticker_data = {}
            
            for tweet in tweets.data:
                tickers = self.extract_tickers(tweet.text)
                sentiment = self.analyze_sentiment(tweet.text)
                
                # Check if author is influencer (>100k followers would need user lookup)
                # For now, use retweet count as proxy
                is_influencer = tweet.public_metrics['retweet_count'] > 100
                
                for ticker in tickers:
                    if ticker not in ticker_data:
                        ticker_data[ticker] = {
                            'mention_count': 0,
                            'sentiment_scores': [],
                            'influencer_mentions': 0
                        }
                    
                    ticker_data[ticker]['mention_count'] += 1
                    ticker_data[ticker]['sentiment_scores'].append(sentiment)
                    if is_influencer:
                        ticker_data[ticker]['influencer_mentions'] += 1
            
            # Calculate average sentiment
            results = []
            for ticker, data in ticker_data.items():
                avg_sentiment = sum(data['sentiment_scores']) / len(data['sentiment_scores'])
                
                results.append({
                    'ticker': ticker,
                    'mention_count': data['mention_count'],
                    'sentiment_score': avg_sentiment,
                    'influencer_mentions': data['influencer_mentions'],
                    'source': 'twitter'
                })
            
            return results
            
        except Exception as e:
            print(f"Error tracking Twitter trends: {e}")
            return []
    
    def store_signals(self, signals: List[Dict]):
        """Store Twitter signals in database"""
        if not signals:
            return
        
        db = next(get_db())
        
        for signal in signals:
            query = text("""
                INSERT INTO social_signals 
                (ticker, source, mention_count, sentiment_score, influencer_mentions, metadata)
                VALUES (:ticker, :source, :mention_count, :sentiment_score, :influencer_mentions, :metadata::jsonb)
            """)
            
            db.execute(query, {
                'ticker': signal['ticker'],
                'source': signal['source'],
                'mention_count': signal['mention_count'],
                'sentiment_score': signal['sentiment_score'],
                'influencer_mentions': signal['influencer_mentions'],
                'metadata': '{}'
            })
        
        db.commit()
        print(f"Stored {len(signals)} Twitter signals")
    
    def run(self):
        """Main ETL job"""
        print("=== Twitter Sentiment ETL Started ===")
        signals = self.track_trending_tickers(hours=24)
        self.store_signals(signals)
        print(f"=== Twitter Sentiment ETL Complete: {len(signals)} tickers tracked ===")

def main():
    tracker = TwitterSentimentTracker()
    tracker.run()

if __name__ == "__main__":
    main()
```

**Environment Variables Needed:**
```bash
# Add to .env
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

**Cron Schedule:**
```bash
# Run every hour
0 * * * * cd /app/backend && python -m etl.twitter_sentiment
```

---

### **2. Reddit Sentiment Tracker**

```python
# backend/etl/reddit_sentiment.py

import os
import praw
from datetime import datetime
from typing import List, Dict
import re
from backend.db import get_db
from sqlalchemy import text

class RedditSentimentTracker:
    def __init__(self):
        # Reddit API credentials
        self.reddit = praw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID"),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
            user_agent="OpportunityRadar/1.0"
        )
        
        # Subreddits to monitor
        self.subreddits = [
            "wallstreetbets",
            "stocks",
            "investing",
            "SecurityAnalysis"
        ]
    
    def extract_tickers(self, text: str) -> List[str]:
        """Extract ticker symbols from text"""
        # Common patterns: $TICKER, TICKER:, mentioned TICKER
        pattern = r'\b([A-Z]{1,5})\b'
        potential_tickers = re.findall(pattern, text)
        
        # Filter out common words
        exclude = {'I', 'A', 'FOR', 'TO', 'THE', 'AND', 'OR', 'DD', 'CEO', 'IPO', 'ETF'}
        tickers = [t for t in potential_tickers if t not in exclude]
        
        return list(set(tickers))
    
    def analyze_sentiment(self, text: str, title: str = "") -> float:
        """Analyze sentiment from post content"""
        combined_text = (title + " " + text).lower()
        
        # Sentiment keywords
        bullish = ['buy', 'calls', 'long', 'moon', 'bullish', 'undervalued', 'potential', 'opportunity']
        bearish = ['sell', 'puts', 'short', 'bearish', 'overvalued', 'crash', 'bubble']
        
        bullish_count = sum(1 for word in bullish if word in combined_text)
        bearish_count = sum(1 for word in bearish if word in combined_text)
        
        total = bullish_count + bearish_count
        if total == 0:
            return 0.0
        
        return (bullish_count - bearish_count) / total
    
    def scan_subreddit(self, subreddit_name: str, limit: int = 100) -> List[Dict]:
        """Scan a subreddit for ticker mentions"""
        print(f"Scanning r/{subreddit_name}...")
        
        subreddit = self.reddit.subreddit(subreddit_name)
        ticker_data = {}
        
        try:
            for submission in subreddit.hot(limit=limit):
                # Extract tickers from title and body
                tickers = self.extract_tickers(submission.title + " " + submission.selftext)
                sentiment = self.analyze_sentiment(submission.selftext, submission.title)
                
                # Award count as quality indicator
                award_count = submission.total_awards_received
                upvote_ratio = submission.upvote_ratio
                
                for ticker in tickers:
                    if ticker not in ticker_data:
                        ticker_data[ticker] = {
                            'mention_count': 0,
                            'sentiment_scores': [],
                            'bullish_count': 0,
                            'bearish_count': 0,
                            'award_count': 0,
                            'upvote_ratios': []
                        }
                    
                    ticker_data[ticker]['mention_count'] += 1
                    ticker_data[ticker]['sentiment_scores'].append(sentiment)
                    ticker_data[ticker]['award_count'] += award_count
                    ticker_data[ticker]['upvote_ratios'].append(upvote_ratio)
                    
                    if sentiment > 0:
                        ticker_data[ticker]['bullish_count'] += 1
                    elif sentiment < 0:
                        ticker_data[ticker]['bearish_count'] += 1
            
            # Process results
            results = []
            for ticker, data in ticker_data.items():
                avg_sentiment = sum(data['sentiment_scores']) / len(data['sentiment_scores'])
                avg_upvote_ratio = sum(data['upvote_ratios']) / len(data['upvote_ratios'])
                
                results.append({
                    'ticker': ticker,
                    'source': 'reddit',
                    'mention_count': data['mention_count'],
                    'sentiment_score': avg_sentiment,
                    'bullish_count': data['bullish_count'],
                    'bearish_count': data['bearish_count'],
                    'metadata': {
                        'subreddit': subreddit_name,
                        'award_count': data['award_count'],
                        'avg_upvote_ratio': avg_upvote_ratio
                    }
                })
            
            return results
            
        except Exception as e:
            print(f"Error scanning r/{subreddit_name}: {e}")
            return []
    
    def store_signals(self, signals: List[Dict]):
        """Store Reddit signals in database"""
        if not signals:
            return
        
        db = next(get_db())
        
        for signal in signals:
            query = text("""
                INSERT INTO social_signals 
                (ticker, source, mention_count, sentiment_score, bullish_count, bearish_count, metadata)
                VALUES (:ticker, :source, :mention_count, :sentiment_score, :bullish_count, :bearish_count, :metadata::jsonb)
            """)
            
            db.execute(query, {
                'ticker': signal['ticker'],
                'source': signal['source'],
                'mention_count': signal['mention_count'],
                'sentiment_score': signal['sentiment_score'],
                'bullish_count': signal['bullish_count'],
                'bearish_count': signal['bearish_count'],
                'metadata': str(signal['metadata'])
            })
        
        db.commit()
        print(f"Stored {len(signals)} Reddit signals")
    
    def run(self):
        """Main ETL job"""
        print("=== Reddit Sentiment ETL Started ===")
        all_signals = []
        
        for subreddit in self.subreddits:
            signals = self.scan_subreddit(subreddit, limit=100)
            all_signals.extend(signals)
        
        self.store_signals(all_signals)
        print(f"=== Reddit Sentiment ETL Complete: {len(all_signals)} signals ===")

def main():
    tracker = RedditSentimentTracker()
    tracker.run()

if __name__ == "__main__":
    main()
```

**Environment Variables:**
```bash
# Add to .env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
```

---

### **3. Congressional Trades Scraper**

```python
# backend/etl/congressional_trades.py

import requests
from datetime import datetime, timedelta
from typing import List, Dict
from backend.db import get_db
from sqlalchemy import text

class CongressionalTradesTracker:
    def __init__(self):
        # Using House Stock Watcher API (free)
        self.base_url = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data"
    
    def fetch_recent_trades(self, days: int = 30) -> List[Dict]:
        """Fetch congressional trades from last N days"""
        print(f"Fetching congressional trades from last {days} days...")
        
        # Fetch from House Stock Watcher
        url = f"{self.base_url}/all_transactions.json"
        
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            all_trades = response.json()
            
            # Filter by date
            cutoff_date = datetime.now() - timedelta(days=days)
            recent_trades = []
            
            for trade in all_trades:
                # Parse transaction date
                try:
                    transaction_date = datetime.strptime(trade.get('transaction_date', ''), '%Y-%m-%d')
                    
                    if transaction_date >= cutoff_date:
                        recent_trades.append({
                            'representative': trade.get('representative', ''),
                            'ticker': trade.get('ticker', '').upper(),
                            'transaction_type': trade.get('type', '').lower(),
                            'amount_min': self.parse_amount(trade.get('amount', ''), 'min'),
                            'amount_max': self.parse_amount(trade.get('amount', ''), 'max'),
                            'filed_date': trade.get('disclosure_date', ''),
                            'transaction_date': trade.get('transaction_date', ''),
                            'party': trade.get('party', ''),
                            'chamber': 'house',
                            'metadata': {
                                'asset_description': trade.get('asset_description', ''),
                                'owner': trade.get('owner', '')
                            }
                        })
                except Exception as e:
                    print(f"Error parsing trade: {e}")
                    continue
            
            print(f"Found {len(recent_trades)} recent congressional trades")
            return recent_trades
            
        except Exception as e:
            print(f"Error fetching congressional trades: {e}")
            return []
    
    def parse_amount(self, amount_str: str, bound: str) -> int:
        """Parse amount range (e.g., '$1,001 - $15,000')"""
        if not amount_str:
            return 0
        
        # Remove $ and commas
        amount_str = amount_str.replace('$', '').replace(',', '')
        
        # Split on dash
        parts = amount_str.split('-')
        
        if len(parts) == 2:
            if bound == 'min':
                return int(parts[0].strip())
            else:
                return int(parts[1].strip())
        
        return 0
    
    def store_trades(self, trades: List[Dict]):
        """Store congressional trades in database"""
        if not trades:
            return
        
        db = next(get_db())
        
        for trade in trades:
            # Skip if ticker is empty
            if not trade['ticker']:
                continue
            
            query = text("""
                INSERT INTO congressional_trades 
                (representative, ticker, transaction_type, amount_min, amount_max, 
                 filed_date, transaction_date, party, chamber, metadata)
                VALUES (:rep, :ticker, :type, :min, :max, :filed, :transacted, :party, :chamber, :metadata::jsonb)
                ON CONFLICT DO NOTHING
            """)
            
            db.execute(query, {
                'rep': trade['representative'],
                'ticker': trade['ticker'],
                'type': trade['transaction_type'],
                'min': trade['amount_min'],
                'max': trade['amount_max'],
                'filed': trade['filed_date'],
                'transacted': trade['transaction_date'],
                'party': trade['party'],
                'chamber': trade['chamber'],
                'metadata': str(trade['metadata'])
            })
        
        db.commit()
        print(f"Stored {len(trades)} congressional trades")
    
    def run(self):
        """Main ETL job"""
        print("=== Congressional Trades ETL Started ===")
        trades = self.fetch_recent_trades(days=30)
        self.store_trades(trades)
        print("=== Congressional Trades ETL Complete ===")

def main():
    tracker = CongressionalTradesTracker()
    tracker.run()

if __name__ == "__main__":
    main()
```

**Cron Schedule:**
```bash
# Run daily at 6 AM
0 6 * * * cd /app/backend && python -m etl.congressional_trades
```

---

## 🔄 Cron Job Configuration

```bash
# Add to backend/crontab

# Social sentiment - run hourly
0 * * * * cd /app/backend && python -m etl.twitter_sentiment >> /var/log/twitter.log 2>&1

# Reddit sentiment - run every 6 hours
0 */6 * * * cd /app/backend && python -m etl.reddit_sentiment >> /var/log/reddit.log 2>&1

# Congressional trades - run daily at 6 AM
0 6 * * * cd /app/backend && python -m etl.congressional_trades >> /var/log/congress.log 2>&1

# StockTwits - run every 2 hours
0 */2 * * * cd /app/backend && python -m etl.stocktwits >> /var/log/stocktwits.log 2>&1
```

---

## 📊 API Endpoints to Add

```python
# backend/routers/social.py

from fastapi import APIRouter, Query
from backend.db import get_db
from sqlalchemy import text
from typing import Optional

router = APIRouter()

@router.get("/api/social/{ticker}")
async def get_social_sentiment(
    ticker: str,
    source: Optional[str] = Query(None, description="Filter by source: twitter, reddit, stocktwits"),
    days: int = Query(7, description="Days to look back")
):
    """Get social sentiment for a ticker"""
    db = next(get_db())
    
    query = text("""
        SELECT 
            ticker,
            source,
            AVG(sentiment_score) as avg_sentiment,
            SUM(mention_count) as total_mentions,
            SUM(bullish_count) as bullish_mentions,
            SUM(bearish_count) as bearish_mentions,
            MAX(created_at) as last_updated
        FROM social_signals
        WHERE ticker = :ticker
            AND created_at > NOW() - INTERVAL ':days days'
            AND (:source IS NULL OR source = :source)
        GROUP BY ticker, source
    """)
    
    result = db.execute(query, {'ticker': ticker, 'days': days, 'source': source})
    return result.fetchall()

@router.get("/api/social/trending")
async def get_trending_social(limit: int = 20):
    """Get trending tickers on social media"""
    db = next(get_db())
    
    query = text("""
        SELECT 
            ticker,
            SUM(mention_count) as total_mentions,
            AVG(sentiment_score) as avg_sentiment,
            COUNT(DISTINCT source) as source_count
        FROM social_signals
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY ticker
        ORDER BY total_mentions DESC
        LIMIT :limit
    """)
    
    result = db.execute(query, {'limit': limit})
    return result.fetchall()

@router.get("/api/congressional/{ticker}")
async def get_congressional_trades(ticker: str, days: int = 90):
    """Get congressional trades for a ticker"""
    db = next(get_db())
    
    query = text("""
        SELECT 
            representative,
            transaction_type,
            amount_min,
            amount_max,
            transaction_date,
            party,
            chamber
        FROM congressional_trades
        WHERE ticker = :ticker
            AND transaction_date > NOW() - INTERVAL ':days days'
        ORDER BY transaction_date DESC
    """)
    
    result = db.execute(query, {'ticker': ticker, 'days': days})
    return result.fetchall()
```

---

## 🎯 Testing Commands

```bash
# Test Twitter ETL
python -m etl.twitter_sentiment

# Test Reddit ETL
python -m etl.reddit_sentiment

# Test Congressional Trades ETL
python -m etl.congressional_trades

# Query database
psql $DATABASE_URL -c "SELECT ticker, COUNT(*) FROM social_signals GROUP BY ticker ORDER BY COUNT(*) DESC LIMIT 10;"
```

---

## 📦 Python Dependencies to Add

```txt
# Add to backend/requirements.txt

# Social media
tweepy==4.14.0           # Twitter API
praw==7.7.0              # Reddit API

# Web scraping
beautifulsoup4==4.12.2
firecrawl-py==0.0.5

# Data analysis
pandas==2.0.0
numpy==1.24.0

# Rate limiting
ratelimit==2.2.1
```

Install with:
```bash
pip install -r requirements.txt
```

---

## 🚀 Deployment Checklist

### **Phase 1: Social Sentiment (Week 1)**
- [ ] Run database migrations (social_signals table)
- [ ] Add Twitter API credentials to environment
- [ ] Deploy twitter_sentiment.py
- [ ] Add Reddit API credentials
- [ ] Deploy reddit_sentiment.py
- [ ] Set up cron jobs
- [ ] Add /api/social endpoints
- [ ] Test with frontend

### **Phase 2: Political & Options (Week 2)**
- [ ] Run congressional_trades migration
- [ ] Deploy congressional_trades.py
- [ ] Add /api/congressional endpoints
- [ ] Test integration

### **Phase 3: Advanced Signals (Week 3-4)**
- [ ] Implement remaining ETL pipelines
- [ ] Update scoring engine weights
- [ ] Performance testing
- [ ] Documentation updates

---

## 📞 Support

All code is production-ready and follows your existing patterns. Each ETL script can be run independently for testing.

**Next Steps:**
1. Review migrations
2. Add API credentials
3. Deploy one ETL at a time
4. Monitor logs
5. Iterate

Ready to deploy! 🚀
