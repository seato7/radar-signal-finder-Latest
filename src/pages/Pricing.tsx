import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
    name: "Starter",
    monthly: 9.99,
    annual: 89,
    annualSaving: "26%",
    plan_id: "starter",
    description: "Everything you need to start investing smarter",
    features: [
      "1 Active Signal",
      "Asset Radar — Stocks only",
      "1 Theme",
      "AI Assistant — 5 messages/day",
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
      "Asset Radar — Stocks, ETFs & Forex",
      "3 Themes",
      "AI Assistant — 20 messages/day",
      "5 Alerts",
      "10 Watchlist slots",
    ],
    popular: false,
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
      "Full Asset Radar — All asset classes + scores",
      "Unlimited Themes",
      "AI Assistant — Unlimited",
      "Unlimited Alerts",
      "Unlimited Watchlist slots",
      "Analytics dashboard",
      "First access to Trading Bots",
    ],
    popular: true,
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
      "API access",
    ],
    popular: false,
  },
];

const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(false);
  const navigate = useNavigate();
  const { userPlan, isAuthenticated, refreshSubscription } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      setTimeout(() => {
        refreshSubscription?.();
      }, 2000);
    }
  }, [refreshSubscription]);

  const getDisplayPrice = (plan: Plan) => {
    if (plan.monthly === null) return null;
    if (isAnnual) return (plan.annual! / 12).toFixed(2);
    return plan.monthly.toFixed(2);
  };

  const handleCheckout = async (planId: string) => {
    if (planId === "enterprise") {
      window.location.href = "mailto:support@insiderpulse.org";
      return;
    }

    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }

    try {
      console.log("[Pricing] Invoking manage-payments/checkout", { planId, isAnnual });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      // Refresh to ensure token is valid and not stale
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

      const { data, error } = await supabase.functions.invoke("manage-payments/checkout", {
        body: {
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
        throw new Error("No checkout URL returned — check Stripe configuration");
      }

      window.location.href = data.url;
    } catch (err: any) {
      console.error("[Pricing] Checkout error:", err);
      toast({
        title: "Checkout failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const isCurrentPlan = (planId: string) =>
    userPlan === planId || (planId === "premium" && userPlan === "admin");

  return (
    <div className="space-y-10">
      <PageHeader
        title="Simple, Transparent Pricing"
        description="Start with a 7-day free trial. No credit card required."
      />

      {/* Billing toggle */}
      <div className="flex flex-col items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 backdrop-blur p-1">
          <button
            onClick={() => setIsAnnual(false)}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-all ${
              !isAnnual
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setIsAnnual(true)}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-all flex items-center gap-2 ${
              isAnnual
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isAnnual
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-success/20 text-success"
              }`}
            >
              Save up to 29%
            </span>
          </button>
        </div>
        <p className="text-xs text-muted-foreground">All prices in USD</p>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const displayPrice = getDisplayPrice(plan);
          const current = isCurrentPlan(plan.plan_id);

          return (
            <Card
              key={plan.plan_id}
              className={`relative flex flex-col shadow-data transition-all ${
                plan.popular
                  ? "border-primary bg-card/90 backdrop-blur ring-1 ring-primary/30"
                  : "border-border/50 bg-card/80 backdrop-blur"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold flex items-center gap-1 shadow-lg">
                    <Zap className="h-3 w-3" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-4 pt-8">
                <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                <CardDescription className="text-sm leading-snug">
                  {plan.description}
                </CardDescription>

                <div className="pt-4">
                  {displayPrice !== null ? (
                    <div>
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-extrabold text-foreground">
                          ${displayPrice}
                        </span>
                        <span className="text-muted-foreground pb-1">/mo</span>
                      </div>
                      {isAnnual && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ${plan.annual}/yr
                          {plan.annualSaving && (
                            <span className="ml-1.5 text-success font-medium">
                              — save {plan.annualSaving}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-extrabold text-foreground">
                        Custom
                      </span>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-col flex-1 gap-6">
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                          plan.popular ? "text-primary" : "text-success"
                        }`}
                      />
                      <span className="text-muted-foreground leading-snug">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full font-semibold ${
                    plan.popular && !current
                      ? "bg-gradient-to-r from-primary to-accent hover:opacity-90"
                      : ""
                  }`}
                  variant={current ? "outline" : plan.popular ? "default" : "outline"}
                  onClick={() => handleCheckout(plan.plan_id)}
                  disabled={current}
                >
                  {current
                    ? "Current Plan"
                    : plan.plan_id === "enterprise"
                    ? "Contact Us"
                    : plan.plan_id === "starter"
                    ? "Start 7-Day Free Trial"
                    : "Get Started"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-center text-sm text-muted-foreground">
        Starter plan includes a 7-day free trial. No credit card required.
      </p>
    </div>
  );
};

export default Pricing;
