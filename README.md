# InsiderPulse

> AI-powered market signal discovery platform. Track themes, surface opportunities, get scored insights across stocks, ETFs, forex, crypto, and commodities.

**Live at:** [insiderpulse.org](https://insiderpulse.org)

InsiderPulse is a **data tool**, not a financial advisor. We provide general market information and analytical signals; we do not provide personalised investment advice or recommend specific transactions.

---

## What it does

InsiderPulse combines breaking-news sentiment, theme-based clustering, and AI-driven scoring to surface market opportunities across asset classes. Users can:

- **Browse Asset Radar** — score-ranked view of 16,000+ assets across stocks, ETFs, forex, crypto, and commodities
- **Subscribe to themes** — receive alerts when scores cross thresholds on themes you care about (e.g. AI infrastructure, energy transition, defence)
- **Track active signals** — see entry prices, projected returns, and signal explanations for high-confidence trade ideas
- **Build a watchlist** — pin tickers for quick access
- **Chat with the AI Assistant** — ask questions about themes, signals, and market opportunities; get structured analysis (no advice)

---

## Plan tiers

All prices in USD.

| Tier | Monthly | Annual | Trial | Asset access | AI msgs/day | Watchlist | Alerts |
|---|---|---|---|---|---|---|---|
| **Free** | $0 | $0 | — | 3 demo tickers | 1 | 1 | 0 |
| **Starter** | $9.99 | $89/yr | 7 days (monthly only) | Stocks | 5 | 3 | 1 |
| **Pro** | $34.99 | $299/yr | — | Stocks + ETFs + Forex | 20 | 10 | 5 |
| **Premium** | $89.99 | $799/yr | — | All 5 asset classes | Unlimited | Unlimited | Unlimited |
| **Enterprise** | Contact | Contact | — | All 5 asset classes | Unlimited | Unlimited | Unlimited |

**Notes:**
- Free demo tickers are F (Ford), VTI (Vanguard Total Stock Market ETF), and EUR/USD.
- The 7-day free trial is **only available on Starter Monthly**. Starter Annual, Pro, and Premium have no trial. Card required for trial.
- Premium adds sentiment analysis, full analytics access, and full dashboard. Trading Bots are listed in the UI as Coming Soon.
- Enterprise contact: [support@insiderpulse.org](mailto:support@insiderpulse.org).
- Cancel anytime through the Stripe customer portal accessible from Settings.

Plan gating is enforced at the database layer via `BEFORE INSERT` triggers and SECURITY DEFINER RPCs that resolve the user's plan server-side from `auth.uid()`. Caller-supplied plan parameters cannot widen access.

---

## Architecture

| Layer | Technology |
|---|---|
| **Frontend** | React, Vite, TypeScript, Tailwind, shadcn/ui |
| **Frontend hosting** | Lovable |
| **Backend (lightweight)** | Supabase Edge Functions (Deno + TypeScript) |
| **Backend (heavy compute)** | Railway-hosted Python/FastAPI |
| **Database** | PostgreSQL via Supabase |
| **Scheduled jobs** | `pg_cron` (77 active cron jobs covering price ingestion, scoring, signal generation, theme mapping, alert distribution) |
| **Auth** | Supabase Auth (asymmetric JWT signing keys) |
| **Payments** | Stripe (live mode) |
| **AI (text)** | Google Gemini 2.5 Flash, called directly |
| **AI (image generation)** | Lovable AI Gateway (`gemini-2.5-flash-image-preview`), used by chat-assistant only |
| **Web search** | Tavily (conditional) and Firecrawl (always for chat-assistant context) |

---

## Repository layout

```
.
├── src/                          # React frontend
│   ├── pages/                    # Route components (Pricing, Dashboard, AssetRadar, etc.)
│   ├── components/               # Reusable UI components
│   ├── hooks/                    # React hooks (useAuth, useAddToWatchlist, etc.)
│   ├── lib/                      # Utilities, plan limits, Supabase client
│   └── integrations/supabase/    # Generated Supabase types
├── supabase/
│   ├── functions/                # Edge functions
│   │   ├── chat-assistant/       # AI chat backend (Gemini + Firecrawl + Tavily)
│   │   ├── manage-payments/      # Stripe checkout, portal, webhook
│   │   ├── manage-alert-settings/  # Alerts subscribe/unsubscribe
│   │   ├── _shared/              # Shared modules (gemini.ts, plan-limits.ts, etc.)
│   │   └── ...                   # ~30 more functions for ingestion, scoring, signal generation
│   └── migrations/               # Audit log of applied DB migrations
├── CONTRIBUTING.md               # Development workflow (read before contributing)
└── README.md                     # This file
```

---

## Setup

This project does not support full local development. Schema changes are applied to production via Lovable; frontend changes are previewed in Lovable's hosted environment.

If you have access to the project:

1. Open the project in [Lovable](https://lovable.dev/) for frontend changes
2. Use Claude Code in your terminal for application code work
3. Read `CONTRIBUTING.md` to understand the workflow before making any changes

To clone the repo (for read-only inspection):

```bash
git clone https://github.com/seato7/radar-signal-finder-Latest.git
cd radar-signal-finder-Latest
npm install
```

---

## Development workflow

Two paths for changes:

- **Schema (RPCs, RLS, triggers, tables)** → Lovable applies and auto-pushes migration to GitHub
- **Application code (frontend, edge functions)** → Claude Code commits to GitHub, Lovable Publish deploys

Full details in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Compliance & legal

InsiderPulse follows the TradingView/Finviz compliance model. We are a data tool, not a financial advisor. The site does not provide personalised investment advice, does not recommend specific securities, and does not execute trades.

- **Privacy Policy:** [insiderpulse.org/privacy](https://insiderpulse.org/privacy)
- **Terms of Service:** [insiderpulse.org/terms](https://insiderpulse.org/terms)
- **Operating entity:** Daniel Seaton (sole trader, ABN 41 859 964 692, Brisbane QLD, Australia)

---

## Status

Site is live at [insiderpulse.org](https://insiderpulse.org). As of 8 May 2026 the platform is feature-complete for v1.0 with paying customers actively using:

- Stripe checkout and trial flow (signup → trial → role auto-update)
- AI Assistant with rate limiting (server-side enforced via `increment_ai_usage` RPC)
- Theme subscription and alert delivery
- Score visibility for all paid plans tied to asset class access
- Watchlist management with plan-gated slot limits
- Multi-step Stripe cancellation retention flow (pause/downgrade options)

---

## Support

For bug reports, feature requests, or general questions: contact [danseaton7@gmail.com](mailto:danseaton7@gmail.com).

---

*© 2026 InsiderPulse. Confidential.*