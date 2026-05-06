## Diagnostic findings

The scoring pipeline is **healthy**. The "every asset = 50" issue is a **plan-gating bug in the database RPC**, not a data/cron/billing failure.

### Evidence the pipeline is working

| Check | Result |
|---|---|
| `MAX(score_computed_at)` on `assets` | **~1 minute ago** (live) |
| `compute-asset-scores-cycle` cron | Active, every 5 min |
| Assets with `computed_score != 50` | **25,399 / 27,004** (94%) |
| Assets with `computed_score = 50` exactly | 748 (3%) |
| Score range | min 18.9, max 81, **avg 49.1** |
| Recent edge function logs | Clean — "Score computation complete. Ranked: 493…" |
| `hybrid_score` populated | 26,149 / 27,004 |
| `generate-signals-*` crons (28 of them) | All active |
| `hourly-compute-theme-scores` | Active |

So scores exist and update every 5 minutes.

### Actual root cause

User `danseatonbusiness@gmail.com` has role `starter`. The RPC `public.get_assets_for_user` (and sibling `get_asset_for_user_by_ticker`, `get_themes_for_user`) gates score visibility:

```sql
_show_scores boolean := _plan IN ('premium', 'enterprise', 'admin');
...
CASE WHEN _show_scores THEN b.computed_score::numeric ELSE NULL END,
CASE WHEN _show_scores THEN b.hybrid_score::numeric  ELSE NULL END,
```

Verified by calling the RPC: it returned `computed_score: NULL, hybrid_score: NULL` for every row.

The frontend (`src/pages/AssetRadar.tsx`, 5 occurrences) then does:

```ts
const score = asset.hybrid_score ?? asset.computed_score ?? 50;
```

→ Every asset displays as **50 / Neutral** for free, lite, starter, and pro users. Only premium/enterprise/admin see real scores. This is consistent with the user report.

### Decision needed

Two clean fixes; pick one (or both):

**Option A — Loosen the RPC gate** (fastest, matches what most SaaS does)
Allow `starter` and `pro` to see scores too. Keep `free` gated (or show only the 3 demo tickers' scores). Edit `_show_scores` predicate in the three RPCs.

**Option B — Fix the frontend fallback** (defense in depth)
Replace `?? 50` with explicit handling: if score is `null`, render an "Upgrade to see score" pill / lock badge instead of a fake 50. Apply to AssetRadar plus any other place reading `computed_score`.

Recommended: **A + B together**. A unblocks paying Starter customers immediately; B prevents future "fake 50" confusion if any plan ever has scores hidden again.

### Open questions for you

1. Which plans should see real scores? Current code says only premium+. The Starter user paying for the product clearly expects to see scores.
2. For free users, should they see real scores on the 3 demo tickers (F, VTI, EUR/USD) or stay locked behind the upgrade overlay?
3. Should `expected_return` and `score_explanation` follow the same gating as the score itself, or stay premium-only?

### Things explicitly ruled out

- ❌ Not a cron failure (all jobs active, last run minutes ago)
- ❌ Not stale data (assets.score_computed_at = ~1 min ago)
- ❌ Not an API key / billing issue (TwelveData credits flowing, Gemini/Lovable AI working — see compute-asset-scores logs showing 493 assets ranked, sector percentiles computed, volatility computed)
- ❌ Not the breaking-news pipeline (signals generating; `generate-signals-from-breaking-news-hourly` active; `map-signal-to-theme-15min` mapped 1000 signals successfully 5 min ago)
- ❌ Not RLS on the `assets` table (RPC returns rows, just with nulled score columns)

Confirm which option(s) you want and which plans should see scores, and I'll implement.