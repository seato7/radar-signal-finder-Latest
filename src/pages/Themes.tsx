import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";

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
