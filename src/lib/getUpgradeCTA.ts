// Session-aware CTA helpers for conversion primitives.
// Anonymous visitors get a "Start Free Access" call-to-action that routes to /auth.
// Logged-in visitors compose with the existing getUpgradeTarget() ladder.

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
  if (!isAuthenticated) return "Start Free Access";
  const tier = (userPlan || "free").toLowerCase();
  if (tier === "free") return "Start Free Access";
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

const ANON_TOOLTIP: Record<FieldType, string> = {
  score: "Score visible with Free Access. Start in 30s.",
  price: "Live price visible with Free Access. Start in 30s.",
  pnl: "P&L visible with Free Access. Start in 30s.",
  generic: "Unlock with Free Access. Start in 30s.",
};

const FREE_TOOLTIP: Record<FieldType, string> = {
  score: "Live score visible with Starter.",
  price: "Live price visible with Starter.",
  pnl: "P&L visible with Starter.",
  generic: "Unlock with Starter.",
};

export function getLockTooltip(
  isAuthenticated: boolean,
  userPlan: string | undefined,
  fieldType: FieldType = "generic",
  context: UpgradeContext = "generic",
): string {
  if (!isAuthenticated) return ANON_TOOLTIP[fieldType];
  const tier = (userPlan || "free").toLowerCase();
  if (tier === "free") return FREE_TOOLTIP[fieldType];
  const target = getUpgradeTarget(tier, context);
  return `Unlock with ${TIER_LABEL[target.nextTier] ?? target.nextTier} for ${target.benefit}.`;
}

export interface ProgressionLabelArgs {
  isAuthenticated: boolean;
  userPlan?: string;
  visible: number;
  total: number;
  noun: string; // "assets", "themes", "signals"
  trackingLabel?: string;
}

export function getProgressionCopy(args: ProgressionLabelArgs): { text: string; cta: string; href: string } {
  const { isAuthenticated, userPlan, visible, total, noun, trackingLabel } = args;
  const cta = getCTAText(isAuthenticated, userPlan);
  const href = getCTAHref(isAuthenticated, userPlan, trackingLabel);
  const totalLabel = total >= 1000 ? `${Math.floor(total / 1000)},${String(total % 1000).padStart(3, "0")}+` : String(total);
  const text = `Viewing ${visible} of ${totalLabel} ${noun}.`;
  return { text, cta, href };
}
