# Memory: scoring/score-calculation-details/calibration-and-recentering
Updated: now

The `compute-asset-scores` function implements global two-pass recentering with mass-based calibration:

1. **Global Two-Pass Recentering**: Pass 1 collects ALL raw `expectedReturnRaw` across all batches. After all batches complete, a single global mean is computed and subtracted from each asset's return. This ensures consistent recentering across the entire universe, not per-batch.

2. **Mass-Based Disagreement Penalty**: Disagreement penalty is gated by total signal "mass" (`posMass + negMass >= 0.002`) rather than net contributions. This prevents cancellation-based false triggering and only penalizes assets with meaningful conflicting evidence.

3. **Filtered P95 Scale**: The dynamic score mapping scale is computed only from assets with `mass >= 0.001`. This prevents the "mostly neutral" population from compressing the score distribution.

4. **Stored Values**:
   - `assets.expected_return` stores the CENTERED value (raw - globalMean)
   - `score_explanation` stores both `expected_return_raw` and `expected_return_centered` for transparency
   - Additional diagnostics: `signal_mass`, `sum_pos_mass`, `sum_neg_mass`, `disagree_mass_gated`

5. **Horizon Fallback**: 1d → 3d (scaled /3) → 7d (scaled /7) for immature signal types.

Validation confirms: global mean ≈ 0, P5-P95 score spread 22-63 (previously 45-51), bias corrected (1152 pos vs 248 neg).
