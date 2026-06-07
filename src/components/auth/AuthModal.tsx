import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { AuthForm } from "./AuthForm";
import { Check, TrendingUp, Users, FileText } from "lucide-react";

const valueProps = [
  { icon: TrendingUp, label: "Track 26,000+ assets with live scores" },
  { icon: Users, label: "Live insider trades from SEC Form 4 filings" },
  { icon: FileText, label: "Congressional disclosures and bipartisan signals" },
  { icon: Check, label: "Free forever — no credit card required" },
];

export function AuthModal() {
  const { open, mode, closeAuthModal } = useAuthModal();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeAuthModal(); }}>
      <DialogContent
        className="sm:max-w-3xl p-0 border-0 overflow-hidden"
        style={{
          background: "rgba(8,13,28,0.98)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div className="sr-only">
          <DialogTitle>{mode === "signup" ? "Sign Up" : mode === "forgot" ? "Reset Password" : "Sign In"}</DialogTitle>
          <DialogDescription>Authenticate to InsiderPulse</DialogDescription>
        </div>

        <div className="grid md:grid-cols-[1.05fr_1fr]">
          {/* Value-prop column (desktop only) */}
          <aside
            className="hidden md:flex flex-col justify-between p-8 relative overflow-hidden"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 0%, rgba(6,182,212,0.22) 0%, rgba(59,130,246,0.10) 45%, rgba(8,13,28,0) 75%), linear-gradient(180deg, rgba(6,182,212,0.06), rgba(8,13,28,0))",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div>
              <div className="flex items-center gap-2.5 mb-8">
                <svg width="32" height="32" viewBox="0 0 52 52" fill="none">
                  <circle cx="26" cy="26" r="24" stroke="#06B6D4" strokeWidth="1.5" opacity="0.4" />
                  <circle cx="26" cy="26" r="16" stroke="#06B6D4" strokeWidth="1.5" opacity="0.6" />
                  <circle cx="26" cy="26" r="8" stroke="#06B6D4" strokeWidth="1.5" />
                  <circle cx="26" cy="26" r="2.5" fill="#06B6D4" />
                  <line x1="26" y1="26" x2="44" y2="10" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="text-base font-bold text-white tracking-tight">InsiderPulse</span>
              </div>

              <h3 className="text-2xl font-semibold text-white leading-tight mb-2">
                See the signals before the crowd moves.
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
                Free access to live insider trades, congressional disclosures, and scored asset radar.
              </p>

              <ul className="mt-7 space-y-3.5">
                {valueProps.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.25)" }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: "#06B6D4" }} />
                    </span>
                    <span className="text-sm text-white/85 leading-snug">{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs pt-6" style={{ color: "#64748b" }}>
              Trusted by analysts tracking SEC Form 4, 13F, and Congressional Stock Watcher data.
            </p>
          </aside>

          {/* Form column */}
          <div className="p-6 md:p-8">
            <div className="md:hidden flex flex-col items-center mb-5">
              <svg width="36" height="36" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="24" stroke="#06B6D4" strokeWidth="1.5" opacity="0.4" />
                <circle cx="26" cy="26" r="16" stroke="#06B6D4" strokeWidth="1.5" opacity="0.6" />
                <circle cx="26" cy="26" r="8" stroke="#06B6D4" strokeWidth="1.5" />
                <circle cx="26" cy="26" r="2.5" fill="#06B6D4" />
                <line x1="26" y1="26" x2="44" y2="10" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <h2 className="text-base font-bold text-white tracking-tight mt-2">InsiderPulse</h2>
            </div>

            <div className="hidden md:block mb-5">
              <h2 className="text-lg font-semibold text-white tracking-tight">
                {mode === "signup" ? "Create your free account" : mode === "forgot" ? "Reset your password" : "Welcome back"}
              </h2>
              <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                {mode === "signup" ? "Takes under 30 seconds." : mode === "forgot" ? "We'll send a reset link to your email." : "Sign in to continue."}
              </p>
            </div>

            <AuthForm onClose={closeAuthModal} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AuthModal;
