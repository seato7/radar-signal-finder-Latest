# Opportunity Radar - Backend Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
│                  (React Frontend - Vite/TypeScript)              │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌──────────────────┐
        │  Backend API      │   │  Supabase Edge   │
        │  (FastAPI/Python) │   │  Functions       │
        │  Railway          │   │  (Lovable AI)    │
        └───────────────────┘   └──────────────────┘
                    │                       │
                    ▼                       │
        ┌───────────────────┐              │
        │  PostgreSQL DB    │◄─────────────┘
        │  (Railway)        │
        └───────────────────┘
                    ▲
                    │
        ┌───────────┴───────────┐
        │   ETL Pipelines       │
        │   (Data Ingestion)    │
        └───────────────────────┘
                    ▲
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌────────┐    ┌─────────┐    ┌──────────┐
│ SEC    │    │ Policy  │    │ Market   │
│ Filings│    │ Feeds   │    │ Data     │
└────────┘    └─────────┘    └──────────┘
```

---

## Data Flow: How Investment Advice Reaches Users

### 1. **Data Ingestion (ETL Pipelines)**

**Location:** `backend/etl/`

**What Happens:**
- **SEC 13F Holdings** (`sec_13f_holdings.py`): Scrapes institutional investor holdings from SEC filings
- **SEC Form 4** (`sec_form4.py`): Tracks insider buying/selling transactions
- **Policy Feeds** (`policy_feeds.py`): Monitors government policy changes (infrastructure bills, regulations, etc.)
- **ETF Flows** (`etf_flows.py`): Tracks capital flows into/out of ETFs
- **Price Data** (`prices_csv.py`): Imports historical price data

**Output:** Raw signals stored in PostgreSQL database

---

### 2. **Signal Aggregation & Scoring**

**Location:** `backend/scoring.py`

**What Happens:**
```python
# Combines multiple signal types into a unified score
combined_score = (
    policy_weight * policy_signals +
    institutional_weight * 13f_signals +
    insider_weight * form4_signals +
    etf_weight * etf_flow_signals +
    momentum_weight * price_momentum
)
```

**Output:**
- Assets ranked by combined score
- Themes with aggregated signal counts
- Confidence levels based on signal diversity

---

### 3. **Theme Mapping**

**Location:** `backend/services/theme_mapper.py`

**What Happens:**
- Signals are mapped to investment themes (e.g., "AI Infrastructure", "Water Reuse")
- Uses semantic matching (embeddings) or keyword matching
- Configuration: `SEMANTIC_MAPPER=1` for AI-based matching

**Example:**
```
Signal: "BlackRock buys $50M in NVDA"
Theme Mapped: "AI Infrastructure"
```

**Output:** Themed signal clusters with metadata

---

### 4. **API Endpoints (Backend)**

**Base URL:** `https://opportunity-radar-api-production.up.railway.app`

**Key Endpoints:**

#### `/api/radar` - Dashboard Feed
```json
GET /api/radar?days=7

Response:
{
  "themes": [
    {
      "id": "theme_123",
      "name": "AI Liquid Cooling",
      "signal_count": 15,
      "combined_score": 87.3,
      "assets": ["NVDA", "SMCI", "AAPL"]
    }
  ],
  "top_signals": [
    {
      "ticker": "NVDA",
      "signal_type": "13F",
      "summary": "BlackRock increased position by 25%"
    }
  ]
}
```

#### `/api/assets` - Scored Asset List
```json
GET /api/assets?limit=20

Response:
{
  "assets": [
    {
      "ticker": "NVDA",
      "name": "NVIDIA Corp",
      "combined_score": 92.1,
      "signals": {
        "13F": 8,
        "Form4": 3,
        "policy": 2,
        "etf_flows": 5
      }
    }
  ]
}
```

#### `/api/themes/{theme_id}/why_now` - AI Summary
```json
GET /api/themes/theme_123/why_now

Response:
{
  "summary": "AI Liquid Cooling is surging due to...",
  "why_now": "Three major catalysts converged this week...",
  "citations": [
    "BlackRock filed 13F showing $200M new position in SMCI",
    "DOE announced $500M cooling infrastructure grant"
  ]
}
```

---

### 5. **AI Enhancement Layer (Supabase Edge Functions)**

**Location:** `supabase/functions/`

**How AI Works:**

