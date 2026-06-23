import { ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/analytics";
import { useAssetUniverseCounts, formatCount } from "@/hooks/useAssetUniverseCounts";

interface StickySignupBarProps {
  copy?: string;
  trackingLabel?: string;
}

/**
 * Persistent sticky CTA for anonymous visitors on public preview surfaces.
 * Hidden for any logged-in user.
 * See mem://constraints/preview-first-funnel
 */
export function StickySignupBar({
  copy,
  trackingLabel = "sticky_signup_bar",
}: StickySignupBarProps) {
  const { isAuthenticated, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { data: counts } = useAssetUniverseCounts();

  if (loading || isAuthenticated) return null;

  const resolvedCopy =
    copy ?? `Browse ${formatCount(counts?.total)} ranked assets free. 30 seconds, no card.`;

  const onClick = () => {
    track("locked_content_cta_clicked", { surface: "sticky_bar", label: trackingLabel });
    openAuthModal("signup", { ref: trackingLabel });
  };


  return (
    <div
      className="sticky top-[52px] md:top-14 z-[9] -mx-4 md:-mx-6 lg:-mx-8 mb-4 border-b border-ds-border"
      style={{
        background:
          "linear-gradient(90deg, rgba(6,182,212,0.18) 0%, rgba(16,208,208,0.10) 50%, rgba(59,130,246,0.18) 100%)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-ds-brand-primary shrink-0" aria-hidden="true" />
          <p className="text-body-sm text-ds-text-primary truncate">{resolvedCopy}</p>
        </div>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-body-sm font-semibold text-white shrink-0 transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}
        >
          Sign Up Free
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default StickySignupBar;
