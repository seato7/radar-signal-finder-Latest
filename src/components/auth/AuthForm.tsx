import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { TOS_VERSION, PRIVACY_VERSION } from "@/lib/policyVersions";
import { track } from "@/lib/analytics";
import { useAuthModal, type AuthMode } from "@/contexts/AuthModalContext";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

interface AuthFormProps {
  onClose: () => void;
  redirectAfterSignIn?: string;
}

export function AuthForm({ onClose, redirectAfterSignIn = "/dashboard" }: AuthFormProps) {
  const { mode, setMode } = useAuthModal();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [signupSubmitted, setSignupSubmitted] = useState(false);

  const switchMode = (next: AuthMode) => {
    setResetSent(false);
    setSignupSubmitted(false);
    setMode(next);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    track("signup_started", { method: "email", surface: "modal" });
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
    if (!agreedToTerms) {
      toast({
        title: "Agreement required",
        description: "Please agree to the Terms of Service and Privacy Policy to continue.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("custom-auth-email", {
      body: {
        action: "signup",
        email,
        password,
        tos_version: TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
        user_agent: navigator.userAgent,
      },
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
      setSignupSubmitted(true);
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
      onClose();
      navigate(redirectAfterSignIn);
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
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("custom-auth-email", {
      body: { action: "recovery", email: resetEmail },
    });
    setLoading(false);
    if (error || (data && !data.success)) {
      toast({ title: "Error", description: data?.error || error?.message || "An error occurred", variant: "destructive" });
    } else {
      setResetSent(true);
    }
  };

  const fieldStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff",
  };

  return (
    <div className="space-y-5">
      {mode !== "forgot" && (
        <div className="flex rounded-lg p-1" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(["signin", "signup"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchMode(tab)}
              className="flex-1 py-2 rounded-md text-sm font-medium transition-all duration-200"
              style={mode === tab ? { background: "#06B6D4", color: "#fff" } : { color: "#94a3b8" }}
            >
              {tab === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>
      )}

      {mode === "signin" && (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Email</label>
            <Input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="auth-input" style={fieldStyle} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Password</label>
            <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="auth-input" style={fieldStyle} />
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => switchMode("forgot")} className="text-xs hover:underline transition-colors" style={{ color: "#06B6D4" }}>
              Forgot password?
            </button>
          </div>
        </form>
      )}

      {mode === "signup" && signupSubmitted && (
        <div className="text-center space-y-3 py-4">
          <div className="mx-auto h-12 w-12 rounded-full flex items-center justify-center" style={{ background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-white">Check your email to confirm your account</h3>
          <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
            We've sent a verification link to <span className="text-white font-medium">{email}</span> from support@insiderpulse.org. Click the link to activate your account, then come back to sign in.
          </p>
        </div>
      )}

      {mode === "signup" && !signupSubmitted && (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Email</label>
            <Input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="auth-input" style={fieldStyle} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Password</label>
            <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="auth-input" style={fieldStyle} />
            <p className="text-xs" style={{ color: "#64748b" }}>Must be at least 6 characters</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>Confirm Password</label>
            <Input type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="auth-input" style={fieldStyle} />
          </div>
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <Checkbox id="agree-terms-modal" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(checked === true)} className="mt-0.5 border-white/20 data-[state=checked]:bg-cyan-500 data-[state=checked]:border-cyan-500 data-[state=checked]:text-white" />
              <label htmlFor="agree-terms-modal" className="text-xs leading-snug cursor-pointer select-none" style={{ color: "#94a3b8" }}>
                I agree to the{" "}
                <Link to="/terms" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#06B6D4" }}>Terms of Service</Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#06B6D4" }}>Privacy Policy</Link>.
              </label>
            </div>
          </div>
          <button type="submit" disabled={loading || !agreedToTerms} className="w-full py-2.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      )}

      {mode === "forgot" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">Reset Password</h3>
            <p className="text-xs" style={{ color: "#94a3b8" }}>Enter your email and we'll send you a reset link.</p>
          </div>
          {resetSent ? (
            <div className="space-y-3 text-center py-3">
              <p className="text-sm text-white">Reset link sent.</p>
              <p className="text-xs" style={{ color: "#94a3b8" }}>
                Check your inbox and spam folder for the password reset link from support@insiderpulse.org.
              </p>
              <button type="button" onClick={() => switchMode("signin")} className="text-xs hover:underline" style={{ color: "#06B6D4" }}>
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <Input type="email" placeholder="your@email.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required style={fieldStyle} />
              <div className="flex gap-2">
                <button type="button" onClick={() => switchMode("signin")} className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors" style={{ borderColor: "rgba(255,255,255,0.15)", color: "#94a3b8" }}>
                  Back
                </button>
                <button type="submit" disabled={loading} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: "linear-gradient(to right, #06B6D4, #3B82F6)" }}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <style>{`
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

export default AuthForm;
