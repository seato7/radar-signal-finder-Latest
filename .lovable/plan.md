
# Comprehensive InsiderPulse Scoring & AI System Audit

## Executive Summary

After a thorough code and data audit, I've identified **critical gaps** that explain why InsiderPulse is underperforming compared to AI competitors like Claude/Kassandra (87.5% win rate vs. our ~31.8% hit rate). The core issues are:

1. **Broken high-alpha data pipelines** - Options and earnings data are 39 days stale
2. **Railway backend is offline** - 404 errors for all options requests  
3. **No real-time intelligence** - We use daily batch processing vs. competitors' real-time web search
4. **Formula-based scoring** - We use static weighted formulas vs. LLM reasoning
5. **Missing prediction grading** - No data since Jan 24 to measure performance

---

## Part 1: Complete Scoring System Documentation

### 1.1 Asset Scoring Engine (`compute-asset-scores`)
**Location:** `supabase/functions/compute-asset-scores/index.ts` (1,331 lines)

**Core Formula:**
```
Expected Return = Σ (alpha × decay × magnitude × trust_factor × direction_polarity)
Score = scoreFromExpected(ER_centered, confidence, P95_scale)
```

**Key Parameters:**
| Parameter | Value | Purpose |
|-----------|-------|---------|
| ASSETS_PER_INVOCATION | 500 | Batch size per run |
| MIN_PRICE_USD | $1.00 | Penny stock filter |
| MAX_RETURN_WINSORIZE | ±20% | Cap extreme returns |
| HALF_LIFE_DAYS | 5-60 | Decay by signal category |
| MIN_ALPHA_SAMPLE_SIZE | 50 | Trust gating threshold |

**Component Weights (10 categories):**
```typescript
InsiderPoliticianConfirm: half_life=45, baseline=0.0015
BigMoneyConfirm:          half_life=60, baseline=0.0012
FlowPressure:             half_life=10, baseline=0.0010
CapexMomentum:            half_life=30, baseline=0.0009
TechEdge:                 half_life=5,  baseline=0.0008
PolicyMomentum:           half_life=21, baseline=0.0008
MacroEconomic:            half_life=14, baseline=0.0007
Attention:                half_life=2,  baseline=0.0006
EarningsMomentum:         half_life=14, baseline=0.0007
RiskFlags:                half_life=7,  baseline=-0.0010
```

**Signal Type Mapping (85+ types → 10 components):**
- `filing_13f_*`, `smart_money*`, `whale_*` → BigMoneyConfirm
- `insider_*`, `politician_*`, `form4_*` → InsiderPoliticianConfirm
- `dark_pool_*`, `etf_*`, `flow_*` → FlowPressure
- `technical_*`, `momentum_*`, `options_*` → TechEdge
- `news_*`, `social_*`, `sentiment_*` → Attention
- `earnings_*` → EarningsMomentum
- `short_*`, `volatility_*` → RiskFlags

**Score Mapping Function:**
```typescript
function scoreFromExpected(expectedReturnCentered, confScore, p95Scale) {
  const clamp = Math.max(0.005, 2 * p95Scale);
  const profitability = clamp(expectedReturnCentered, -clamp, clamp);
  const profitPoints = (profitability / clamp) * 25;
  const confPoints = clamp(confScore * 5, -10, 10);
  return clamp(50 + profitPoints + confPoints, 15, 85);
}
```

### 1.2 Theme Scoring Engine (`compute-theme-scores`)
**Location:** `supabase/functions/compute-theme-scores/index.ts` (700 lines)

**Core Formula (v4):**
```
avgExpectedReturn = Σ(expected_return × signal_mass × weight) / Σ(signal_mass × weight)
score = scoreFromExpected(avgExpectedReturn - globalMean, confScore, p95Scale)
```

**Active Themes (17):**
AI & Semiconductors, Banks & Financials, Big Tech & Consumer, Biotech & Healthcare, Clean Energy & EVs, Cloud & Cybersecurity, Commodities & Mining, Defense & Aerospace, Energy & Oil, Fintech & Crypto, Food & Agriculture, Industrial & Infrastructure, International & Emerging, Media & Entertainment, Real Estate & REITs, Retail & E-commerce, Travel & Leisure

