import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

const getResetRedirectUrl = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL;
  if (envUrl) return envUrl;
  return `${window.location.origin}/reset-password`;
};

const TICKERS = [
  { symbol: "AAPL", change: "+2.4%" }, { symbol: "NVDA", change: "+5.1%" },
  { symbol: "TSLA", change: "-1.2%" }, { symbol: "MSFT", change: "+0.8%" },
  { symbol: "BTC",  change: "+3.2%" }, { symbol: "META", change: "-0.4%" },
  { symbol: "AMZN", change: "+1.7%" }, { symbol: "GOOG", change: "+2.1%" },
  { symbol: "ETH",  change: "+4.3%" }, { symbol: "SPY",  change: "+0.6%" },
  { symbol: "QQQ",  change: "+1.2%" }, { symbol: "AMD",  change: "+3.8%" },
  { symbol: "GLD",  change: "+0.9%" }, { symbol: "COIN", change: "+6.2%" },
  { symbol: "PLTR", change: "+2.7%" }, { symbol: "SOL",  change: "+8.1%" },
];

export default function Auth() {
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({ title: "Validation Error", description: error.issues[0].message, variant: "destructive" });
        return;
      }
    }
    if (password !== confirmPassword) {
      toast({ title: "Validation Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('custom-auth-email', {
      body: { action: 'signup', email, password }
    });
    setLoading(false);
    if (error || (data && !data.success)) {
      const errorMessage = data?.error || error?.message || "An error occurred";
      if (errorMessage.includes("already registered")) {
        toast({ title: "Account exists", description: "This email is already registered. Please sign in instead.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
      }
    } else {
      toast({ title: "Check your email", description: "We've sent you a verification link from support@insiderpulse.org. Please check your inbox and spam folder." });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({ title: "Validation Error", description: error.issues[0].message, variant: "destructive" });
        return;
      }
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(resetEmail);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({ title: "Validation Error", description: error.issues[0].message, variant: "destructive" });
        return;
      }
    }
    setResetLoading(true);
    const { data, error } = await supabase.functions.invoke('custom-auth-email', {
      body: { action: 'recovery', email: resetEmail }
    });
    setResetLoading(false);
    if (error || (data && !data.success)) {
      toast({ title: "Error", description: data?.error || error?.message || "An error occurred", variant: "destructive" });
    } else {
      toast({ title: "Reset link sent", description: "Check your inbox and spam folder for the password reset link from support@insiderpulse.org." });
      setForgotPasswordOpen(false);
      setResetEmail("");
    }
  };

  const tickerLine = [...TICKERS, ...TICKERS];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "#020817" }}
    >
      {/* ── Grid overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Radar rings ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="absolute rounded-full border border-cyan-500"
            style={{
              width: `${i * 140}px`,
              height: `${i * 140}px`,
              animation: `radar-pulse 4s ease-out ${i * 0.6}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* ── Radar sweep ── */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ animation: "radar-sweep 6s linear infinite" }}
      >
        <div
          style={{
            width: "350px",
            height: "350px",
            background:
              "conic-gradient(from 0deg, rgba(6,182,212,0.18) 0deg, transparent 60deg)",
            borderRadius: "50%",
          }}
        />
      </div>

      {/* ── Centre crosshair dot ── */}
      <div
        className="absolute rounded-full bg-cyan-500 pointer-events-none"
        style={{
          width: "8px",
          height: "8px",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 12px 4px rgba(6,182,212,0.5)",
        }}
      />

      {/* ── Card ── */}
      <div
        className="relative z-10 w-full max-w-md mx-auto px-4"
        style={{ marginBottom: "80px" }}
      >
        <div
          className="rounded-2xl shadow-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            {/* Logo emblem */}
            <div className="relative mb-4">
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="24" stroke="#06B6D4" strokeWidth="1.5" opacity="0.4" />
                <circle cx="26" cy="26" r="16" stroke="#06B6D4" strokeWidth="1.5" opacity="0.6" />
                <circle cx="26" cy="26" r="8"  stroke="#06B6D4" strokeWidth="1.5" />
                <circle cx="26" cy="26" r="2.5" fill="#06B6D4" />
                <line x1="26" y1="2"  x2="26" y2="50" stroke="#06B6D4" strokeWidth="1" opacity="0.3" />
                <line x1="2"  y1="26" x2="50" y2="26" stroke="#06B6D4" strokeWidth="1" opacity="0.3" />
                {/* sweep arm */}
                <line x1="26" y1="26" x2="44" y2="10" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "0 0 20px 6px rgba(6,182,212,0.25)" }}
              />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">InsiderPulse</h1>
            <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
              See the signals before the crowd moves
            </p>
          </div>

          {/* Tab toggle */}
          <div
            className="flex rounded-lg p-1 mb-6"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {(["signin", "signup"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-2 rounded-md text-sm font-medium transition-all duration-200"
                style={
                  activeTab === tab
                    ? { background: "#06B6D4", color: "#fff" }
                    : { color: "#94a3b8" }
                }
              >
                {tab === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Sign In form */}
          {activeTab === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-input"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "#fff",
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                  Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="auth-input"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "#fff",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setForgotPasswordOpen(true)}
                  className="text-xs hover:underline transition-colors"
                  style={{ color: "#06B6D4" }}
                >
                  Forgot password?
                </button>
              </div>
            </form>
          )}

          {/* Sign Up form */}
          {activeTab === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-input"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "#fff",
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                  Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="auth-input"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "#fff",
                  }}
                />
                <p className="text-xs" style={{ color: "#64748b" }}>Must be at least 6 characters</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                  Confirm Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="auth-input"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "#fff",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>
          )}
        </div>

        {/* Social proof */}
        <div className="flex flex-col items-center mt-5 gap-1">
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map((s) => (
              <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill="#06B6D4">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ))}
          </div>
          <p className="text-xs" style={{ color: "#475569" }}>
            Trusted by investors across 40+ countries
          </p>
        </div>
      </div>

      {/* ── Scrolling ticker tape ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 overflow-hidden flex items-center"
        style={{
          height: "40px",
          background: "rgba(2,8,23,0.9)",
          borderTop: "1px solid rgba(6,182,212,0.2)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          className="flex items-center gap-8 whitespace-nowrap"
          style={{ animation: "ticker-scroll 40s linear infinite" }}
        >
          {tickerLine.map((t, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs font-medium">
              <span style={{ color: "#94a3b8" }}>{t.symbol}</span>
              <span style={{ color: t.change.startsWith("+") ? "#22c55e" : "#ef4444" }}>
                {t.change}
              </span>
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "8px" }}>●</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Forgot Password Modal ── */}
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md" style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }}>
          <DialogHeader>
            <DialogTitle className="text-white">Reset Password</DialogTitle>
            <DialogDescription style={{ color: "#94a3b8" }}>
              Enter your email and we'll send you a reset link.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <Input
              id="reset-email"
              type="email"
              placeholder="your@email.com"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#fff",
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: "rgba(255,255,255,0.15)", color: "#94a3b8" }}
                onClick={() => { setForgotPasswordOpen(false); setResetEmail(""); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetLoading}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}
              >
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Keyframe styles ── */}
      <style>{`
        @keyframes radar-pulse {
          0%   { transform: scale(0.3); opacity: 0.7; }
          100% { transform: scale(1);   opacity: 0; }
        }
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .auth-input::placeholder { color: #475569; }
        .auth-input:focus {
          outline: none;
          border-color: #06B6D4 !important;
          box-shadow: 0 0 0 3px rgba(6,182,212,0.15);
        }
      `}</style>
    </div>
  );
}
