import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Activity, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunity Dashboard"
        description="Real-time market intelligence and scoring metrics"
        action={
          <Button variant="outline" className="shadow-chrome">
            Export Data
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Opportunities"
          value={47}
          icon={Target}
          trend={{ value: 12.5, positive: true }}
        />
        <MetricCard
          title="High Confidence"
          value={18}
          icon={Zap}
          trend={{ value: 8.2, positive: true }}
        />
        <MetricCard
          title="Avg Score"
          value="82.3"
          icon={Activity}
          trend={{ value: 3.1, positive: true }}
        />
        <MetricCard
          title="Hit Rate (7d)"
          value="71%"
          icon={TrendingUp}
          trend={{ value: 2.8, positive: false }}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Top Opportunities</CardTitle>
            <CardDescription>Highest scoring signals in the last 24h</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "BTC/USD", score: 94.2, theme: "Momentum", change: "+5.2%" },
                { name: "ETH/USD", score: 89.7, theme: "Volume Spike", change: "+3.8%" },
                { name: "SOL/USD", score: 87.4, theme: "Sentiment", change: "+2.1%" },
              ].map((opp) => (
                <div key={opp.name} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">{opp.name}</div>
                    <div className="text-xs text-muted-foreground">{opp.theme}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-primary">{opp.score}</div>
                    <div className="text-xs text-success">{opp.change}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Trending Themes</CardTitle>
            <CardDescription>Most active themes across all signals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: "DeFi Expansion", count: 23, strength: 85 },
                { name: "Layer 2 Scaling", count: 18, strength: 78 },
                { name: "Institutional Flow", count: 15, strength: 72 },
                { name: "Technical Breakout", count: 12, strength: 68 },
              ].map((theme) => (
                <div key={theme.name} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground font-medium">{theme.name}</span>
                    <span className="text-muted-foreground">{theme.count} signals</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-chrome rounded-full"
                      style={{ width: `${theme.strength}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
