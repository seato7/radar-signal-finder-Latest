# Signal Scoring Engine Documentation

## Overview

The Signal Scoring Engine transforms raw ingestion data into ranked, interpretable signals across all asset classes (stocks, crypto, forex). It provides a composite score (0-100) that weights multiple signal dimensions to identify high-conviction opportunities.

---

## Architecture

### Data Flow

```
Raw Signals (signals table)
    ↓
Scoring Engine (compute-signal-scores)
    ↓
Composite Scores + Factors
    ↓
API (api-signals)
    ↓
Frontend / Trading Bots
```

### Components

1. **Scoring Configuration** (`scoring_config` table)
   - Stores dynamic weights for signal dimensions
   - Allows runtime configuration without code changes
   - Default weights provided for immediate use

2. **Compute Engine** (`compute-signal-scores` function)
   - Processes unscored signals in batches
   - Applies normalization and weighting
   - Stores composite scores and factors

3. **Query API** (`api-signals` function)
   - Serves scored signals with filtering
   - Provides summary statistics
   - Returns top assets by score

---

## Scoring Methodology

### Signal Dimensions

The composite score combines five dimensions:

| Dimension       | Weight | Description |
|----------------|--------|-------------|
| **Technical**  | 30%    | Chart patterns, indicators (RSI, MACD), support/resistance |
| **Institutional** | 25% | 13F filings, insider buys, dark pool activity, smart money flow |
| **Sentiment**  | 20%    | News sentiment, social media mentions, Reddit/StockTwits buzz |
| **Macro**      | 15%    | Economic indicators, COT reports, interest rates, Fed policy |
| **On-Chain**   | 10%    | (Crypto only) Whale activity, exchange flows, NVT, MVRV ratios |

### Normalization Process

1. **Input**: Raw `magnitude` value from signal (typically 0-10)
2. **Normalize**: `normalized_magnitude = min(abs(magnitude) * 100, 100)`
3. **Classify**: Map `signal_type` to dimension (technical, institutional, etc.)
4. **Weight**: Apply dimension weight from `scoring_config`
5. **Aggregate**: Sum weighted scores across active dimensions
6. **Scale**: Normalize to 0-100 range based on total weight

### Composite Score Formula

```
composite_score = Σ(dimension_score * weight) / Σ(active_weights) * 100
```

**Example:**
- Technical signal: magnitude = 3.5 → 350 (capped at 100)
- Institutional signal: magnitude = 2.0 → 200 (capped at 100)
- No other signals present

```
composite_score = (100 * 0.30 + 100 * 0.25) / (0.30 + 0.25) * 100
                = (30 + 25) / 0.55 * 100
                = 55 / 0.55
                = 100
```

### Signal Classification

Composite scores are mapped to actionable classifications:

| Score Range | Classification    | Meaning |
|-------------|------------------|---------|
| 75-100      | `strong_bullish` / `strong_bearish` | High conviction, immediate action |
| 50-74       | `bullish` / `bearish` | Moderate conviction, monitor closely |
| 25-49       | `watchlist` | Early signal, requires confirmation |
| 0-24        | `neutral` | Insufficient signal strength |

Direction (`up`, `down`, `neutral`) from the original signal modifies classification (e.g., `strong_bullish` vs `strong_bearish`).

---

## Configuration

### Dynamic Weight Management

Weights are stored in `scoring_config` table and can be updated at runtime:

```sql
-- View current configuration
SELECT * FROM scoring_config WHERE config_name = 'default';

-- Update weights (example: increase technical weight)
UPDATE scoring_config
SET weights = '{
  "technical": 0.35,
  "institutional": 0.25,
  "sentiment": 0.20,
  "macro": 0.15,
  "onchain": 0.05
}'::jsonb
WHERE config_name = 'default';
```

### Creating Custom Configurations

```sql
INSERT INTO scoring_config (config_name, weights, description)
VALUES (
  'aggressive',
  '{
    "technical": 0.40,
    "institutional": 0.30,
    "sentiment": 0.10,
    "macro": 0.10,
    "onchain": 0.10
  }'::jsonb,
  'High-frequency trading focused on technical and institutional signals'
);
```

To activate:
```sql
UPDATE scoring_config SET is_active = false;  -- Deactivate all
UPDATE scoring_config SET is_active = true WHERE config_name = 'aggressive';
```

---

## API Usage

### Compute Scores (Backend Only)

Typically triggered by cron job or after ingestion:

```bash
curl -X POST https://PROJECT_ID.supabase.co/functions/v1/compute-signal-scores \
  -H "Authorization: Bearer SERVICE_ROLE_KEY"
```

**Response:**
```json
{
  "message": "Signal scores computed successfully",
  "processed": 847,
  "timestamp": "2025-01-15T18:30:00Z"
}
```

### Query Scored Signals

```bash
GET /api-signals?score_min=50&signal_type=bullish&asset_class=stock&limit=20
```

**Query Parameters:**
- `score_min` (number): Minimum composite score (default: 0)
- `signal_type` (string): Filter by classification (`strong_bullish`, `bullish`, `watchlist`, etc.)
- `asset_class` (string): Filter by asset class (`stock`, `crypto`, `forex`)
- `limit` (number): Max results (default: 100)