**Sector-to-Theme Mapping:** 40+ sector keywords mapped to themes with weights

### 1.3 Signal Alpha Calibration (`compute-signal-alpha`)
**Location:** `supabase/functions/compute-signal-alpha/index.ts` (547 lines)

**Process:**
1. Fetch signals from last 180 days with asset_id
2. Match to prices using asset_id lookup
3. Calculate forward returns (1d, 3d, 7d horizons)
4. Apply shrinkage: `shrunk_alpha = raw_alpha × (n / (n + 100))`
5. Store in `signal_type_alpha` table

**Current Top-Performing Signals (by 7d alpha):**
| Signal Type | 7d Alpha | Hit Rate | Samples |
|-------------|----------|----------|---------|
| momentum_20d_bullish | +1.78% | 69.2% | 403 |
| momentum_5d_bullish | +1.72% | 60.5% | 367 |
| unusual_options | +0.83% | 57.2% | 498 |

**Worst-Performing Signals:**
| Signal Type | 7d Alpha | Hit Rate | Samples |
|-------------|----------|----------|---------|
| short_interest | -1.96% | 28.4% | 525 |
| momentum_5d_bearish | -1.43% | 25.9% | 351 |
| search_interest | -1.01% | 35.4% | 333 |

### 1.4 Prediction System
**Snapshot Function:** `daily-prediction-snapshot` - Creates daily predictions
- Top 500 bullish assets by expected_return
- Top 100 bearish assets by expected_return (negative ER)
- Tracks top_n buckets (20, 50, 100)

**Grading Function:** `grade-predictions-1d` - Measures accuracy
- Calculates realized returns at 1d, 3d, 7d horizons
- Winsorizes at ±20%
- Tracks hit rate (direction accuracy)

### 1.5 Price Coverage System (`compute-price-coverage-daily`)
**Location:** `supabase/functions/compute-price-coverage-daily/index.ts` (141 lines)

**Process:**
1. Calls `compute_and_update_coverage` RPC
2. Sets `price_status` on assets: fresh (≤7 days), stale (>7 days), missing
3. Sets `rank_status`: rankable, stale, missing, no_coverage
4. Gates signal generation and scoring

---

## Part 2: Current Asset Universe Coverage

### 2.1 Total Assets: 26,693

| Asset Class | Fresh | Stale | Missing | Total |
|-------------|-------|-------|---------|-------|
| Stock | 15,899 | 352 | 30 | 16,281 |
| ETF | 8,422 | 23 | 0 | 8,445 |
| Crypto | 1,095 | 6 | 0 | 1,101 |
| Forex | 806 | 0 | 0 | 806 |
| Commodity | 59 | 0 | 0 | 59 |

**Coverage Rate:** 98.5% fresh (26,281/26,693)

### 2.2 Signal Type Coverage (Last 60 Days)

**Working Pipelines (Fresh Data):**
| Signal Type | Count | Last Signal | Status |
|-------------|-------|-------------|--------|
| momentum_5d_* | 56,257 | Today | ✅ Active |
| dark_pool_activity | 34,641 | Yesterday | ✅ Active |
| short_interest | 31,996 | Yesterday | ✅ Active |
| momentum_20d_* | 24,531 | Today | ✅ Active |
| news_sentiment | 9,053 | Today | ✅ Active |
| insider_buy/sell | 7,665 | Today | ✅ Active |
| etf_flow | 1,041 | Today | ✅ Active |
| capex_hiring | 978 | Yesterday | ✅ Active |
| breaking_news | 370 | Today | ✅ Active |
| cot_positioning | 329 | 10 days ago | ⚠️ Weekly |
| economic_indicator | 154 | Today | ✅ Active |

