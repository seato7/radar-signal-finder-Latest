import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getCTAText, getCTAHref } from "@/lib/getUpgradeCTA";

type Tier = "free" | "starter" | "pro" | "premium";

export interface TierCeilingProps {
  currentUsage: number;
  limit: number;
  limitUnit: string;
  currentTier: Tier;
  nextTier: "starter" | "pro" | "premium";
  nextTierBenefit: string;
  compact?: boolean;
  timeScope?: "daily" | "monthly";
  className?: string;
  trackingLabel?: string;
}

export function TierCeiling({
  currentUsage,
  limit,
  limitUnit,
  nextTier,
  nextTierBenefit,
  compact = false,
  timeScope,
  className,
  trackingLabel,
}: TierCeilingProps) {
  const { isAuthenticated, userPlan } = useAuth();
  const atCeiling = currentUsage >= limit;
  const scope = timeScope ? ` ${timeScope}` : "";
  const headline = atCeiling
    ? `You've used all ${limit} ${limitUnit}`
    : `${currentUsage}/${limit} ${limitUnit} used${scope}`;
  const cta = getCTAText(isAuthenticated, userPlan);
  const subhead = isAuthenticated
    ? `${nextTier[0].toUpperCase()}${nextTier.slice(1)} unlocks ${nextTierBenefit}`
    : `Free Access unlocks ${nextTierBenefit}`;
  const href = getCTAHref(isAuthenticated, userPlan, trackingLabel);

  if (compact) {
    return (
      <Link
        to={href}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1 rounded-full border border-ds-border bg-ds-surface text-caption text-ds-text-secondary hover:border-ds-border-strong hover:text-ds-text-primary transition-colors duration-fast",
          atCeiling && "border-ds-signal-warning/50 text-ds-signal-warning",
          className,
        )}
      >
        <span className="font-mono">
          {currentUsage}/{limit}
        </span>
        <span>{limitUnit}</span>
        <ArrowRight className="h-3 w-3" />
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "rounded-ds-lg border border-ds-border bg-ds-surface-elevated p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-body font-semibold text-ds-text-primary">{headline}</p>
        <p className="text-body-sm text-ds-text-secondary mt-1">{subhead}</p>
      </div>
      <Button
        asChild
        size="sm"
        className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary shrink-0 cta-upgrade-pulse"
      >
        <Link to={href}>
          {cta}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

export default TierCeiling;
