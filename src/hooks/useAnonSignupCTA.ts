import { useLocation, useNavigate } from "react-router-dom";
import { useAuthModal } from "@/contexts/AuthModalContext";

/**
 * Anonymous-equals-Free funnel: lock CTAs first route the URL to /dashboard,
 * then open the signup modal so the user lands on /dashboard when the popup
 * appears. If already on /dashboard, the navigate is skipped (no-op route
 * change avoidance). See mem://constraints/preview-first-funnel.
 */
export function useAnonSignupCTA() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { openAuthModal } = useAuthModal();

  return (ref?: string) => {
    if (pathname !== "/dashboard") {
      navigate("/dashboard");
    }
    openAuthModal("signup", { ref });
  };
}
