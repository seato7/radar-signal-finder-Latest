

# Fix Performance Tracker Accuracy

## Summary
The Performance Tracker is inaccurate because of price data gaps - up to 43% of top-rated assets are missing prices on snapshot dates, causing 0% or incorrect returns. The "Last 30 Days" view shows 0% return because ZERO assets matched price data.

## Root Causes

1. **Price Date Mismatch**: The function requires exact date matches between snapshots and prices, but prices don't exist for weekends/holidays
2. **Missing Asset Prices**: Many top-rated assets (crypto, OTC stocks) lack price data entirely
3. **Different Portfolios Per Period**: Each time period uses a different "first day" portfolio, which is confusing

## Solution

### Phase 1: Fix Price Lookup Logic

**File: `supabase/functions/calculate-performance/index.ts`**

Replace exact date matching with "nearest available price" logic:

```text
Current (broken):
- Query prices WHERE date IN (snapshot_dates)
- If no exact match, return 0% or exclude asset

Fixed:
- For each ticker, find the CLOSEST price to the target date
- Use a price lookup window (e.g., +/- 3 days)
- Prioritize: same date > previous day > next day
```

Implementation:
1. Build a complete price history lookup per ticker
2. For start_date: find closest price on or before that date
3. For end_date: find closest price on or after that date
4. Only exclude if NO prices exist within 7 days

### Phase 2: Improve Price Coverage Query

**File: `supabase/functions/calculate-performance/index.ts`**

Change price query strategy:

```text
Current:
- Query prices WHERE date IN (dates) LIMIT 2000

Fixed:
- Query ALL prices for portfolio tickers in date range
- Order by date to enable nearest-price lookup
- Remove the LIMIT that may truncate results
```

### Phase 3: Update Period Labels

**File: `src/pages/Backtest.tsx`**

Change period terminology from "1M" to "30D":

```text
Current labels:
- "1W" (1 Week)
- "1M" (1 Month)
- "ALL" (All Time)

Updated labels:
- "1W" (Last 7 Days)
- "30D" (Last 30 Days)
- "ALL" (All Time)
```

Update corresponding logic to use 30-day calculation instead of calendar month.

### Phase 4: Filter Out Unscorable Assets

**File: `supabase/functions/daily-prediction-snapshot/index.ts`**

Only snapshot assets that HAVE price data:

```text
Current:
- Snapshot top assets by expected_return
- May include assets without price coverage

Fixed:
- Join with price_coverage_daily table
- Only include assets with status = 'fresh'
- This ensures every snapshotted asset can be tracked
```

### Phase 5: Add "Last Available Price" Fallback

For the chart data and final values:

```text
Current:
- If no price on date, use last known price (but lookup fails)

Fixed:
- Build running price state per ticker
- Carry forward last known price for missing dates
- Mark assets with stale prices in the breakdown
```

### Phase 6: UI Transparency

**File: `src/pages/Backtest.tsx`**

Add data quality indicators:

1. Show "X of 10 assets have price data" in hero card
2. Mark assets without price data in breakdown
3. Add warning badge when coverage is below 80%

## Technical Changes

### Edge Function Updates

1. **calculate-performance/index.ts**:
   - Add `findNearestPrice(ticker, targetDate, priceLookup)` helper
   - Query prices with date range instead of exact dates
   - Change period handling: `'30D'` uses `dates.slice(-30)` instead of `'1M'`
   - Add logging for price coverage quality
   - Return `data_quality` metric in response

2. **get-daily-performance-history/index.ts**:
   - Same nearest-price logic for daily returns
   - Skip days where portfolio coverage is below 50%

### UI Updates

1. **Backtest.tsx**:
   - Change period button from "1M" to "30D"
   - Update period label display from "1 Month" to "Last 30 Days"
   - Add data quality indicators

### Database Query Changes

```sql
-- Get ALL prices for portfolio tickers in date range
SELECT ticker, date, close
FROM prices
WHERE ticker = ANY($1)
  AND date BETWEEN $2::date - interval '7 days' 
  AND $3::date + interval '7 days'
ORDER BY ticker, date
```

## Expected Results After Fix

- **All Time**: Should show 9-10 assets with returns (not 4)
- **Last 30 Days**: Should show actual returns (not 0%)
- **Last 7 Days**: Should remain accurate (already has good coverage)
- Price gaps filled with nearest available data
- Clear indicator when data quality is degraded

## Validation

After implementation, verify:
1. Query logs show >80% price coverage for all periods
2. Portfolio return matches manual calculation
3. No more "0 assets" scenarios
4. SPY benchmark is always present

