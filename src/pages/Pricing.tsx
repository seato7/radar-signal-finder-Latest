import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

interface Plan {
  name: string;
  monthly: number | null;
  annual: number | null;
  annualSaving: string | null;
  plan_id: string;
  description: string;
  features: string[];
  popular: boolean;
}

const plans: Plan[] = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    annualSaving: null,
    plan_id: "free",
    description: "Try the platform with a single sample theme and three sample assets",
    features: [
      "1 sample theme (read only)",
      "3 sample assets (F, VTI, EUR/USD) with scores",
      "AI Assistant: 3 messages/day",
      "3 Watchlist slots",
      "No alerts or active signals",
    ],
    popular: false,
  },
  {
    name: "Starter",
    monthly: 9.99,
    annual: 89,
    annualSaving: "26%",
    plan_id: "starter",
    description: "Everything you need to start investing smarter",
    features: [
      "1 Active Signal",
      "Asset Radar: Stocks (with scores)",
      "1 Theme",
      "AI Assistant: 5 messages/day",
      "1 Alert",
      "3 Watchlist slots",
    ],
    popular: false,
  },
  {
    name: "Pro",
    monthly: 34.99,
    annual: 299,
    annualSaving: "29%",
    plan_id: "pro",
    description: "For active investors tracking multiple opportunities",
    features: [
      "3 Active Signals",
      "Asset Radar: Stocks, ETFs & Forex (with scores)",
      "3 Themes",
      "AI Assistant: 20 messages/day",
      "5 Alerts",
      "10 Watchlist slots",
    ],
    popular: true,
  },
  {
    name: "Premium",
    monthly: 89.99,
    annual: 799,
    annualSaving: "26%",
    plan_id: "premium",
    description: "Unlimited access to every InsiderPulse feature",
    features: [
      "Unlimited Active Signals",
      "Full Asset Radar: All asset classes (stocks, ETFs, forex, crypto, commodities)",
      "Unlimited Themes",
      "AI Assistant: Unlimited",
      "Unlimited Alerts",
      "Unlimited Watchlist slots",
      "Analytics dashboard",
      "Trading Bots (Coming Soon)",
    ],
    popular: false,
  },
  {
    name: "Enterprise",
    monthly: null,
    annual: null,
    annualSaving: null,
    plan_id: "enterprise",
    description: "Custom solutions for teams and institutions",
    features: [
      "Everything in Premium",
      "Priority support",
      "Custom integrations",
    ],
    popular: false,
  },
];

// Founding member rate locks in pricing for life — show pill for 30 days post-launch.
const LAUNCH_DATE = new Date("2026-05-25T00:00:00Z");
const FOUNDING_MEMBER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const isFoundingWindow = () => {
  const now = Date.now();
  return now >= LAUNCH_DATE.getTime() && now < LAUNCH_DATE.getTime() + FOUNDING_MEMBER_WINDOW_MS;
};