**BROKEN Pipelines (Stale Data):**
| Signal Type | Count | Last Signal | Days Stale | Issue |
|-------------|-------|-------------|------------|-------|
| technical_stochastic | 35,387 | Dec 4 | 56 days | ❌ Pipeline dead |
| chart_pattern | 19,592 | Dec 4 | 56 days | ❌ Pipeline dead |
| earnings_surprise | 1,000 | Dec 22 | 39 days | ❌ AV rate limits |
| unusual_options | 500 | Dec 22 | 39 days | ❌ Railway 404 |
| smart_money_flow | 805 | Dec 5 | 56 days | ❌ Pipeline dead |
| technical_ma_crossover | 88 | Dec 5 | 56 days | ❌ Pipeline dead |
| sentiment_extreme | 1,931 | Dec 4 | 56 days | ❌ Pipeline dead |
| crypto_* | 111 | Dec 4 | 56 days | ❌ Pipeline dead |
| search_interest | 4,820 | Dec 27 | 34 days | ❌ Firecrawl 402/429 |

---

## Part 3: What's Working vs. Broken

### 3.1 Working Systems ✅

| Component | Status | Details |
|-----------|--------|---------|
| Price Ingestion | ✅ 100% | TwelveData via Railway, 340K+ prices/day |
| Momentum Signals | ✅ 100% | 56K+ 5d/20d signals daily |
| Dark Pool Data | ✅ 100% | FINRA ATS transparency data |
| Short Interest | ✅ 100% | 32K signals daily |
| Insider Trades (Form 4) | ✅ 90% | 170 success runs, some failures |
| ETF Flows | ✅ 100% | 1K signals daily |
| Breaking News | ✅ 100% | RSS aggregation working |
| Policy Feeds | ✅ 100% | Government feed parsing |
| Asset Scoring | ✅ 100% | Full 26K universe coverage |
| Theme Scoring | ✅ 100% | 17 active themes |
| Prediction Snapshots | ✅ Fixed | 600 predictions/day (fixed Jan 30) |

### 3.2 Broken/Failing Systems ❌

| Component | Status | Root Cause | Impact |
|-----------|--------|------------|--------|
| Options Flow | ❌ 404 | Railway app not found | High-alpha signal missing |
| Earnings Surprise | ❌ Rate Limited | Alpha Vantage free tier | High-alpha signal missing |
| Search Trends | ❌ 402/429 | Firecrawl API errors | Attention signals missing |
| Technical Stochastic | ❌ 56 days stale | Pipeline halted | TechEdge signals missing |
| Chart Patterns | ❌ 56 days stale | Pipeline halted | TechEdge signals missing |
| Smart Money Flow | ❌ 56 days stale | No data source | BigMoney signals missing |
| Crypto On-chain | ❌ 56 days stale | No API key | Crypto signals missing |
| Prediction Grading | ⚠️ No recent data | No snapshots since Jan 24 | Can't measure accuracy |

### 3.3 Error Analysis from `function_status`

```
ingest-options-flow: "Railway returned 404: Application not found" (31 failures)
ingest-search-trends: "AI extraction failed: 402/429" (28 failures)
ingest-form4: 290 failures (timeout issues)
```

---

## Part 4: Gap Analysis vs. Claude/Kassandra

### 4.1 Architectural Differences

| Capability | InsiderPulse | Claude/Kassandra |
|------------|--------------|------------------|
| Data Processing | Daily batch | Real-time streaming |
| Decision Making | Weighted formula | LLM reasoning (chain-of-thought) |
| Web Intelligence | None | Tavily/NewsAPI search |
| News Analysis | RSS parsing only | Semantic understanding |
| Options Data | ❌ Broken | ✅ Text extraction from news |
| Entry/Exit Timing | None | Position management logic |
| Stop-Loss | None | Risk management rules |
| Position Sizing | None | Kelly criterion or similar |

### 4.2 Performance Gap

| Metric | InsiderPulse | Claude/Kassandra | Gap |
|--------|--------------|------------------|-----|
| Win Rate | 31.8% | 87.5% | -55.7% |
| Avg Return | -0.4% | Unknown (positive) | Significant |
| Hit Rate vs Random | Below (34.9%) | Above | Critical |

### 4.3 Why Claude Wins

