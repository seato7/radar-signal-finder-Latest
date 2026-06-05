import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { AuthForm } from "./AuthForm";

export function AuthModal() {
  const { open, mode, closeAuthModal } = useAuthModal();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeAuthModal(); }}>
      <DialogContent
        className="sm:max-w-md p-0 border-0"
        style={{
          background: "rgba(15,23,42,0.98)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div className="sr-only">
          <DialogTitle>{mode === "signup" ? "Sign Up" : mode === "forgot" ? "Reset Password" : "Sign In"}</DialogTitle>
          <DialogDescription>Authenticate to InsiderPulse</DialogDescription>
        </div>
        <div className="p-6">
          <div className="flex flex-col items-center mb-5">
            <svg width="40" height="40" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="24" stroke="#06B6D4" strokeWidth="1.5" opacity="0.4" />
              <circle cx="26" cy="26" r="16" stroke="#06B6D4" strokeWidth="1.5" opacity="0.6" />
              <circle cx="26" cy="26" r="8" stroke="#06B6D4" strokeWidth="1.5" />
              <circle cx="26" cy="26" r="2.5" fill="#06B6D4" />
              <line x1="26" y1="26" x2="44" y2="10" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h2 className="text-lg font-bold text-white tracking-tight mt-2">InsiderPulse</h2>
            <p className="text-xs" style={{ color: "#94a3b8" }}>See the signals before the crowd moves</p>
          </div>
          <AuthForm onClose={closeAuthModal} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AuthModal;
