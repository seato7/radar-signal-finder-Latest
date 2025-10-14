import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Info } from "lucide-react";
import { useState, useEffect } from "react";

const themes = [
  {
    name: "DeFi Expansion",
    count: 23,
    strength: 85,
    trend: "up",
    topAssets: ["UNI", "AAVE", "CRV"],
  },
  {
    name: "Layer 2 Scaling",
    count: 18,
    strength: 78,
    trend: "up",
    topAssets: ["MATIC", "ARB", "OP"],
  },
  {
    name: "Institutional Flow",
    count: 15,
    strength: 72,
    trend: "stable",
    topAssets: ["BTC", "ETH", "SOL"],
  },
  {
    name: "Technical Breakout",
    count: 12,
    strength: 68,
    trend: "up",
    topAssets: ["LINK", "DOT", "ATOM"],
  },
];

const Themes = () => {
  const [whyNowData, setWhyNowData] = useState<Record<string, any>>({});
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    // Fetch "why now?" for first theme as example
    const fetchWhyNow = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/themes/theme-ai-liquid-cooling/why_now`);
        if (response.ok) {
          const data = await response.json();
          setWhyNowData({ "DeFi Expansion": data });
        }
      } catch (error) {
        console.error("Failed to fetch why now:", error);
      }
    };
    fetchWhyNow();
  }, [API_BASE]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Theme Analysis"
        description="Trending narratives and market themes"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {themes.map((theme) => (
          <Card key={theme.name} className="shadow-data">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="mb-2">{theme.name}</CardTitle>
                  <CardDescription>{theme.count} active opportunities</CardDescription>
                </div>
                {theme.trend === "up" && (
                  <Badge variant="outline" className="border-success text-success">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    Trending
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {whyNowData[theme.name]?.summary && (
                <div className="p-3 rounded-md bg-muted/30 border border-border">
                  <div className="flex items-start gap-2 mb-2">
                    <Info className="h-4 w-4 text-primary mt-0.5" />
                    <span className="text-sm font-medium text-foreground">Why now?</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {whyNowData[theme.name].summary}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Theme Strength</span>
                  <span className="font-bold text-primary">{theme.strength}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-chrome"
                    style={{ width: `${theme.strength}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-2">Top Assets</div>
                <div className="flex gap-2">
                  {theme.topAssets.map((asset) => (
                    <Badge key={asset} variant="secondary">
                      {asset}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Themes;
