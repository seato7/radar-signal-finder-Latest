// Session-aware CTA helpers for conversion primitives.
// Anonymous visitors get a "Sign Up Free" call-to-action that opens the auth modal.
// Logged-in visitors compose with the existing getUpgradeTarget() ladder.
// See mem://constraints/preview-first-funnel

import { getUpgradeTarget, type UpgradeContext } from "./upgradeTarget";

export type FieldType = "score" | "price" | "pnl" | "generic";

const TIER_LABEL: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

export function getCTAText(
  isAuthenticated: boolean,
  userPlan: string | undefined,
  context: UpgradeContext = "generic",
): string {
  if (!isAuthenticated) return "Sign Up Free";
  const tier = (userPlan || "free").toLowerCase();
  const target = getUpgradeTarget(tier, context);
  return `Upgrade to ${TIER_LABEL[target.nextTier] ?? target.nextTier}`;
}

export function getCTAHref(
  isAuthenticated: boolean,
  _userPlan?: string,
  trackingLabel?: string,
): string {
  if (!isAuthenticated) {
    const params = new URLSearchParams({ mode: "signup" });
    if (trackingLabel) params.set("ref", trackingLabel);
    return `/auth?${params.toString()}`;
  }
  return `/pricing${trackingLabel ? `?upgrade_from=${encodeURIComponent(trackingLabel)}` : ""}`;
}

// Per-surface anonymous headlines. Honest about what signup delivers:
// signing up gives Free, which already includes these capabilities (or
// the demo slice of them). No "Unlock" / "Start 7-day trial" copy here.
const ANON_BY_CONTEXT: Partial<Record<UpgradeContext, string>> = {
  themes: "Sign up to track themes.",
  signals: "Sign up to see today's signals.",
  watchlist: "Save assets to your watchlist.",
  alerts: "Get notified when scores change.",
  ai: "Ask anything about the full ranked-asset universe.",
  asset_radar: "Sign up free to see every ranked asset.",
};

const ANON_TOOLTIP: Record<FieldType, string> = {
  score: "Sign up free to see scores.",
  price: "Sign up free to see live prices.",
  pnl: "Sign up free to see P&L.",
  generic: "Sign up free to unlock.",
};

export function getLockTooltip(
  isAuthenticated: boolean,
  userPlan: string | undefined,
  fieldType: FieldType = "generic",
  context: UpgradeContext = "generic",
): string {
  if (!isAuthenticated) {
    return ANON_BY_CONTEXT[context] ?? ANON_TOOLTIP[fieldType];
  }
  const tier = (userPlan || "free").toLowerCase();
  const target = getUpgradeTarget(tier, context);
  return `Upgrade to ${TIER_LABEL[target.nextTier] ?? target.nextTier} for ${target.benefit}.`;
}

export interface ProgressionLabelArgs {
  isAuthenticated: boolean;
  userPlan?: string;
  visible: number;
  total: number;
  noun: string; // "assets", "themes", "signals"
  trackingLabel?: string;
  context?: UpgradeContext;
}

export function getProgressionCopy(args: ProgressionLabelArgs): { text: string; cta: string; href: string } {
  const { isAuthenticated, userPlan, visible, total, noun, trackingLabel, context } = args;
  const cta = getCTAText(isAuthenticated, userPlan, context);
  const href = getCTAHref(isAuthenticated, userPlan, trackingLabel);
  const totalLabel = total >= 1000 ? `${Math.floor(total / 1000)},${String(total % 1000).padStart(3, "0")}+` : String(total);
  const text = `Viewing ${visible} of ${totalLabel} ${noun}.`;
  return { text, cta, href };
}