#### A. **Chat Assistant** (`chat-assistant/index.ts`)
```typescript
// Flow:
User asks: "What's the best opportunity today?"
  ↓
Edge function fetches:
  - /api/radar (recent themes)
  - /api/assets (top scored assets)
  ↓
Lovable AI (Google Gemini 2.5 Flash) receives:
  - User question
  - Real-time market data
  - System prompt
  ↓
AI analyzes and responds:
  "Based on current signals, AI Liquid Cooling shows 
   the strongest momentum with 15 complementary signals..."
```

**Key Code:**
```typescript
// Fetches YOUR proprietary data
const radarResponse = await fetch(`${backendUrl}/api/radar?days=7`);
const radarData = await radarResponse.json();

// Injects into AI prompt
const systemPrompt = `
  REAL-TIME MARKET DATA:
  ${marketData}
  
  Your role: Answer using the REAL-TIME DATA provided...
`;
```

#### B. **Theme Analysis** (`analyze-theme/index.ts`)
- Generates "Why Now?" summaries
- Uses signal citations as evidence
- Powered by Lovable AI

#### C. **Risk Assessment** (`assess-risk/index.ts`)
- Analyzes signal quality
- Checks for diversification
- Provides conviction levels

---

### 6. **Frontend Display**

**Location:** `src/pages/`

**Key Pages:**

#### **Radar** (`src/pages/Radar.tsx`)
- Displays themed opportunities
- Shows signal counts and scores
- Real-time updates

#### **Assets** (`src/pages/Assets.tsx`)
- Lists all tracked tickers
- Multi-signal scores visible
- Sortable by score/signals

#### **AI Assistant** (`src/pages/Assistant.tsx`)
- Chat interface
- Pulls live data from backend
- Natural language Q&A

---

## Complete User Journey Example

### User asks: "What's the best opportunity today?"

**Step-by-step:**

1. **Frontend:** User types question in AI Assistant
   ```typescript
   // src/components/AIAssistantChat.tsx
   fetch(`${SUPABASE_URL}/functions/v1/chat-assistant`, {
     body: JSON.stringify({ messages: [...] })
   })
   ```

2. **Edge Function:** Receives request
   ```typescript
   // supabase/functions/chat-assistant/index.ts
   const radarData = await fetch(backendUrl + '/api/radar?days=7');
   const assetsData = await fetch(backendUrl + '/api/assets?limit=20');
   ```

3. **Backend API:** Returns scored data
   ```python
   # backend/routers/radar.py
   themes = db.query(Theme).filter(...).order_by(combined_score)
   return {"themes": themes, "top_signals": signals}
   ```

4. **Database:** Queries aggregated signals
   ```sql
   SELECT 
     themes.name,
     COUNT(signals.*) as signal_count,
     AVG(signals.score) as combined_score
   FROM themes
   JOIN signals ON signals.theme_id = themes.id
   WHERE signals.created_at > NOW() - INTERVAL '7 days'
   GROUP BY themes.id
   ORDER BY combined_score DESC;
   ```

5. **Edge Function:** Sends to Lovable AI
   ```typescript
   const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
     body: JSON.stringify({
       model: 'google/gemini-2.5-flash',
       messages: [
         { role: 'system', content: systemPrompt + realTimeData },
         { role: 'user', content: 'What's the best opportunity today?' }
       ]
     })
   });
   ```

6. **Lovable AI:** Analyzes and responds
   ```
   Based on the last 7 days of signals:
   
   🏆 TOP OPPORTUNITY: AI Liquid Cooling
   - 15 complementary signals
   - Combined score: 87.3/100
   - Key assets: NVDA, SMCI, AAPL
   
   WHY NOW:
   • BlackRock filed 13F with $200M new positions
   • DOE announced $500M infrastructure grants
   • 3 insider purchases this week
   • ETF inflows: $85M in sector funds
   ```

7. **Frontend:** Displays streaming response
   ```typescript
   // User sees response appear token-by-token
   setMessages([...messages, { role: 'assistant', content: aiResponse }])
   ```

---

## Data Sources Breakdown

### **SEC 13F Holdings**
- **What:** Institutional investor quarterly filings (>$100M AUM)
- **Frequency:** Quarterly, 45 days after quarter end
- **Signal:** New positions = buying conviction
- **Example:** "BlackRock bought 2M shares of NVDA in Q4 2024"

