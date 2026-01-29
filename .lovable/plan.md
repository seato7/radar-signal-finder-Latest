# Fix Performance Tracker Accuracy

## Status: ✅ COMPLETED

## Summary
Fixed the Performance Tracker inaccuracies caused by price data gaps (up to 43% of top-rated assets missing prices on snapshot dates).

## Root Causes (Fixed)

1. **Price Date Mismatch**: Function required exact date matches, but prices don't exist for weekends/holidays → **Now uses nearest-price logic**
2. **Missing Asset Prices**: Many top-rated assets (crypto, OTC stocks) lacked price data → **Now gated by fresh price coverage**
3. **Different Portfolios Per Period**: Each time period used a different "first day" portfolio → **Clarified with UI labels**

## Changes Made

### Edge Functions

1. **calculate-performance/index.ts**:
   - Added `findNearestPrice(ticker, targetDate, pricesByTicker, direction, maxDays)` helper
   - Changed price query to use date range with 7-day buffer instead of exact dates
   - Changed period handling: `'30D'` instead of `'1M'`
   - Added `data_quality` metric in response (assets_with_prices, total_assets, coverage_pct)
   - Carry-forward logic for missing prices on specific days

2. **get-daily-performance-history/index.ts**:
   - Same nearest-price logic for daily returns
   - Skip days where portfolio coverage is below 50%
   - Return `assets_with_data` count per day

3. **daily-prediction-snapshot/index.ts**:
   - Filter to only include assets with `status = 'fresh'` in `price_coverage_daily`
   - Require price data for snapshotting (no more untrackable assets)
   - Log excluded assets count in metadata

### UI Updates

1. **Backtest.tsx**:
   - Changed period from "1M" to "30D" with label "Last 30 Days"
   - Added data quality indicator badge showing "X of 10 assets have price data"
   - Yellow warning badge when coverage < 80%
   - Assets without data shown with warning icon and "No data" label
   - Added `getPeriodLabel()` helper for cleaner period display

## Expected Results

- **All Time**: Shows 9-10 assets with returns (not 4)
- **Last 30 Days**: Shows actual returns (not 0%)
- **Last 7 Days**: Remains accurate
- Price gaps filled with nearest available data
- Clear indicator when data quality is degraded
- SPY benchmark always present

## Validation Queries

After deployment, verify with:

```sql
-- Check that calculate-performance returns data quality
-- Should show coverage_pct > 80% for most periods

-- Check price coverage for top assets
SELECT a.ticker, pcd.status, pcd.days_stale
FROM assets a
LEFT JOIN price_coverage_daily pcd ON pcd.ticker = a.ticker
WHERE a.computed_score IS NOT NULL
ORDER BY a.expected_return DESC
LIMIT 20;
```
