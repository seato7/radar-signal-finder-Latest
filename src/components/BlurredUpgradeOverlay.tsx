import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getCTAText, getCTAHref } from "@/lib/getUpgradeCTA";
import { track, trackOnce } from "@/lib/analytics";
import { useAnonSignupCTA } from "@/hooks/useAnonSignupCTA";

interface BlurredUpgradeOverlayProps {
  feature: string;
  description: string;
  children: ReactNode;
  trackingLabel?: string;
}

export const BlurredUpgradeOverlay = ({
  feature,
  description,
  children,
  trackingLabel,
}: BlurredUpgradeOverlayProps) => {
  const { isAuthenticated, userPlan } = useAuth();
  const anonSignup = useAnonSignupCTA();
  const cta = getCTAText(isAuthenticated, userPlan);
  const href = getCTAHref(isAuthenticated, userPlan, trackingLabel);

  const handleClick = () => {
    trackOnce("first_locked_interaction", { feature, label: trackingLabel });
    track("locked_content_cta_clicked", { feature, label: trackingLabel, surface: "blurred_overlay" });
  };

  const handleAnonClick = (e?: React.MouseEvent) => {
    // Defensive event guard: avoids "Cannot read properties of undefined
    // (reading 'defaultPrevented')" when invoked via Slot/Radix composition.
    e?.preventDefault?.();
    e?.stopPropagation?.();
    handleClick();
    // Route-then-modal pattern, see mem://constraints/preview-first-funnel.
    anonSignup(trackingLabel);
  };

  return (
    <div className="relative">
      <div
        style={{ filter: "blur(8px)", pointerEvents: "none", userSelect: "none" }}
        aria-hidden="true"
      >
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center rounded-ds-lg backdrop-blur-sm bg-ds-surface/60">
        <div className="text-center px-6 py-5 max-w-xs">
          <div className="h-11 w-11 rounded-full bg-ds-brand-primary/10 border border-ds-brand-primary/20 flex items-center justify-center mx-auto mb-3">
            <Lock className="h-5 w-5 text-ds-brand-primary" />
          </div>
          <h3 className="font-semibold text-body-sm text-ds-text-primary mb-1.5">{feature}</h3>
          <p className="text-caption text-ds-text-secondary mb-4 leading-relaxed">{description}</p>
          {isAuthenticated ? (
            <Button asChild size="sm" variant="outline" className="text-xs border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent">
              <Link to={href} onClick={handleClick}>{cta}</Link>
            </Button>
          ) : (
            <Button onClick={handleAnonClick} size="sm" variant="outline" className="text-xs border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent">
              {cta}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