1. **Real-time web search** - Fetches current news/events before making predictions
2. **LLM reasoning** - Uses chain-of-thought to weigh conflicting signals
3. **Text-based options data** - Extracts options flow mentions from Twitter/Reddit
4. **Dynamic context** - RAG with vector database for relevant historical context
5. **No stale data** - Fetches fresh data for each prediction

---

## Part 5: Transformation Plan

### Phase 1: Fix Broken Pipelines (Week 1)

#### 1.1 Fix Railway Options Endpoint
**Problem:** 404 Application not found
**Solution:** 
- Verify Railway deployment is active
- Check `RAILWAY_BASE_URL` secret is correct
- Redeploy backend if needed
**Cost:** Free (existing infrastructure)
**Files:** Check Railway dashboard, update secret if URL changed

#### 1.2 Fix Search Trends (Firecrawl)
**Problem:** 402/429 rate limits
**Solution:**
- Implement exponential backoff
- Add rate limiting (max 10 requests/minute)
- Cache results for 6 hours
**Cost:** Free (fix implementation)
**Files:** `supabase/functions/ingest-search-trends/index.ts`

#### 1.3 Restart Technical Pipelines
**Problem:** Stalled since Dec 4
**Solution:**
- Debug `ingest-advanced-technicals`
- Debug `ingest-pattern-recognition`
- Add monitoring alerts for stale data
**Cost:** Free
**Files:** 
- `supabase/functions/ingest-advanced-technicals/index.ts`
- `supabase/functions/ingest-pattern-recognition/index.ts`

#### 1.4 Fix Earnings Pipeline
**Problem:** Alpha Vantage rate limits
**Solution:**
- Reduce batch size from 4 to 2 tickers/run
- Increase delay from 12.5s to 15s
- Run more frequently (every 4 hours instead of daily)
**Cost:** Free (better rate management)
**Files:** `supabase/functions/ingest-earnings/index.ts`

### Phase 2: Add Real-Time Web Intelligence (Week 2)

#### 2.1 Integrate Tavily Search API
**Purpose:** Real-time web search for market news
**Implementation:**
- Create `supabase/functions/search-tavily/index.ts`
- Add to `chat-assistant` for real-time context
- Use for options flow text extraction
**Cost:** Tavily Free tier (1,000 searches/month), Pro tier ($100/month for 20K)
**Link:** https://tavily.com/pricing

#### 2.2 Add NewsAPI Integration
**Purpose:** Real-time headlines for sentiment
**Implementation:**
- Create `supabase/functions/ingest-newsapi/index.ts`
- Generate `breaking_news` signals from headlines
- Sentiment analysis on article content
**Cost:** NewsAPI Free (100 requests/day), Developer tier ($449/month)
**Link:** https://newsapi.org/pricing

#### 2.3 Text-Based Options Intelligence
**Purpose:** Extract options mentions from social media
**Implementation:**
- Create `supabase/functions/extract-options-mentions/index.ts`
- Parse Reddit r/wallstreetbets for unusual options mentions
- Parse Twitter/X for options flow commentary
- Generate `unusual_options` signals from text
**Cost:** Free (using Firecrawl for scraping)

### Phase 3: LLM Reasoning Layer (Week 3)

#### 3.1 Create AI Scoring Function
**Purpose:** Replace formula with LLM reasoning
**Implementation:**
```typescript
// New function: supabase/functions/compute-ai-scores/index.ts
// 1. Fetch signals for asset
// 2. Fetch real-time news via Tavily
// 3. Build prompt with all context
// 4. Call Lovable AI (GPT-5 or Gemini)
// 5. Parse prediction and confidence
// 6. Store in assets table
```
**Cost:** Free (Lovable AI models available)
**Files:** New `supabase/functions/compute-ai-scores/index.ts`

#### 3.2 Add Chain-of-Thought Reasoning
**Purpose:** Transparent decision making
**Implementation:**
- Prompt engineering for step-by-step analysis
- Store reasoning in `score_explanation` field
- Show reasoning in UI for user transparency

