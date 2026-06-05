import { Link } from "react-router-dom";
import { ArrowRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getProgressionCopy } from "@/lib/getUpgradeCTA";

interface ProgressionLabelProps {
  visible: number;
  total: number;
  noun: string;
  trackingLabel?: string;
  className?: string;
}

export function ProgressionLabel({ visible, total, noun, trackingLabel, className }: ProgressionLabelProps) {
  const { isAuthenticated, userPlan } = useAuth();
  const { text, cta, href } = getProgressionCopy({ isAuthenticated, userPlan, visible, total, noun, trackingLabel });

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-ds-lg border border-ds-border bg-ds-surface-elevated px-4 py-3",
        className,
      )}
    >
      <Eye className="h-4 w-4 text-ds-brand-primary shrink-0" aria-hidden="true" />
      <p className="text-body-sm text-ds-text-secondary flex-1 min-w-0">
        <span className="text-ds-text-primary font-medium">{text}</span>{" "}
        <Link
          to={href}
          className="text-ds-brand-primary font-medium hover:underline inline-flex items-center gap-1"
        >
          {cta}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}

export default ProgressionLabel;