### **SEC Form 4**
- **What:** Insider transactions (executives, directors, >10% owners)
- **Frequency:** Must file within 2 days of trade
- **Signal:** Insider buying = confidence, selling = caution
- **Example:** "NVDA CEO bought $5M worth of stock"

### **Policy Feeds**
- **What:** Government legislation, executive orders, regulations
- **Frequency:** Real-time RSS/API feeds
- **Signal:** New bills/funding = sector tailwinds
- **Example:** "Infrastructure Bill allocates $50B for EV charging"

### **ETF Flows**
- **What:** Daily capital inflows/outflows from ETFs
- **Frequency:** Daily
- **Signal:** Large inflows = institutional interest
- **Example:** "$100M flowed into AI ETFs this week"

### **Price Data**
- **What:** Historical OHLCV (Open/High/Low/Close/Volume)
- **Frequency:** Daily
- **Signal:** Momentum indicators, trend detection
- **Example:** "NVDA up 15% with increasing volume"

---

## Why This Architecture Is Powerful

### **Multi-Signal Approach**
- No single signal creates noise
- Convergence of 3+ signals = high conviction
- Reduces false positives

### **Real-Time AI Context**
- AI assistant doesn't guess or hallucinate
- Uses YOUR proprietary scored data
- Cites specific signals as evidence

### **Scalable Design**
- ETL pipelines run independently
- API can handle high traffic
- Edge functions auto-scale
- Database optimized for time-series queries

### **Transparent Scoring**
```python
# Users can see exactly why an asset scores high
{
  "ticker": "NVDA",
  "combined_score": 92.1,
  "breakdown": {
    "institutional": 35.2,  # 13F signals
    "insider": 15.0,        # Form 4 signals
    "policy": 22.5,         # Policy alignment
    "etf_flows": 19.4       # Capital flows
  }
}
```

---

## Key Configuration Files

### **Backend Config** (`backend/config.py`)
```python
# Database connection
DATABASE_URL = os.getenv("DATABASE_URL")

# Signal weights
INSTITUTIONAL_WEIGHT = 0.35
INSIDER_WEIGHT = 0.25
POLICY_WEIGHT = 0.20
ETF_WEIGHT = 0.20

# Theme mapping
SEMANTIC_MAPPER = os.getenv("SEMANTIC_MAPPER", "0")
SEMANTIC_THRESHOLD = float(os.getenv("SEMANTIC_THRESHOLD", "0.35"))
```

### **Edge Function Config** (`supabase/config.toml`)
```toml
[functions.chat-assistant]
verify_jwt = false  # Public access

[functions.analyze-theme]
verify_jwt = true   # Requires auth
```

---

## How to Monitor & Debug

### **Backend API Logs**
- Railway dashboard: https://railway.app
- Check `/api/health` endpoint
- Review ETL pipeline logs

### **Edge Function Logs**
- Lovable Cloud view → AI section → Function logs
- Real-time streaming logs
- Error tracking

### **Database Queries**
- Use backend scripts: `backend/scripts/check_user_status.py`
- Direct SQL via Railway console
- Monitor query performance

---

## Next Steps for Enhancement

### **Add Web Search to AI**
- Integrate real-time news via web search API
- Combine with your proprietary signals
- Example: "Latest NVDA news" + your 13F data

### **Expand Data Sources**
- Options flow data (unusual activity)
- Social sentiment (Twitter/Reddit)
- Earnings call transcripts
- Supply chain indicators

### **Advanced Analytics**
- Backtest historical signals
- Correlation analysis between signal types
- Predictive modeling (ML)

---

## Summary

**Your Investment Advice Flow:**
```
Data Sources → ETL → Database → Scoring → API → AI Enhancement → User
```

**Key Differentiators:**
1. **Multi-Signal Fusion:** Not just price charts or news
2. **Proprietary Scoring:** Combines 5 data types
3. **AI-Powered Context:** Real-time analysis, not canned responses
4. **Transparent Methodology:** Users see signal breakdowns

**What Makes It Valuable:**
- Institutional-grade data (13F)
- Early insider signals (Form 4)
- Policy-driven opportunities
- AI that uses YOUR data, not generic info

This is a professional-grade investment research platform competing with Bloomberg Terminal, but focused on multi-signal opportunity detection.
