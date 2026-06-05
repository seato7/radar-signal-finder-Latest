import posthog from "posthog-js";

/**
 * PostHog publishable project key — safe to ship in client code.
 * Replace with your real key when you have it. Falls back to a no-op if empty.
 */
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  if (!POSTHOG_KEY) {
    // No key configured yet — analytics is a no-op. See README / mem://constraints/preview-first-funnel.
    return;
  }
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: false, // We fire explicit events for the funnel.
    // TODO: wire a GDPR consent gate before EU traffic arrives.
  });
  initialized = true;
}

type EventProps = Record<string, unknown>;

function baseProps(extra: EventProps = {}): EventProps {
  const isAuthed =
    typeof window !== "undefined" &&
    !!window.localStorage.getItem("sb-" + (import.meta.env.VITE_SUPABASE_PROJECT_ID || "") + "-auth-token");
  return {
    auth_state: isAuthed ? "authenticated" : "anonymous",
    route: typeof window !== "undefined" ? window.location.pathname : "",
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    ts: new Date().toISOString(),
    ...extra,
  };
}

export function track(event: string, props: EventProps = {}) {
  if (!POSTHOG_KEY || !initialized) return;
  posthog.capture(event, baseProps(props));
}

export function identifyUser(userId: string, traits: EventProps = {}) {
  if (!POSTHOG_KEY || !initialized) return;
  // Merges the anonymous distinct_id trail into the new user_id automatically.
  posthog.identify(userId, traits);
}

export function resetAnalytics() {
  if (!POSTHOG_KEY || !initialized) return;
  posthog.reset();
}

/**
 * Session-scoped event guard — fires the event at most once per browser session.
 * Used for demo_*_viewed, preview_scroll_*, preview_time_*, first_locked_interaction.
 */
const FIRED_KEY = "ip_analytics_fired";
function getFired(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function setFired(s: Set<string>) {
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...s]));
  } catch {
    /* noop */
  }
}
export function trackOnce(event: string, props: EventProps = {}) {
  if (typeof window === "undefined") return;
  const fired = getFired();
  if (fired.has(event)) return;
  fired.add(event);
  setFired(fired);
  track(event, props);
}
