# Contributing to InsiderPulse

This document describes the development workflow for InsiderPulse. Read it before making any changes — the workflow is non-obvious and the wrong path causes silent production drift.

---

## Architecture overview

- **Frontend:** React/Vite/TypeScript, deployed via [Lovable](https://lovable.dev/)
- **Backend:** Supabase Edge Functions (Deno/TypeScript) + PostgreSQL with `pg_cron`
- **Heavy compute:** Railway-hosted Python/FastAPI service
- **Payments:** Stripe (live mode)
- **AI:** Google Gemini (`gemini-2.5-flash`) for all text generation, called directly via `GEMINI_API_KEY`
- **Image generation:** Lovable AI Gateway (`google/gemini-2.5-flash-image-preview`), only used by `chat-assistant` for image/chart generation
- **Web search:** Tavily (conditional, when message contains a ticker or market keyword) and Firecrawl (always for chat-assistant context)
- **Repo:** [seato7/radar-signal-finder-Latest](https://github.com/seato7/radar-signal-finder-Latest)

---

## The two paths for changes

There are two distinct paths for making changes. Using the wrong path causes drift between the GitHub repo and production.

### Path A: Schema changes (RPCs, RLS policies, triggers, tables, columns, migrations)

**Send to Lovable.** Lovable applies the change to production AND auto-pushes the migration file to GitHub via bidirectional sync.

Examples:
- Adding/modifying a database table
- Creating or updating an RPC function
- Adding RLS policies
- Creating triggers
- Modifying enum types
- Cron job schedule changes (in `cron.schedule()`)

**Do not** ask Claude Code to author migration files. If Claude Code drafts SQL, paste the SQL into a Lovable prompt asking Lovable to apply it. Then delete any Claude-Code-authored `.sql` file from the repo to prevent the illusion that GitHub's `supabase/migrations/` reflects production.

### Path B: Application code (frontend, edge functions, business logic)

**Send to Claude Code** in your terminal. Claude Code commits to GitHub, then click Publish in Lovable to deploy.

Examples:
- React components and pages (`src/`)
- Edge function logic (`supabase/functions/`)
- TypeScript utilities and hooks
- Frontend state management
- API client wrappers

### Mixed work

If a feature needs both schema changes and application code, do them in parallel:
- Application code → Claude Code
- Schema changes → Lovable
- Coordinate via the chat where you orchestrate the work

---

## Why this split exists

In May 2026 we discovered that Lovable's migration tool maintains its own auto-versioned `supabase_migrations.schema_migrations` table. **It does not read or execute SQL files committed to GitHub.** Pushing a migration to GitHub does nothing on its own. We had three migrations in the repo that were never applied to production:

- `20260429000001_score-visibility-and-search-gating.sql` — score visibility broken silently for over a week
- `20260505000001_alerts_rls_user_insert.sql`
- `20260506000001_plan_limit_triggers.sql`

This caused real customer-facing bugs (every paying user saw fake `50` scores for every asset, the watchlist add button was a fake toast that never wrote to the database). After the discovery we adopted the schema-via-Lovable / code-via-Claude-Code split. The repo's `supabase/migrations/` directory is now an audit log of what is applied, not a deploy queue.

---

## Verifying changes deployed

After any session, check the GitHub commits page:

```
https://github.com/seato7/radar-signal-finder-Latest/commits/main
```

Look for new commits attributed to:
- `lovable-dev[bot]` (Lovable's bidirectional sync)
- Your own committer identity (Claude Code commits)

If a Lovable session ended without a corresponding bot commit, the GitHub connector has drifted or disconnected. Reconnect via the Lovable Connectors menu.

For schema verification, query production directly via Lovable:

```sql
-- Check if a function exists
SELECT proname FROM pg_proc WHERE proname = '';

-- Check if a trigger exists  
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = '';

-- Check applied migrations
SELECT version FROM supabase_migrations.schema_migrations
WHERE version > ''
ORDER BY version;
```

Never trust a deployment claim without empirical verification.

---

## Common pitfalls

### Auth context swap with `supabase-js` v2

When an edge function uses `auth.getClaims()` instead of `auth.getUser()`, subsequent database writes from the same client go out as the **authenticated user**, not as service-role. This means:

- RLS policies must allow the authenticated user to perform the operation
- Service-role-only RLS policies will silently block writes
- Pattern: rely on `auth.uid() = user_id` RLS policies for user-owned writes after `getClaims()`

If a function suddenly starts returning unexpected RLS denials after migration to `getClaims()`, this is the cause.

### Latent bug cascade

After fixing an infrastructure-level bug (auth, missing RPC, broken policy), expect three to five latent bugs to surface immediately. Each was hidden by the layer above failing. Budget time after every infrastructure fix to chase the cascade.

### Diagnostic logging beats guessing

When a function fails for unclear reasons, ship structured logging FIRST, then fix on the next reproduction. The `logStep` helper in critical edge functions (`chat-assistant`, `manage-alert-settings`, `manage-payments`) is the pattern. Hours of speculation produce nothing useful; one good log line solves the problem in minutes.

### Plan limit enforcement lives in the database

User-resource creation paths (alerts, watchlist tickers) write directly to tables from the browser. Function-only checks do not protect these paths. The actual enforcement lives in `BEFORE INSERT` triggers on the `alerts` and `watchlist` tables (with `service_role` bypass for cron jobs). Edge function 403s with `current/limit/plan` fields exist for clean upgrade-CTA UX on the legitimate caller path, but they are not the security boundary.

If you change plan limits, update three places consistently:
- `src/lib/planLimits.ts` (frontend)
- `supabase/functions/_shared/plan-limits.ts` (edge functions)
- The `_plan_alert_limit` and `_plan_watchlist_slot_limit` SQL helper functions (DB)

### `manage-payments` and `planLimits.ts` have separate feature schemas

The `PLANS` array in `supabase/functions/manage-payments/index.ts` has its own feature set (`max_bots`, `backtest_days`, `live_trading`, `exports`, `analytics`) that doesn't share keys with `src/lib/planLimits.ts`. Both files are correct for their own uses, but if you copy values from one assuming they match the other, you will introduce drift. Always check both when changing plan-related copy or behaviour.

### Lite plan is deprecated

The `'lite'` role exists historically and may still appear in `_effective_plan` / `get_user_role` priority CASE for back-compat. New role assignments are blocked by a CHECK constraint (`user_roles_role_not_lite`, migration `20260420000002`). Do not add `lite` to any new logic. The five active tiers are Free, Starter, Pro, Premium, Enterprise.

### Free tier `asset_radar_classes` field is misleading

`src/lib/planLimits.ts` lists `['stock', 'etf', 'forex']` for Free, but the actual gating uses `is_demo_only: true` and `demo_tickers: ['F', 'VTI', 'EUR/USD']`. The radar RPC `get_assets_for_user` correctly filters Free users to those three tickers regardless of the class list. If you change Free tier logic, update the RPC, not just the planLimits field.

---

## Local development

This project does not currently support full local development against the production Supabase instance. Edge functions and migrations are applied to production via Lovable. Frontend changes can be previewed in Lovable's hosted preview environment before publishing.

For schema experiments, ask Lovable to apply changes to a test user (e.g. `danseatonbusiness@gmail.com` on the Starter plan) and verify in production with caution.

---

## Build tracker

Detailed session-by-session history of decisions, audits, and outstanding work is maintained by the project owner outside the repo. If you need historical context for a non-trivial change, ask the maintainer.

---

## Compliance framing

InsiderPulse is positioned as a **data tool**, not a financial advisor. This is a product-level decision that affects:

- All copy on the site (use neutral language: "scores", "signals", "data" — not "recommendations", "buy/sell advice")
- Privacy Policy and Terms of Service framing
- AI Assistant system prompt (must include "general market information only, not financial advice" caveat)

Reference: TradingView and Finviz follow this same compliance model. Do not regress to advisory language without explicit legal review.

The Pricing page footer references Australian regulatory language ("Product Disclosure Statement", "licensed financial adviser") despite USD pricing — InsiderPulse operates as an Australian sole trader serving an international audience. Do not remove the AU regulatory disclaimer copy without legal review.

---

## Questions?

Maintainer: Daniel Seaton (`danseaton7@gmail.com`)