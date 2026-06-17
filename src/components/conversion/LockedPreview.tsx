import { ReactNode, forwardRef, MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { getCTAText, getCTAHref, getLockTooltip, type FieldType } from "@/lib/getUpgradeCTA";
import type { UpgradeContext } from "@/lib/upgradeTarget";
import { track, trackOnce } from "@/lib/analytics";
import { useAnonSignupCTA } from "@/hooks/useAnonSignupCTA";

type Mode = "inline" | "card" | "section" | "row-cell";
type Intensity = "light" | "medium" | "heavy";
type Tier = "starter" | "pro" | "premium";

export interface LockedPreviewProps {
  mode: Mode;
  children: ReactNode;
  intensity?: Intensity;
  targetTier?: Tier;
  tooltipText?: string;
  ctaText?: string;
  showOverlay?: boolean;
  trackingLabel?: string;
  className?: string;
  fieldType?: FieldType;
  context?: UpgradeContext;
}

const blurPx: Record<Intensity, string> = {
  light: "blur(2px)",
  medium: "blur(4px)",
  heavy: "blur(6px)",
};

// Renders a button (opens auth modal) when anonymous, a Link to /pricing otherwise.
// Preserves the analytics handler (locked_content_cta_clicked fires BEFORE the
// modal opens). See mem://constraints/preview-first-funnel
interface CtaProps {
  isAuthenticated: boolean;
  href: string;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
  trackingLabel?: string;
}

const Cta = forwardRef<HTMLElement, CtaProps>(function Cta(
  { isAuthenticated, href, onClick, ariaLabel, className, style, children, trackingLabel },
  ref,
) {
  const anonSignup = useAnonSignupCTA();
  if (isAuthenticated) {
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        to={href}
        onClick={onClick}
        aria-label={ariaLabel}
        className={className}
        style={style}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={(e?: MouseEvent) => {
        // Defensive: Radix/Slot composition or programmatic triggers may invoke
        // onClick without an event. Guard before touching event methods so we
        // never throw "Cannot read properties of undefined (reading 'defaultPrevented')".
        e?.preventDefault?.();
        e?.stopPropagation?.();
        onClick();
        // Route-then-modal: matches useAnonSignupCTA spec so anonymous users
        // always land on /dashboard before the signup modal mounts.
        // See mem://constraints/preview-first-funnel.
        anonSignup(trackingLabel);
      }}
      aria-label={ariaLabel}
      className={className}
      style={style}
    >
      {children}
    </button>
  );
});

export function LockedPreview({
  mode,
  children,
  intensity = "medium",
  targetTier = "starter",
  tooltipText,
  ctaText,
  showOverlay,
  trackingLabel,
  className,
  fieldType = "generic",
  context = "generic",
}: LockedPreviewProps) {
  const { isAuthenticated, userPlan } = useAuth();

  const tooltip = tooltipText ?? getLockTooltip(isAuthenticated, userPlan, fieldType, context);
  const cta = ctaText ?? getCTAText(isAuthenticated, userPlan, context);
  const href = getCTAHref(isAuthenticated, userPlan, trackingLabel);
  const showOv = showOverlay ?? (mode === "card" || mode === "section");
  const ariaLabel = isAuthenticated ? `Locked. Requires ${targetTier} plan.` : "Locked. Sign Up Free to unlock.";

  const handleLockClick = () => {
    trackOnce("first_locked_interaction", { field_type: fieldType, target_tier: targetTier, label: trackingLabel });
    track("locked_content_cta_clicked", {
      field_type: fieldType,
      target_tier: targetTier,
      label: trackingLabel,
      mode,
    });
  };

  if (mode === "inline") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Cta
              isAuthenticated={isAuthenticated}
              href={href}
              onClick={handleLockClick}
              ariaLabel={ariaLabel}
              trackingLabel={trackingLabel}
              className={cn(
                "inline-block align-baseline cursor-pointer select-none transition-opacity duration-fast hover:opacity-80",
                className,
              )}
              style={{ filter: blurPx[intensity] }}
            >
              {children}
            </Cta>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (mode === "row-cell") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Cta
              isAuthenticated={isAuthenticated}
              href={href}
              onClick={handleLockClick}
              ariaLabel={ariaLabel}
              trackingLabel={trackingLabel}
              className={cn("inline-block cursor-pointer transition-opacity duration-fast hover:opacity-80", className)}
              style={{ filter: blurPx[intensity], pointerEvents: "auto" }}
            >
              {children}
            </Cta>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden="true"
        style={{
          filter: blurPx[intensity],
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {children}
      </div>

      {showOv && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-ds-lg border border-ds-border backdrop-blur-sm bg-ds-surface/60"
          aria-label={ariaLabel}
        >
          <div className="text-center px-6 py-5 max-w-xs">
            <div className="h-11 w-11 rounded-full bg-ds-brand-primary/10 border border-ds-brand-primary/20 flex items-center justify-center mx-auto mb-3">
              <Lock className="h-5 w-5 text-ds-text-secondary" />
            </div>
            <p className="text-caption text-ds-text-secondary mb-4 leading-relaxed">{tooltip}</p>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent"
            >
              <Cta
                isAuthenticated={isAuthenticated}
                href={href}
                onClick={handleLockClick}
                ariaLabel={ariaLabel}
                trackingLabel={trackingLabel}
              >
                {cta}
              </Cta>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default LockedPreview;
