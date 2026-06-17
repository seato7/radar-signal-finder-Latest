# Phase B: Copy + Routing + Modal Pattern

Three bundled changes in a single commit. No design tokens, fonts, colors, shadcn primitives, RLS, RPCs, or edge functions touched.

## Task 1 — Copy changes

The Phase B Copy Spec attachment was not provided. I will execute the copy edits that are explicitly inlined in the prompt body, and flag the rest as out-of-scope until the spec arrives:

**Applied verbatim from prompt:**
- `src/pages/Alerts.tsx:39` banner → "Get notified when scores change. Sign up free." with button label "Get Started Free".
- Auth modal headlines (Section N): **CANNOT APPLY** — Section N strings were not included. Will leave AuthModal copy untouched and flag in report.
- `src/pages/Landing.tsx:259` secondary hero: grep current text; if it duplicates the primary CTA, retarget per Task 2 and apply After (not provided → leave string, only flip route). If it reads as "See how it works" or similar non-converting label, leave string and route both untouched per prompt rule.
- `src/pages/Help.tsx:537`, `src/pages/Pricing.tsx:252`, `src/pages/Pricing.tsx:391` trial references: inspect each call site. If onClick goes straight to Stripe Checkout (`manage-payments` invoke / checkout URL), keep trial copy. If it routes through `/auth` or `openAuthModal('signup')` first, replace with "Get Started Free".

**Not applied (spec missing):** Sections A–M and O strings. Will report the unapplied rows so Dan can resend the spec for a follow-up commit. No "(unchanged)" or Section O strings will be touched either way.

## Task 2 — Route migration (/asset-radar → /dashboard)

Flip destination only, keep visible label unless the prompt overrides it.

| File | Line | Change |
|---|---|---|
| `src/App.tsx` | 100 | SettingsRoute anon redirect → `/dashboard` |
| `src/pages/Auth.tsx` | 22 | Authenticated-fallback navigate → `/dashboard` |
| `src/pages/Landing.tsx` | 233 | Header "Sign In" link → `/dashboard` |
| `src/pages/Landing.tsx` | 241 | Hero primary CTA → `/dashboard` |
| `src/pages/Landing.tsx` | 259 | Secondary hero → `/dashboard` |
| `src/pages/Landing.tsx` | 316 | Mid-page CTA → `/dashboard` |
| `src/pages/Landing.tsx` | 705 | Footer CTA → `/dashboard` |
| `src/hooks/useAnalytics.ts` | 14 | Add `/dashboard` page-view trigger alongside existing `/asset-radar` |

**Explicitly NOT changed:** `Watchlist.tsx:195`, `Themes.tsx:679`, `TopAssetsCard.tsx:118` stay pointing at `/asset-radar`.

## Task 3 — Navigate-then-modal pattern

Replace every anonymous-only `openAuthModal('signup', { ref })` call site with:

```ts
const { pathname } = useLocation();
const handleAnonCTA = (ref: string) => {
  if (pathname !== '/dashboard') navigate('/dashboard');
  openAuthModal('signup', { ref });
};
```

Authenticated Free users keep their existing `/pricing` route — only the anonymous branch changes. Preserve the existing tracking `ref` string at each site.

Affected files (anon branches only):
- `src/components/conversion/TierCeiling.tsx`
- `src/components/PaywallModal.tsx`
- `src/components/AIAssistantChat.tsx` (handleSend + initial-query effect)
- `src/pages/Watchlist.tsx` (Add Asset)
- `src/pages/Alerts.tsx` (Create Alert)
- `src/pages/AssetRadar.tsx` (add-to-watchlist, blurred-cell handlers)
- `src/pages/Themes.tsx` (subscribe)
- `src/pages/TradingSignals.tsx` (Upgrade plan)
- `src/components/dashboard/TopAssetsCard.tsx`
- `src/components/dashboard/TopThemesCard.tsx`
- `src/components/dashboard/SignalSpotlight.tsx`
- `src/components/dashboard/MarketRadar.tsx`
- `src/components/dashboard/FollowedThemesCard.tsx`

For components that don't already pull `useLocation`/`useNavigate`, add the imports from `react-router-dom`.

## Task 4 — Memory update

Rewrite `mem://constraints/preview-first-funnel` to the exact wording supplied in the prompt and update the index entry's one-liner to match.

## Deliverables in the build response

1. Unified diff covering every modified file.
2. Per-file summary mapping each edit to Task 1/2/3.
3. Confirmation no design tokens / fonts / colors / shadcn primitives changed.
4. Confirmation no Phase 6 RLS / RPC / edge-function code changed.
5. Interpretation log: Landing.tsx:259 grep result + decision, Help/Pricing trial-language decisions per call-site inspection, and the Section A–N copy rows left untouched because the spec text wasn't supplied.

## Open question before build

Section N (auth modal headlines) and Sections A–M/O strings were referenced but not pasted. I will proceed without them and flag the gap in the report, unless you'd rather resend the spec first so the copy pass and the routing/modal pass ship together.