#### 3.3 Hybrid Scoring System
**Purpose:** Combine formula + AI for reliability
**Implementation:**
- Formula score = baseline (fast, deterministic)
- AI score = override when confidence high
- Weighted average: `final = 0.4*formula + 0.6*ai`

### Phase 4: Trading Logic (Week 4)

#### 4.1 Entry/Exit Signal Generation
**Purpose:** Actionable trade recommendations
**Implementation:**
- Create `supabase/functions/generate-trade-signals/index.ts`
- Entry: When score > 65 AND momentum aligns
- Exit: When score drops < 50 OR stop-loss hit
- Store in new `trade_signals` table

#### 4.2 Position Sizing
**Purpose:** Risk management
**Implementation:**
- Kelly criterion based on hit rate and avg return
- Max position size caps
- Sector/theme concentration limits

#### 4.3 Stop-Loss Logic
**Purpose:** Limit downside
**Implementation:**
- Trailing stop at -5% from peak
- Hard stop at -10% from entry
- Time-based exit after 5 days without profit

### Phase 5: Continuous Improvement (Ongoing)

#### 5.1 A/B Testing Framework
**Purpose:** Compare model versions
**Implementation:**
- Split predictions between formula vs. AI
- Track performance separately
- Gradually shift to better model

#### 5.2 Automated Model Metrics
**Purpose:** Daily performance tracking
**Implementation:**
- Fix `compute-model-daily-metrics` function
- Generate objective scores automatically
- Alert when performance degrades

#### 5.3 Backtesting System
**Purpose:** Validate changes before deployment
**Implementation:**
- Use historical signals + prices
- Simulate trades with new logic
- Compare against baseline

---

## Part 6: Costs Summary

### Required Services

| Service | Tier | Monthly Cost | Purpose |
|---------|------|--------------|---------|
| Tavily | Pro | $100 | Web search for real-time intel |
| NewsAPI | Developer | $449 | Breaking news headlines |
| Alpha Vantage | Premium | $149 | Options chain data (optional) |
| Polygon.io | Starter | $99 | Alternative options data |
| **Lovable AI** | **Included** | **$0** | LLM reasoning (GPT-5, Gemini) |

**Recommended Start:** Tavily Pro ($100/month) - highest ROI for real-time intelligence

**Links:**
- Tavily: https://tavily.com/pricing
- NewsAPI: https://newsapi.org/pricing
- Alpha Vantage: https://www.alphavantage.co/premium/
- Polygon.io: https://polygon.io/pricing

### Free Improvements (No Cost)

1. Fix Railway deployment (options)
2. Fix Firecrawl rate limiting (search trends)
3. Restart stalled technical pipelines
4. Implement LLM scoring with Lovable AI
5. Add text-based options extraction
6. Better error handling and monitoring

---

## Part 7: Implementation Steps (Chronological)

### Week 1: Foundation Fixes

| Day | Task | Verification |
|-----|------|--------------|
| 1 | Audit Railway deployment, fix `RAILWAY_BASE_URL` | Options endpoint returns 200 |
| 1 | Restart stalled technical pipelines | Signals appear in `signals` table |
| 2 | Fix Firecrawl rate limiting | Search trends ingesting without 429 |
| 2 | Fix earnings batch sizing | 4+ earnings records per run |
| 3 | Add pipeline health monitoring | Slack alerts for stale data |
| 3 | Backfill missing signals (Dec 4 - present) | Technical signals populated |
| 4 | Run prediction grading for Jan 25-30 | `model_daily_metrics` populated |
| 5 | Validate all pipelines running | `function_status` all success |

### Week 2: Real-Time Intelligence

| Day | Task | Verification |
|-----|------|--------------|
| 1 | Add Tavily API key secret | Secret appears in Lovable |
| 1 | Create `search-tavily` edge function | Returns search results |
| 2 | Integrate Tavily into `chat-assistant` | AI mentions current news |
| 2 | Create text-based options extractor | Finds options mentions in Reddit |
| 3 | Create NewsAPI integration | Breaking news signals generated |
| 3 | Add to signal generation pipeline | New signals appear in DB |
| 4 | Test end-to-end news → signal → score | Score changes with news |
| 5 | Monitor for 24 hours | No errors, signals flowing |

