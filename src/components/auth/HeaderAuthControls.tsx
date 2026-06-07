import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/analytics";

/**
 * Anonymous-only auth controls for the AppShell header.
 * Hidden for any logged-in user.
 */
export function HeaderAuthControls() {
  const { isAuthenticated, loading } = useAuth();
  const { openAuthModal } = useAuthModal();

  if (loading || isAuthenticated) return null;

  return (
    <div className="ml-auto flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          track("locked_content_cta_clicked", { surface: "header", label: "header_signin" });
          openAuthModal("signin", { ref: "header_signin" });
        }}
        className="hidden sm:inline-flex h-9 px-3 items-center text-body-sm text-ds-text-secondary hover:text-ds-text-primary rounded-md transition-colors"
      >
        Sign In
      </button>
      <button
        type="button"
        onClick={() => {
          track("locked_content_cta_clicked", { surface: "header", label: "header_signup" });
          openAuthModal("signup", { ref: "header_signup" });
        }}
        className="inline-flex h-9 px-3.5 items-center text-body-sm font-semibold text-white rounded-md transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}
      >
        Sign Up Free
      </button>
    </div>
  );
}

export default HeaderAuthControls;
