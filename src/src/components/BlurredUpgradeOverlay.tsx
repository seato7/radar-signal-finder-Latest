import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface BlurredUpgradeOverlayProps {
  feature: string;
  description: string;
  children: ReactNode;
}

export const BlurredUpgradeOverlay = ({
  feature,
  description,
  children,
}: BlurredUpgradeOverlayProps) => {
  return (
    <div className="relative">
      {/* Blurred content behind overlay */}
      <div
        style={{ filter: "blur(8px)", pointerEvents: "none", userSelect: "none" }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded-xl backdrop-blur-md bg-black/40">
        <div className="text-center px-6 py-5 max-w-xs">
          <div className="h-11 w-11 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-3">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-semibold text-sm text-foreground mb-1.5">{feature}</h3>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{description}</p>
          <Button asChild size="sm" className="text-xs">
            <Link to="/pricing">View Plans</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