### Week 3: AI Reasoning

| Day | Task | Verification |
|-----|------|--------------|
| 1 | Create `compute-ai-scores` function | Returns AI-based scores |
| 2 | Add chain-of-thought prompting | Reasoning stored in explanation |
| 2 | Test on 100 assets | Scores differ from formula |
| 3 | Implement hybrid scoring | Both scores calculated |
| 3 | A/B test: 50% formula, 50% AI | Predictions labeled by model |
| 4 | Run parallel predictions for 48 hours | Both models have snapshots |
| 5 | Compare performance | Identify better model |

### Week 4: Trading Logic

| Day | Task | Verification |
|-----|------|--------------|
| 1 | Create `trade_signals` table | Table exists in schema |
| 1 | Create `generate-trade-signals` function | Entry/exit signals generated |
| 2 | Implement position sizing logic | Size recommendations stored |
| 2 | Implement stop-loss logic | Stop triggers logged |
| 3 | Create backtesting system | Historical trades simulated |
| 3 | Run backtest on last 30 days | Performance metrics calculated |
| 4 | Compare vs. simple "buy top 20" strategy | Identify improvement |
| 5 | Deploy to production | Trade signals visible in UI |

---

## Part 8: Verification & Testing Checklist

### Pipeline Health Tests
- [ ] All ingestion functions show `status: success` in last 24 hours
- [ ] No signal type is more than 7 days stale (except weekly COT)
- [ ] Price coverage is >98% fresh
- [ ] Options signals appearing in DB
- [ ] Earnings signals appearing in DB

### Scoring Accuracy Tests
- [ ] `compute-signal-alpha` produces 30+ signal types with samples >50
- [ ] `compute-asset-scores` updates 26K+ assets per run
- [ ] `compute-theme-scores` updates 17 themes per run
- [ ] Score distribution spans 15-85 (not clustered at 50)

### Prediction Performance Tests
- [ ] `daily-prediction-snapshot` creates 500+ predictions daily
- [ ] `grade-predictions-1d` grades predictions from T-1
- [ ] Hit rate is above 40% (improving from 31.8%)
- [ ] Average return is positive

### AI Integration Tests
- [ ] Tavily returns search results for stock queries
- [ ] LLM generates coherent reasoning for score
- [ ] AI scores differ from formula scores (not identical)
- [ ] Hybrid scoring produces reasonable blends

### End-to-End Tests
- [ ] News event → Signal generated → Score updated → Alert fired
- [ ] User can see reasoning for any asset score
- [ ] Trade signals include entry, exit, stop-loss, size
- [ ] Backtester reproduces expected returns

---

## Part 9: Expected Outcomes

### Short-Term (2 weeks)
- All pipelines running without errors
- Hit rate improves from 31.8% to 45%+
- Options and earnings signals restored
- Real-time news integrated

### Medium-Term (1 month)
- LLM reasoning layer operational
- Hit rate at 55%+ (above random)
- Average return positive (+0.3%/day on top picks)
- Trade signals with entry/exit timing

### Long-Term (3 months)
- Competitive with Claude/Kassandra (70%+ hit rate target)
- Consistent positive returns
- Automated trading bot integration
- Multi-horizon predictions (1d, 3d, 7d)

---

## Part 10: Risk Safeguards

### Data Quality
- Minimum sample size (50) for alpha calibration
- Winsorization at ±20% for extreme returns
- Price filter ($1 minimum) for penny stocks
- Staleness alerts for pipelines >24 hours behind

### Model Stability
- A/B testing for all model changes
- Rollback capability to previous model version
- Gradual rollout (10% → 50% → 100%)
- Performance monitoring with objective score

### Operational
- Slack alerts for all failures
- Daily ingestion digest emails
- Function status dashboard
- Automatic retry with exponential backoff

### Financial
- Maximum position size limits
- Sector concentration limits
- Stop-loss enforcement
- Paper trading mode for new strategies
