// Plan-aware upgrade target helper.
// Ensures Pro users see Premium hooks, not generic Pro routing.

export type Tier = "free" | "starter" | "pro" | "premium" | "enterprise" | "admin";
export type UpgradeContext =
  | "watchlist"
  | "ai"
  | "alerts"
  | "themes"
  | "signals"
  | "asset_radar"
  | "generic";

export interface UpgradeTarget {
  nextTier: "starter" | "pro" | "premium";
  benefit: string;
  ctaCopy: string;
}

const BENEFITS: Record<UpgradeContext, Record<"starter" | "pro" | "premium", string>> = {
  watchlist: {
    starter: "3 watchlist slots with live prices and scores",
    pro: "10 watchlist slots with live prices and scores",
    premium: "unlimited watchlist slots",
  },
  ai: {
    starter: "5 AI Assistant messages per day",
    pro: "20 AI Assistant messages per day",
    premium: "unlimited AI Assistant access",
  },
  alerts: {
    starter: "1 themed alert channel",
    pro: "5 themed alert channels",
    premium: "unlimited alerts on every theme",
  },
  themes: {
    starter: "access to 1 full investment theme",
    pro: "access to 3 full investment themes",
    premium: "unlimited investment themes",
  },
  signals: {
    starter: "1 fully spec'd Active Signal",
    pro: "3 fully spec'd Active Signals",
    premium: "unlimited Active Signals + full exit history",
  },
  asset_radar: {
    starter: "Asset Radar scores for stocks",
    pro: "Asset Radar scores for stocks, ETFs and forex",
    premium: "Asset Radar across every asset class (incl. crypto, commodities)",
  },
  generic: {
    starter: "unlock paid features",
    pro: "unlock advanced features",
    premium: "unlock everything",
  },
};

export function getUpgradeTarget(
  currentTier: string,
  context: UpgradeContext = "generic",
): UpgradeTarget {
  const tier = (currentTier || "free") as Tier;

  let nextTier: "starter" | "pro" | "premium" = "starter";
  if (tier === "free") nextTier = "starter";
  else if (tier === "starter") nextTier = "pro";
  else nextTier = "premium"; // pro / premium / enterprise / admin all hook to Premium

  // Context-specific overrides where the next-tier benefit is identical to current
  // Free=3 and Starter=3 watchlist slots post-5B widening, so route Free→Pro for slot quantity.
  if (context === "watchlist" && tier === "free") nextTier = "pro";
  if (context === "alerts" && tier === "free") nextTier = "starter";
  // Free=1 and Starter=1 themes — Pro (3 themes) is the first real uplift.
  if (context === "themes" && tier === "free") nextTier = "pro";

  const benefit = BENEFITS[context][nextTier];
  const ctaCopy = `Upgrade to ${nextTier[0].toUpperCase()}${nextTier.slice(1)}`;
  return { nextTier, benefit, ctaCopy };
}
