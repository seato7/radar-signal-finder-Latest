---
name: Preview-first funnel
description: Anonymous-equals-Free routing, navigate-then-modal pattern, /dashboard as canonical landing
type: constraint
---
Anonymous-equals-Free architecture. All anonymous landing and lock CTAs route to /dashboard. When an anonymous user clicks a lock CTA from any page, the handler first calls navigate('/dashboard'), then openAuthModal('signup') on the destination. The /auth route also redirects to /dashboard. In-app cross-links (Watchlist 'Browse Asset Radar', Themes empty state, TopAssetsCard 'View all') stay targeting /asset-radar because they are navigation prompts, not conversion CTAs. Trial language is reserved for /pricing context only - signup gives Free, not trial.

Implementation: use the `useAnonSignupCTA` hook from `@/hooks/useAnonSignupCTA`. It encapsulates the navigate-then-modal pattern and skips the navigate when already on /dashboard.
