# InsiderPulse Design System

**Mood:** Palantir × Bloomberg × Stripe × Linear.
Restrained operational intelligence. Information-dense, engineered, not "SaaS-rounded".

> **Phase 1 status:** Tokens defined here are loaded site-wide as `--ds-*` CSS variables and `ds-*` Tailwind utilities. **No existing components have been migrated yet.** Phases 2–4 will progressively apply these tokens to landing, dashboard chrome, and individual pages.

---

## 1. Color tokens

All colors are HSL channels stored in `src/index.css` under `:root`. Consume via Tailwind classes prefixed `ds-` (e.g. `bg-ds-surface`, `text-ds-text-secondary`, `border-ds-border`).

Brand colors are derived from `public/images/logo.png` — do not invent new brand hues.

| Token | Hex / HSL | Use |
|---|---|---|
| `ds-brand-primary` | `#00B0E0` (194 100% 44%) | Primary CTAs, focus rings, active nav |
| `ds-brand-secondary` | `#10D0D0` (180 86% 44%) | Accent gradients, secondary highlights |
| `ds-brand-primary-foreground` | 220 30% 6% | Text on `ds-brand-primary` |
| `ds-background` | 210 24% 5% | Page background (cool near-black) |
| `ds-surface` | 212 20% 8% | Panels, cards |
| `ds-surface-elevated` | 212 18% 11% | Modals, popovers, hover states |
| `ds-surface-overlay` | 212 16% 14% | Sticky headers, dropdowns |
| `ds-border` | white @ 10% | Default panel borders (low contrast) |
| `ds-border-strong` | white @ 20% | Emphasised dividers |
| `ds-border-focus` | brand primary | Focus rings |
| `ds-text-primary` | 210 20% 98% | High-contrast body text |
| `ds-text-secondary` | 210 15% 75% | Secondary copy |
| `ds-text-muted` | 210 12% 55% | Captions, meta |
| `ds-text-inverse` | 220 30% 6% | Text on light surfaces |

### Signal colors (financial semantics)

Restrained, professional — never neon. Read clearly on both `ds-background` and `ds-surface`.

| Token | HSL | Use |
|---|---|---|
| `ds-signal-positive` | 152 55% 45% | Gains, bullish |
| `ds-signal-negative` | 354 60% 55% | Losses, bearish |
| `ds-signal-warning` | 38 80% 52% | Caution (amber/gold, not yellow) |
| `ds-signal-neutral` | 215 10% 60% | No change |
| `ds-signal-info` | brand primary | Informational |

**Forbidden:** pure CSS named colors, `#00FF00`, `#FF0000`, neon greens/reds.

---

## 2. Typography

Two fonts loaded via Google Fonts in `index.html`:

- **Geist** — primary UI font. Stack: `'Geist', 'Söhne', system-ui, -apple-system, sans-serif`.
- **IBM Plex Mono** — data font. Stack: `'IBM Plex Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace`.

### Mono-only rule

`font-mono` (and the `text-data*` scale) is reserved for: **tickers, scores, percentages, timestamps, signal IDs, prices, dates**.

It is **never** used for body copy, nav labels, or buttons.

### Scale (Tailwind utilities)

| Class | Size | Line height | Tracking |
|---|---|---|---|
| `text-display` | 3.5rem | 1.05 | -0.04em |
| `text-h1` | 2.25rem | 1.1 | -0.03em |
| `text-h2` | 1.75rem | 1.15 | -0.025em |
| `text-h3` | 1.375rem | 1.25 | -0.02em |
| `text-h4` | 1.125rem | 1.35 | -0.015em |
| `text-body-lg` | 1.0625rem | 1.55 | -0.01em |
| `text-body` | 0.9375rem | 1.55 | -0.005em |
| `text-body-sm` | 0.8125rem | 1.5 | 0 |
| `text-caption` | 0.75rem | 1.4 | 0.01em |
| `text-overline` | 0.6875rem | 1.3 | 0.08em (uppercase) |
| `text-data-lg` | 1.125rem | mono | — |
| `text-data` | 0.9375rem | mono | — |
| `text-data-sm` | 0.8125rem | mono | — |
| `text-data-xs` | 0.6875rem | mono | — |

### Weights

400 (body), 500 (UI / buttons), 600 (headings, emphasis). 700 is reserved for `text-display`. **No 800/900.**

---

## 3. Spacing

> **Information-dense rhythm. Spacing should feel engineered, not empty.**

- 4px base unit (Tailwind default scale).
- Section padding: `py-16 md:py-24`. **Never `py-32+`** — that's startup-template whitespace.
- Card padding: `p-5` default, `p-6` for elevated surfaces.
- Grid gaps: `gap-3` mobile, `gap-4` desktop. Avoid `gap-6`/`gap-8`.

---

## 4. Border radius

> **Institutional, not rounded-SaaS.**

| Class | Value | Use |
|---|---|---|
| `rounded-ds-sm` | 4px | Badges, inline pills |
| `rounded-ds-md` | 6px | Buttons, inputs |
| `rounded-ds-lg` | 8px | Cards, panels |
| `rounded-ds-xl` | 10px | Large surfaces, modals |

**Hard rules:** nothing > 12px. `rounded-full` only for status dots and avatars. `--radius` (shadcn) stays at `0.5rem` (8px).

---

## 5. Elevation / shadows

> **Tight, not puffy. No SaaS glow.**

| Class | Use |
|---|---|
| `shadow-ds-xs` | Subtle hairline (1px bottom) |
| `shadow-ds-sm` | Input focus |
| `shadow-ds-md` | Cards |
| `shadow-ds-lg` | Popovers |
| `shadow-ds-elevated` | Modals |

No `shadow-2xl`-style giant glow shadows.

---

## 6. Motion

> **Motion serves usability only. No motion for decoration. Default to ease-out for enter, ease-in for exit. Avoid bounce/spring except for confirmation feedback.**

### Durations (CSS vars + Tailwind `duration-*`)

| Token | Value | Use |
|---|---|---|
| `--duration-instant` / `duration-instant` | 50ms | Micro-feedback |
| `--duration-fast` / `duration-fast` | 150ms | Hover, focus |
| `--duration-base` / `duration-base` | 200ms | Most transitions |
| `--duration-slow` / `duration-slow` | 300ms | Panel expansion |
| `--duration-deliberate` / `duration-deliberate` | 450ms | Emphasis transitions |

### Easings (Tailwind `ease-ds-*`)

| Token | Curve | Use |
|---|---|---|
| `ease-ds-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default enter/hover |
| `ease-ds-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Smooth bidirectional |
| `ease-ds-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Confirmation only |

---

## 7. Migration roadmap

| Phase | Scope |
|---|---|
| 1 (this) | Token foundation. No JSX changes. |
| 2 | Landing page rewrite (mobile-first). |
| 3 | Dashboard chrome — sidebar, header, page shell. |
| 4 | Individual pages restyled, shadcn primitives migrated to `ds-*` tokens. |
