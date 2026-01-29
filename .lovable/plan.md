
# Plan: Fix Theme Scoring Formula & Remove "Scored Assets Only" Toggle

## Problem Analysis

### Issue 1: Theme Scores Are Compressed Around 50
The current theme scoring has a **clamp calibration bug**. Here's what's happening:

**Current theme data:**
- "Big Tech & Consumer": `net_momentum = -0.0038`, `score = 15` (floor)
- "Retail & E-commerce": `net_momentum ≈ 0`, `score = 50` (neutral)
- Most themes cluster between 38-50

**The bug:**
- The formula uses `clamp = globalP95Scale * 0.1` where `globalP95Scale ≈ 0.00624`
- This gives `clamp ≈ 0.000624`
- But `net_momentum` values range from `-0.0038` to `+0.0001`
- Any theme with `|net_momentum| > 0.000624` immediately hits floor (15) or ceiling (85)
- This causes extreme polarization OR neutral clustering

**Why it differs from assets:**
- Assets use `expected_return` directly (single value per asset)
- Themes aggregate `expected_return × signal_mass × weight` across many assets
- This sum produces tiny values that don't scale correctly with the P95

### Issue 2: "Scored assets only" Toggle
User wants this removed - all assets should be shown by default without filtering.

---

## Solution

### Part 1: Fix Theme Scoring to Match Asset Model

Refactor `compute-theme-scores` to use the **same scoring formula as assets**:

1. **Instead of summing momentum contributions**, calculate a **weighted average expected_return** for each theme
2. Apply the **same P95 scaling and score mapping** used by `compute-asset-scores`

**New formula:**
```
avgExpectedReturn = Σ(expected_return × signal_mass × weight) / Σ(signal_mass × weight)
score = scoreFromExpected(avgExpectedReturn - globalMean, confScore, p95Scale)
```

This ensures:
- Themes are scored on the same scale as assets
- A theme with bullish assets scores high (60-85)
- A theme with bearish assets scores low (15-40)
- Mixed themes score around 50

### Part 2: Remove "Scored Assets Only" Toggle

Remove the toggle and related filtering logic from `AssetRadar.tsx`:
- Delete the `scoredOnly` state variable
- Remove the Switch component and label
- Remove all `filterScored` logic from `fetchAssets`

---

## Technical Changes

### File 1: `supabase/functions/compute-theme-scores/index.ts`

**Changes:**
1. Replace `calculateThemeScore` function to compute **weighted average expected_return** instead of summed net_momentum
2. Use the exact `scoreFromExpected` formula from `compute-asset-scores`:
   ```typescript
   const base = 50;
   const clamp = Math.max(0.005, 2 * p95Scale);
   const profitability = Math.max(-clamp, Math.min(clamp, avgExpectedReturnCentered));
   const profitPoints = (profitability / clamp) * 25;
   const confPoints = Math.max(-10, Math.min(10, confScore * 5));
   return Math.max(15, Math.min(85, base + profitPoints + confPoints));
   ```
3. Calculate global mean from all theme asset pools for recentering
4. Keep storing diagnostic metrics (bullish_mass, bearish_mass, asset_count)

### File 2: `src/pages/AssetRadar.tsx`

**Changes:**
1. Remove `scoredOnly` state and `setScoredOnly` handler (line 127)
2. Remove `filterScored` parameter from `fetchAssets` calls
3. Remove the Switch toggle UI block (lines 603-619)
4. Remove all `if (filterScored)` filtering logic in fetch functions
5. Update empty state text to remove scored filter reference

---

## Expected Outcomes

### After Theme Scoring Fix:
| Theme | Current Score | Expected Behavior |
|-------|---------------|-------------------|
| Retail & E-commerce | 50 (neutral) | Spreads based on constituents |
| Big Tech & Consumer | 15 (floor) | Moderately bearish (30-40) |
| AI & Semiconductors | 47.6 | Varies with market |
| Industrial & Infrastructure | 16.1 | Moderately bearish (30-40) |

Scores will be distributed across the 15-85 range similar to individual assets.

### After Toggle Removal:
- Asset Radar shows all 26,000+ assets by default
- No filtering by signal mass
- Simpler, cleaner UI
