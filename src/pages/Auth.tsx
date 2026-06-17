import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuthModal, type AuthMode } from "@/contexts/AuthModalContext";

// /auth is preserved ONLY as a fallback redirect for deep links from external
// sources (marketing emails, legacy bookmarks, etc.). It opens the auth modal
// in the requested mode and silently redirects the URL to /dashboard so the
// user lands on a product surface, never a standalone auth page.
// See mem://constraints/preview-first-funnel
export default function Auth() {
  const [searchParams] = useSearchParams();
  const { openAuthModal } = useAuthModal();

  const requested = searchParams.get("mode");
  const mode: AuthMode = requested === "signup" ? "signup" : requested === "forgot" ? "forgot" : "signin";
  const ref = searchParams.get("ref") ?? undefined;

  useEffect(() => {
    openAuthModal(mode, { ref });
  }, [openAuthModal, mode, ref]);

  return <Navigate to="/dashboard" replace />;
}
