# Memory: scoring/score-calculation-details/calibration-and-recentering
Updated: now

The `compute-asset-scores` function implements four key calibration fixes to address score compression and bearish bias:

1. **Recentering**: A two-pass approach computes raw `expected_return` for all assets in a batch, calculates the mean, then subtracts it before final scoring. This removes systematic bearish drift. Both `expected_return_raw` and `expected_return_centered` are stored in `score_explanation`.

2. **Gated Disagreement Penalty**: The penalty for conflicting signals (both bullish and bearish on same asset) only applies when `total = pos + neg >= DISAGREE_MIN_TOTAL (0.01)`. This prevents penalizing assets with tiny, noise-level conflicts.

3. **Horizon Fallback**: When 1d alpha is unavailable, the system tries 3d alpha (scaled /3) then 7d alpha (scaled /7) to estimate 1d equivalent. This reduces "none" fallbacks for signal types that are too recent for 1d grading.

4. **Dynamic Score Mapping**: The score mapping scale is set dynamically using `p95Scale = max(0.005, P95(|expected_return - mean|))`. The clamp is `2 * p95Scale`, ensuring the score distribution expands based on actual expected return variance.

Run-level invariants now include: `mean_expected_return`, `p95_scale`, `total_expected_returns_sampled` for calibration transparency.
