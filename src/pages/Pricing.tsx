import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

const Pricing = () => {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "",
      description: "Get started with basic features",
      features: [
        "1 paper trading bot",
        "1 alert",
        "CSV exports only",
        "30-day backtest horizon"
      ],
      cta: "Current Plan",
      plan_id: "free"
    },
    {
      name: "Lite",
      price: "$7.99",
      period: "/mo",
      description: "Perfect for beginners",
      features: [
        "3 paper trading bots",
        "10 alerts",
        "CSV exports",
        "90-day backtest horizon"
      ],
      cta: "Start Lite",
      plan_id: "lite",
      popular: true
    },
    {
      name: "Starter",
      price: "$19.99",
      period: "/mo",
      description: "For serious traders",
      features: [
        "3 live-eligible bots",
        "25 alerts",
        "CSV & Parquet exports",
        "Unlimited backtest horizon"
      ],
      cta: "Start Starter",
      plan_id: "starter"
    },
    {
      name: "Pro",
      price: "$32.99",
      period: "/mo",
      description: "Advanced trading",
      features: [
        "10 live-eligible bots",
        "Unlimited alerts",
        "Priority support",
        "CSV & Parquet exports",
        "Unlimited backtest horizon"
      ],
      cta: "Start Pro",
      plan_id: "pro"
    },
    {
      name: "Premium",
      price: "$59.99",
      period: "/mo",
      description: "Maximum power",
      features: [
        "Unlimited live-eligible bots",
        "Unlimited alerts",
        "Priority support",
        "Advanced analytics",
        "CSV & Parquet exports",
        "Unlimited backtest horizon"
      ],
      cta: "Start Premium",
      plan_id: "premium"
    },
    {
      name: "Enterprise",
      price: "Contact",
      period: "",
      description: "Custom solutions for teams",
      features: [
        "Unlimited bots & alerts",
        "Dedicated support",
        "Custom integrations",
        "API access",
        "All export formats"
      ],
      cta: "Contact Sales",
      plan_id: "enterprise"
    }
  ];

  const handleCheckout = async (planId: string) => {
    if (planId === "free") return;
    
    if (planId === "enterprise") {
      window.location.href = "mailto:sales@opportunityradar.com";
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: planId,
          user_id: "default",
          success_url: window.location.origin + "/pricing?success=true",
          cancel_url: window.location.origin + "/pricing?canceled=true"
        })
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing Plans"
        description="Choose the perfect plan for your trading needs"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {plans.map((plan) => (
          <Card key={plan.name} className={`shadow-data relative ${plan.popular ? 'border-primary' : ''}`}>
            {plan.popular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                Most Popular
              </Badge>
            )}
            <CardHeader>
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="pt-4">
                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                className="w-full" 
                variant={plan.plan_id === "free" ? "outline" : "default"}
                onClick={() => handleCheckout(plan.plan_id)}
              >
                {plan.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Pricing;
