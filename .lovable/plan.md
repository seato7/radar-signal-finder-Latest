## Goal

Starter tier keeps full Stock access but additionally sees ETF and Forex tabs in demo-only mode (VTI / EUR/USD unblurred, rest blurred). Free, Pro, Premium, Enterprise, Admin untouched.

## Files modified

### 1. `src/lib/planLimits.ts`

- Add optional field to `PlanLimits` interface:
  ```ts
  asset_radar_demo_classes?: string[];
  ```
- Update `starter`:
  ```ts
  starter: {
    active_signals: 1,
    ai_messages_per_day: 5,
    alerts: 1,
    watchlist_slots: 3,
    themes: 1,
    asset_radar_classes: ['stock', 'etf', 'forex'],
    asset_radar_demo_classes: ['etf', 'forex'],
    demo_tickers: ['VTI', 'EUR/USD'],
    show_scores: true,
    show_sentiment: false,
    analytics_access: false,
    full_dashboard: false,
  },
  ```
- Add helper export:
  ```ts
  export function isDemoModeForClass(planLimits: PlanLimits, classType: string | null | undefined): boolean {
    if (planLimits.is_demo_only) return true;
    if (classType && planLimits.asset_radar_demo_classes?.includes(classType)) return true;
    return false;
  }
  ```
- No changes to free / pro / premium / enterprise / admin.

### 2. `src/pages/AssetRadar.tsx`

Replace the hardcoded blur check at lines 927–929:
```ts
const isFreeUser = userPlan === "free";
const isDemoTicker = ["F", "VTI", "EUR/USD"].includes(asset.ticker);
const blurData = isFreeUser && !isDemoTicker;
```
with plan-aware logic using the new helper:
```ts
const assetClass = asset.asset_class ?? null;
const demoMode = isDemoModeForClass(planLimits, assetClass);
const demoTickers = planLimits.demo_tickers ?? [];
const isDemoTicker = demoTickers.includes(asset.ticker);
const blurData = demoMode && !isDemoTicker;
```
Add `isDemoModeForClass` to the import from `@/lib/planLimits`.

Behavior matrix this produces:
- Free: `is_demo_only=true` → `demoMode=true` for every row, demo tickers `[F, VTI, EUR/USD]` unblurred. Identical to today.
- Starter on Stock tab: not in demo list, `is_demo_only` unset → `demoMode=false`, all rows unblurred.
- Starter on ETF tab: `'etf'` in demo list → `demoMode=true`, only VTI unblurred.
- Starter on Forex tab: `'forex'` in demo list → only EUR/USD unblurred.
- Pro / Premium / Enterprise / Admin: neither flag set → no rows blurred.
- Crypto / Commodity tabs for Starter: still locked by existing `isTabLocked` (not in `asset_radar_classes`), unchanged overlay behavior.

## Not touched

- `supabase/functions/_shared/plan-limits.ts` (visibility-only field, frontend enforced).
- Free / Pro / Premium / Enterprise / Admin tier configs.
- `is_demo_only` semantics (still the global switch used by themes, signals, etc.).
- Themes, Trading Signals, Watchlist, Assistant gating.
- Backend RPCs.

## Verification (manual, by user)

Steps 1–9 in the prompt: Starter sees 3 tabs with Stock fully open and ETF/Forex demo-blurred; Free unchanged; Pro/Premium unchanged.