**Response:**
```json
{
  "summary": {
    "total_signals": 20,
    "avg_score": "72.35",
    "by_classification": {
      "strong_bullish": 5,
      "bullish": 15
    },
    "by_asset_class": {
      "stock": 12,
      "crypto": 8
    },
    "top_assets": [
      {
        "ticker": "NVDA",
        "name": "NVIDIA Corporation",
        "avg_score": "85.50",
        "signal_count": 3
      },
      ...
    ]
  },
  "signals": [
    {
      "id": "uuid",
      "signal_type": "technical_breakout",
      "composite_score": 85.5,
      "score_factors": {
        "technical_score": 90,
        "institutional_score": 80,
        "sentiment_score": 0,
        "macro_score": 0,
        "onchain_score": 0,
        "normalized_magnitude": 85
      },
      "signal_classification": "strong_bullish",
      "asset_class": "stock",
      "direction": "up",
      "observed_at": "2025-01-15T15:30:00Z",
      "assets": {
        "ticker": "NVDA",
        "name": "NVIDIA Corporation",
        "exchange": "NASDAQ"
      }
    },
    ...
  ]
}
```

---

## Integration Examples

### Trading Bot Integration

```typescript
// Fetch high-conviction signals for automated trading
const response = await fetch('/api-signals?score_min=75&asset_class=stock');
const { signals } = await response.json();

for (const signal of signals) {
  if (signal.signal_classification === 'strong_bullish') {
    // Execute buy order
    await executeTrade({
      ticker: signal.assets.ticker,
      side: 'buy',
      quantity: calculatePositionSize(signal.composite_score),
      reason: `Signal score: ${signal.composite_score}, factors: ${JSON.stringify(signal.score_factors)}`
    });
  }
}
```

### Alert Generation

```typescript
// Generate alerts for score changes
const highScoreSignals = await fetch('/api-signals?score_min=80').then(r => r.json());

for (const signal of highScoreSignals.signals) {
  await createAlert({
    user_id: userId,
    message: `${signal.assets.ticker} reached high conviction (score: ${signal.composite_score})`,
    severity: 'high',
    metadata: signal.score_factors
  });
}
```

### Dashboard Display

```tsx
// Display top signals in UI
const { summary, signals } = await fetch('/api-signals?limit=10').then(r => r.json());

<div>
  <h2>Top Opportunities (Avg Score: {summary.avg_score})</h2>
  {signals.map(signal => (
    <SignalCard
      key={signal.id}
      ticker={signal.assets.ticker}
      score={signal.composite_score}
      classification={signal.signal_classification}
      factors={signal.score_factors}
    />
  ))}
</div>
```

---

## Signal Type Mapping

### Technical Dimension

- `technical_*`, `pattern_*`, `breakout`, `support`, `resistance`
- `rsi_*`, `macd_*`, `bollinger_*`, `fibonacci_*`
- `vwap_*`, `volume_*`, `trend_*`

### Institutional Dimension

- `13f_*`, `insider_*`, `institutional_*`
- `dark_pool_*`, `smart_money_*`, `whale_*`

### Sentiment Dimension

- `sentiment_*`, `news_*`, `social_*`
- `reddit_*`, `stocktwits_*`, `twitter_*`

### Macro Dimension

- `economic_*`, `cot_*`, `fed_*`
- `interest_rate_*`, `gdp_*`, `cpi_*`, `inflation_*`

### On-Chain Dimension (Crypto Only)

- `onchain_*`, `whale_*`, `exchange_flow_*`
- `nvt_*`, `mvrv_*`, `hash_rate_*`

---

## Performance Considerations

### Batch Processing

The scoring engine processes up to 1000 unscored signals per invocation to prevent timeouts. For high-volume systems:

1. Run `compute-signal-scores` every 6 hours via cron
2. Process in batches (adjust limit in function if needed)
3. Monitor execution time in `ingest_logs`

### Query Optimization

Indexes are created on:
- `composite_score` (DESC) for fast top-score queries
- `signal_classification` for filtering
- `asset_class` for asset-specific queries

### Caching

Consider caching API responses for:
- Dashboard widgets (5-minute TTL)
- Top signals lists (15-minute TTL)
- Summary statistics (30-minute TTL)

---

## Troubleshooting

### Scores Not Computing

**Symptom:** Signals remain without `composite_score`

**Causes:**
1. `compute-signal-scores` not running
2. `scoring_config` table empty or no active config
3. Asset class not mapped correctly

**Fix:**
```bash
# Manually trigger scoring
curl -X POST /compute-signal-scores -H "Authorization: Bearer KEY"

# Verify config exists
SELECT * FROM scoring_config WHERE is_active = true;
```

### Low Scores Despite Strong Signals

**Symptom:** Expected high-conviction signals have low scores

**Causes:**
1. Signal type not mapped to dimension
2. Magnitude normalization issue
3. Weights too low for relevant dimensions

**Fix:**
- Review `score_factors` in API response to see which dimensions are active
- Adjust weights in `scoring_config` if needed
- Ensure `signal_type` naming matches dimension mapping

### Inconsistent Classifications

**Symptom:** Similar scores produce different classifications

**Cause:** Direction field affects classification (up/down/neutral)

**Fix:**
- Ensure `direction` is set correctly in raw signals
- Review classification thresholds if needed (hardcoded in `compute-signal-scores`)

---

## Future Enhancements

- [ ] Machine learning-based weight optimization
- [ ] Peer-relative scoring (z-score normalization)
- [ ] Time-decay factor for older signals
- [ ] Sector-specific weight profiles
- [ ] Backtesting score effectiveness
- [ ] Real-time score updates via websockets
- [ ] Custom user scoring profiles

---

## References

- Ingestion pipeline: `docs/ETL_DATA_SOURCES.md`
- Monitoring: `docs/MONITORING_GUIDE.md`
- Database schema: `supabase/migrations/`