const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(false);
  const navigate = useNavigate();
  const { userPlan, isAuthenticated, refreshSubscription } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      track("upgrade_completed");
      setTimeout(() => {
        refreshSubscription?.();
      }, 4000);
    }
  }, [refreshSubscription]);

  const getDisplayPrice = (plan: Plan) => {
    if (plan.monthly === null) return null;
    if (isAnnual) return (plan.annual! / 12).toFixed(2);
    return plan.monthly.toFixed(2);
  };

  const handleCheckout = async (planId: string) => {
    track("upgrade_started", { plan: planId, period: isAnnual ? "annual" : "monthly" });
    if (planId === "enterprise") {
      window.location.href = "mailto:support@insiderpulse.org";
      return;
    }

    if (planId === "free") {
      if (isAuthenticated) navigate("/dashboard");
      else openAuthModal("signup", { ref: "pricing_free" });
      return;
    }

    if (!isAuthenticated) {
      openAuthModal("signup", { ref: `pricing_${planId}` });
      return;
    }

    try {
      console.log("[Pricing] Invoking manage-payments (action: checkout)", { planId, isAnnual });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: { session: freshSession }, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError || !freshSession?.access_token) {
        toast({
          title: "Session expired",
          description: "Please sign in again to continue.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-payments", {
        body: {
          action: "checkout",
          plan: planId,
          period: isAnnual ? "annual" : "monthly",
          success_url: window.location.origin + "/pricing?success=true",
          cancel_url: window.location.origin + "/pricing?canceled=true",
        },
        headers: {
          Authorization: `Bearer ${freshSession.access_token}`,
        },
      });

      console.log("[Pricing] manage-payments/checkout response", { data, error });

      if (error) {
        throw new Error(error.message || "Checkout failed");
      }

      if (!data?.url) {
        throw new Error("No checkout URL returned. Check Stripe configuration");
      }

      window.location.href = data.url;
    } catch (err: any) {
      console.error("[Pricing] Checkout error:", err);

      let errorMessage = "Something went wrong. Please try again.";
      try {
        const body = await err.context?.json();
        if (body?.error) errorMessage = body.error;
        console.error("[Pricing] Edge function error body:", body);
      } catch {}

      toast({
        title: "Checkout failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const isCurrentPlan = (planId: string) =>
    userPlan === planId || (planId === "premium" && userPlan === "admin");

  const getCtaLabel = (plan: Plan, current: boolean) => {
    if (current) return "Current plan";
    if (plan.plan_id === "free") return isAuthenticated ? "Switch to Free" : "Sign up free";
    if (plan.plan_id === "starter" && !isAnnual) return "Start 7-day free trial";
    if (plan.plan_id === "enterprise") return "Contact sales";
    return "Get started";
  };

  return (
    <div className="relative">
      {/* Subtle radial brand glow behind hero — landing-page treatment */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--ds-brand-primary) / 0.08), transparent 70%)",
        }}
      />

      <div className="space-y-10 md:space-y-12">
        <PageHeader
          eyebrow="Pricing"
          title="Simple, transparent pricing"
          description="Start with a 7-day free trial. All prices in USD."
        />

        {/* Billing toggle */}
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-full border border-ds-border bg-ds-surface p-1">
            <button
              onClick={() => setIsAnnual(false)}
              className={cn(
                "rounded-full px-5 py-1.5 text-body-sm font-medium transition-colors duration-fast",
                !isAnnual
                  ? "bg-ds-surface-elevated text-ds-text-primary"
                  : "text-ds-text-secondary hover:text-ds-text-primary",
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-1.5 text-body-sm font-medium transition-colors duration-fast",
                isAnnual
                  ? "bg-ds-surface-elevated text-ds-text-primary"
                  : "text-ds-text-secondary hover:text-ds-text-primary",
              )}
            >
              Annual
              <span className="rounded-full border border-ds-border px-2 py-0.5 font-mono text-[10px] text-ds-text-secondary">
                Save up to 29%
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => {
            const displayPrice = getDisplayPrice(plan);
            const isFreePlan = plan.plan_id === "free";
            const current = isCurrentPlan(plan.plan_id);

            return (
              <Card
                key={plan.plan_id}
                className={cn(
                  "relative flex flex-col rounded-ds-lg border bg-ds-surface p-6 transition-all duration-fast",
                  "hover:border-ds-border-strong hover:shadow-ds-md",
                  plan.popular
                    ? "border-ds-brand-primary shadow-ds-md"
                    : "border-ds-border",
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-2.5 left-6">
                    <span className="rounded-full border border-ds-brand-primary bg-ds-surface px-2.5 py-0.5 text-overline text-ds-brand-primary">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-h3 font-semibold text-ds-text-primary">
                    {plan.name}
                  </h3>
                  {isFoundingWindow() && (plan.plan_id === "starter" || plan.plan_id === "pro") && (
                    <span className="inline-block rounded-full border border-ds-brand-primary px-2 py-0.5 font-mono text-[10px] text-ds-text-secondary">
                      Founding member rate. Locks in your price for life.
                    </span>
                  )}
                  <p className="text-body-sm text-ds-text-secondary leading-snug min-h-[2.5rem]">
                    {plan.description}
                  </p>
                </div>

                <div className="pt-5 pb-6 border-b border-ds-border">
                  {isFreePlan ? (
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-4xl font-semibold text-ds-text-primary tabular-nums">
                        $0
                      </span>
                      <span className="text-body-sm text-ds-text-secondary">/month</span>
                    </div>
                  ) : displayPrice !== null ? (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-4xl font-semibold text-ds-text-primary tabular-nums">
                          ${displayPrice}
                        </span>
                        <span className="text-body-sm text-ds-text-secondary">/month</span>
                      </div>
                      {isAnnual && (
                        <p className="mt-1.5 text-body-sm text-ds-text-secondary">
                          <span className="font-mono tabular-nums">${plan.annual}</span>/year
                          {plan.annualSaving && (
                            <span className="ml-1.5 text-ds-text-muted">
                              · save <span className="font-mono">{plan.annualSaving}</span>
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-semibold text-ds-text-primary">
                        Custom
                      </span>
                    </div>
                  )}
                </div>

                <ul className="flex-1 space-y-2.5 pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-body-sm">
                      <Check className="h-4 w-4 mt-0.5 flex-shrink-0 text-signal-positive" strokeWidth={2.5} />
                      <span className="text-ds-text-primary leading-snug">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={cn(
                    "w-full mt-6",
                    !current && !isFreePlan && plan.plan_id !== "enterprise" && "cta-upgrade-pulse",
                  )}
                  variant={current || isFreePlan || plan.plan_id === "enterprise" ? "outline" : "default"}
                  onClick={() => handleCheckout(plan.plan_id)}
                  disabled={current}
                >
                  {getCtaLabel(plan, current)}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-body-sm text-ds-text-secondary">
          Starter plan includes a 7-day free trial. Card required, cancel anytime.
        </p>

        <div className="mx-auto max-w-3xl rounded-ds-md border border-ds-border bg-ds-surface p-4 text-body-sm text-ds-text-secondary leading-relaxed">
          <p>
            InsiderPulse provides general financial information and analytical tools only. It is
            not personal financial product advice and does not take into account your objectives,
            financial situation or needs. Scores, signals and themes are based on publicly
            available data and proprietary models that may be incomplete or wrong. Past
            performance is not a reliable indicator of future performance. You should consider
            obtaining advice from a licensed financial adviser and read the relevant Product
            Disclosure Statement before making any investment decision. Trading carries risk of
            loss; you are responsible for your own decisions and outcomes.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 text-body-sm text-ds-text-muted">
          <Link to="/privacy" className="hover:text-ds-text-primary transition-colors duration-fast">
            Privacy Policy
          </Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-ds-text-primary transition-colors duration-fast">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
