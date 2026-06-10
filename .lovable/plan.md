# Anonymous-Equals-Free Refactor

Make anonymous visitors render the same pages, sidebar, and blur model as logged-in Free users. Interactive actions open the auth modal in signup mode instead of redirecting to `/pricing` or `/auth`. Single commit.

## 1. Data-layer approach: **B (frontend branching)**

Chosen over A. Reasoning:
- All `get_*_for_user` RPCs are `SECURITY DEFINER` with `auth.uid()` checks that gate per-user data. Loosening them to return public payloads on null `auth.uid()` widens the security boundary and contradicts the Phase 6 RLS work that is explicitly out of scope.
- `get_public_preview` already exists and returns exactly the demo/blurred shapes the pages need.
- Branching lives in 5 page-level data hooks (AssetRadar, Themes, TradingSignals, dashboard cards, AssetDetail). No SQL migration needed. Smaller blast radius and zero risk of leaking authenticated payloads.

Mechanism: each affected page checks `isAnonymous`. If anonymous, it consumes `usePublicPreview()` and maps `demo_assets + blurred_assets`, `demo_themes + blurred_themes`, `demo_signal` into the same row/card shapes the existing UI renders, with the existing blur flag forced on for blurred entries (reusing the `is_demo_only` / `demo_tickers` logic already in `planLimits`).

## 2. Files to modify (~20)

**Auth / shell**
1. `src/hooks/useAuth.ts` — when `session` is null: `userPlan='free'`, `planLoading=false`, expose `isAnonymous()` (true only when no session), keep `isFree()` true for both anon and Free, `hasPaidPlan()` false for anon, `limits()` returns `PLAN_LIMITS.free`.
2. `src/components/AppSidebar.tsx` — delete `publicItems` branch and `groupLabel` swap. Always render the 11-item `navigationItems`. Footer logic unchanged (already correct for both auth states).
3. `src/App.tsx` — delete `AuthSwitch`, route `/asset-radar`, `/themes`, `/trading-signals` directly to the real components inside `AppShell`. Remove the wrapping `ProtectedRoute` from `/dashboard`, `/assistant`, `/alerts`, `/watchlist`, `/bots`, `/asset/*`, `/settings`. Keep `ProtectedRoute requireAdmin` on `/admin`, `/api-usage`, `/ingestion-health`, `/data-ingestion`, `/pipeline-tests`. Mount `<StickySignupBar />` inside `AppShell` (renders only when `!isAuthenticated`). Add a `/settings` → `/asset-radar` redirect for anon.
4. `src/components/conversion/StickySignupBar.tsx` — already self-gates on `isAuthenticated`; just confirm the global mount works (no behavior change).

**Page-level anonymous data branching**
5. `src/pages/AssetRadar.tsx` — when anon, source rows from `usePublicPreview` (demo_assets + blurred_assets mapped to the radar row shape); tab visibility and blur are already governed by `planLimits.free` + `isDemoModeForClass`. Replace any `/pricing` navigation with `openAuthModal('signup')` when anon.
6. `src/pages/Themes.tsx` — anon: render demo + blurred themes from preview payload; click handlers → auth modal.
7. `src/pages/TradingSignals.tsx` — anon: render `demo_signal` plus blurred teaser rows from preview payload; replace PaywallModal `/pricing` link with `openAuthModal('signup')` when anon.
8. `src/pages/Home.tsx` (dashboard) — anon: render the same Free dashboard. The dashboard cards already render Free's blur model; they need an anon fallback for data fetch.
9. `src/components/dashboard/TopAssetsCard.tsx`, `TopThemesCard.tsx`, `SignalSpotlight.tsx`, `MarketRadar.tsx`, `FollowedThemesCard.tsx` — when anon, swap their `get_*_for_user` query for the matching slice of `usePublicPreview`. No layout change.

**Self-scoped pages**
10. `src/pages/Watchlist.tsx` — anon: render header `0 / 3 slots`, empty list, "Add to watchlist" CTA → `openAuthModal('signup', { ref: 'watchlist_add' })`. Skip the `watchlist` table fetch entirely when anon.
11. `src/pages/Alerts.tsx` — anon: render same locked form Free sees; intercept submit / locked-overlay click → `openAuthModal('signup', { ref: 'alerts_create' })`. Skip the alerts fetch when anon.
12. `src/pages/Assistant.tsx` + `src/components/AIAssistantChat.tsx` — anon: chat UI + suggested prompts visible, counter shows `0/3`. Send button and prompt-click handlers branch on `isAnonymous` and open auth modal with `ref: 'assistant_send'`.
13. `src/pages/Bots.tsx` — verify anon renders the same waitlist form Free sees (no plan-gated fetches). If a fetch requires auth, short-circuit it for anon.

**Interaction CTAs**
14. `src/components/conversion/TierCeiling.tsx` — for anon, replace `<Link to={href}>` with a `<Button onClick={openAuthModal('signup', { ref: trackingLabel })}>`. Keep the existing Link path for authenticated users.
15. `src/lib/getUpgradeCTA.ts` — leave `getCTAHref` for authenticated paths; add an `openCTA(isAuthenticated, userPlan, trackingLabel)` helper or, simpler, keep `getCTAHref` as-is and let callers decide. (TierCeiling and PaywallModal change directly; getCTAHref's `/auth?mode=signup` return path is dead code for anon once callers switch — leave file untouched to keep diff small.)
16. `src/pages/Pricing.tsx` — anon click on any tier → `openAuthModal('signup', { ref: 'pricing_<tier>' })` instead of Stripe checkout call.
17. `src/components/PaywallModal.tsx` — if anon, primary CTA opens auth modal instead of routing to `/pricing`.

**Cleanup (same commit, after verification)**
18. Delete `src/pages/public/PublicAssetRadar.tsx`
19. Delete `src/pages/public/PublicThemes.tsx`
20. Delete `src/pages/public/PublicTradingSignals.tsx`

**Memory**
21. Update `mem://constraints/preview-first-funnel` to the new wording supplied in the prompt.

**Kept**: `get_public_preview` RPC (used by Approach B), `/auth` route as fallback redirect, AuthContext, AuthModalContext, AuthForm, AuthModal visuals, LockedPreview/BlurredUpgradeOverlay/BlurCell APIs, `planLimits.ts` (incl. the Starter fix), Landing page, admin route protection, Phase 6 RLS/edge-auth boundaries.

## 3. Risk / guardrails

- Any `for_user` RPC stays locked; no SQL changes. Anonymous payloads only ever come from `get_public_preview`.
- File count target ~20, hard ceiling 30. If a dashboard card or `AIAssistantChat` requires deeper restructuring than a single anon-branch, I stop and report instead of pushing past 30.
- `useAuth().planLoading` currently never resolves when there's no user; the fix in (1) sets `planLoading=false` immediately for anon so `ProtectedRoute` removal doesn't strand admin paths.
- Sticky bar mounts once inside `AppShell`; the three Public* pages currently mount their own — those mounts disappear with the files in (18)-(20), so no double-render.

## 4. Verification plan

Build + targeted reads after edits. Browser verification of the 23 user-listed steps is reported back for user-side walkthrough; I confirm steps 1-8, 12, 22-23 in preview (the deterministic, observable ones) and flag any that need a live signup to test.

## 5. Out of scope

Auth contexts, AuthForm internals, AuthModal visuals, LockedPreview/TierCeiling/BlurCell APIs, Phase 6 security, planLimits values, Landing, admin routes, `/auth` fallback.
