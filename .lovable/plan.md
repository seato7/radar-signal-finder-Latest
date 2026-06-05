# Public Preview Architecture — Implementation Plan

## 1. Decision: Conditional Public Routes (NOT new /preview routes)

**Chosen approach:** Make `/asset-radar`, `/trading-signals`, `/themes` conditionally public. The existing pages already render the Phase 5A blur model for `userPlan === "free"`. By removing the `ProtectedRoute` wrapper and treating anonymous as "free", we get the exact same surface with zero code duplication.

**Why not new `/preview` routes:** AssetRadar (1076 lines), TradingSignals (623), Themes (701) each have their own data hooks, query state, and blur logic. Mirroring them would create two divergent surfaces — guaranteed drift, double the maintenance, and breaks the "real product, real data, real restrictions" requirement.

**Risk:** These pages currently assume an authenticated session in places (RLS queries, watchlist hooks, AI hooks). Anonymous requests to RLS-protected tables may return empty arrays instead of demo data. **I will audit each page's queries before flipping the gate** and report what I find — if anonymous-vs-authed-free returns different data, that's a blocker and I'll stop and surface it rather than silently shipping a broken preview.

## 2. Routing changes (`src/App.tsx`)

Move these out of the `<ProtectedRoute>` block, into a new public block that still uses the sidebar layout:

- `/asset-radar` → public
- `/trading-signals` → public
- `/themes` → public

Stay auth-gated: `/dashboard`, `/watchlist`, `/alerts`, `/assistant`, `/settings`, `/admin`, `/api-usage`, `/ingestion-health`, `/data-sources`, `/bots`, `/analytics`, `/data-ingestion`, `/pipeline-tests`, `/asset/*` (detail pages — these expose paid data and are not in scope).

Sidebar (`AppSidebar`) needs an anonymous-mode variant: show only the public links + a "Sign in" CTA at the bottom. Without this, anonymous visitors see a sidebar of broken links.

## 3. Session-aware CTA utility (`src/lib/getUpgradeCTA.ts`)

New file exporting:

```ts
getCTAText(isAuthenticated, userPlan, context?) // "Start Free Access" | "Upgrade to Starter" | "Upgrade to Pro" | "Upgrade to Premium"
getCTAHref(isAuthenticated, userPlan)           // "/auth" | "/pricing"
getLockTooltip(isAuthenticated, fieldType)      // "Score visible with Free Access" | "Score visible with Starter"
getProgressionLabel(...)                        // "Viewing 3 of 26,000+ assets. Start Free Access..." etc.
```

This composes with the existing `getUpgradeTarget()` for logged-in users — does NOT replace it.

## 4. Primitives updated to consume the utility

- `src/components/conversion/LockedPreview.tsx` — read `useAuth()` internally; pick CTA text/href via utility. New optional `fieldType` prop (`"score" | "price" | "pnl" | "generic"`) drives the tooltip text.
- `src/components/conversion/TierCeiling.tsx` — same treatment.
- `src/components/BlurredUpgradeOverlay.tsx` — same.
- Sticky bar in `src/pages/Landing.tsx` — already uses "Start Free Access" since user is anonymous on Landing; no change needed there.

Because all 8 files that reference "Upgrade to Starter/Pro/Premium" route through these primitives or through `getUpgradeTarget`, the global swap happens automatically.

## 5. Progression framing labels

New tiny component `src/components/conversion/ProgressionLabel.tsx`. Mounted at the top of:

- AssetRadar table: "Viewing 3 of 26,000+ assets. [Start Free Access] to track unlimited."
- Themes grid: "Viewing 1 of 72 themes with full data. [Start Free Access]."
- TradingSignals list: "1 signal visible. 21 hidden. [Start Free Access] to see all."

Copy swaps to "Upgrade to Starter" for logged-in Free via the utility.

## 6. Tooltip orientation copy

`LockedPreview` already wraps blurred content in a `<Tooltip>`. Extend its `tooltipText` resolution to use `fieldType` + session state. Audit the three pages and pass `fieldType="score" | "price" | "pnl"` at each call site.

## 7. Activation speed (demo data)

I will inspect what each page renders for `userPlan === "free"` with no session:

- **AssetRadar**: confirm the 3 demo tickers (F, VTI, EUR/USD) come from a public query or RLS-readable row set. If gated behind authenticated RLS, will need a public RPC or `anon`-readable demo flag — **I will report findings before changing schema**.
- **TradingSignals**: same audit on the demo signal.
- **Themes**: same audit on the Congressional Bipartisan Trading theme.

If any demo data is unreachable anonymously, I will **stop and surface the blocker** rather than fabricate fake data or relax RLS unilaterally — per your no-mock-data and security rules.

## 8. Out of scope (untouched)

- Phase 5A blur primitives' internals (intensity, demo dataset definition)
- Phase 6 RLS / auth / RPC security
- Auth flow, Stripe, pricing page, plan limits
- Landing page copy (already updated last commits)
- `/asset/*` detail pages — paid surface, not in the public preview scope you listed

## 9. Files modified (estimate)

1. `src/App.tsx` — route gating
2. `src/components/AppSidebar.tsx` — anonymous variant
3. `src/lib/getUpgradeCTA.ts` — NEW
4. `src/components/conversion/LockedPreview.tsx` — session-aware CTA + tooltip
5. `src/components/conversion/TierCeiling.tsx` — session-aware CTA
6. `src/components/BlurredUpgradeOverlay.tsx` — session-aware CTA
7. `src/components/conversion/ProgressionLabel.tsx` — NEW
8. `src/pages/AssetRadar.tsx` — mount ProgressionLabel, pass fieldType to LockedPreview, treat anonymous as free
9. `src/pages/TradingSignals.tsx` — same
10. `src/pages/Themes.tsx` — same
11. `src/pages/Landing.tsx` — re-point preview links from `/auth` to `/asset-radar` where appropriate

## 10. Verification I will perform before declaring done

- Build passes (I will NOT auto-fix type errors per your rule; if they appear I stop and report)
- Manual route test in preview: anonymous load of `/asset-radar`, `/trading-signals`, `/themes` does not redirect to `/auth`
- Anonymous CTA copy is "Start Free Access" everywhere via grep
- Audit query: confirm anonymous queries return demo data, or report the blocker
- Screenshot anonymous + logged-in Free side-by-side on `/asset-radar` to verify CTA copy delta
- Lighthouse first-paint estimate on `/asset-radar` anonymous

## Open questions before I proceed

1. **Anonymous data access blocker**: If the audit in §7 finds demo data is RLS-blocked for anon, what would you like? (a) I stop and report, you decide on policy. (b) I propose a minimal RLS read-only policy for `is_demo = true` rows and you approve before migration. **My default is (a).**
2. **Sidebar for anonymous**: OK to show the sidebar with just `/asset-radar`, `/trading-signals`, `/themes`, `/pricing`, and a prominent "Sign in" button, or do you want a stripped header-only chrome on public preview routes?
3. **`/asset/*` detail pages**: You did not list these. Confirm they stay auth-gated (clicking a ticker on the public radar would route an anon user to `/auth`).
4. **Signup route**: Spec says route anonymous CTAs to `/auth/signup`. The existing route is `/auth` (single page with both login + signup tabs). Do you want me to add `?mode=signup` query param so `/auth` auto-selects the signup tab, or just route to `/auth`?

Awaiting your answers on these four before implementation.
