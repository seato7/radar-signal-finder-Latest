import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ExternalLink, Clock } from "lucide-react";

const Asset = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="BTC/USD"
        description="Detailed opportunity analysis"
        action={
          <Button variant="outline" className="shadow-chrome">
            <Star className="mr-2 h-4 w-4" />
            Add to Watchlist
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-data lg:col-span-2">
          <CardHeader>
            <CardTitle>Opportunity Score: 94.2</CardTitle>
            <CardDescription>Score breakdown and contributing factors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                { component: "Momentum", weight: 0.35, score: 96.5, color: "text-success" },
                { component: "Sentiment", weight: 0.25, score: 92.8, color: "text-accent" },
                { component: "Volume", weight: 0.25, score: 94.1, color: "text-primary" },
                { component: "Technical", weight: 0.15, score: 89.3, color: "text-warning" },
              ].map((comp) => (
                <div key={comp.component} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{comp.component}</span>
                      <Badge variant="outline" className="text-xs">
                        Weight: {(comp.weight * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <span className={`font-bold ${comp.color}`}>{comp.score}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-chrome"
                      style={{ width: `${comp.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-data">
            <CardHeader>
              <CardTitle className="text-base">Active Themes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {["Momentum", "Volume Spike", "Institutional", "Technical Breakout"].map((theme) => (
                  <Badge key={theme} variant="secondary">
                    {theme}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-data">
            <CardHeader>
              <CardTitle className="text-base">Where to Buy (AU)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {["CoinSpot", "Binance AU", "Swyftx"].map((exchange) => (
                <Button
                  key={exchange}
                  variant="outline"
                  className="w-full justify-between"
                >
                  {exchange}
                  <ExternalLink className="h-4 w-4" />
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-data">
        <CardHeader>
          <CardTitle>Signal Citations</CardTitle>
          <CardDescription>Data sources and timestamps</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { source: "CoinGecko API", metric: "Price & Volume", timestamp: "2 minutes ago" },
              { source: "Twitter Sentiment", metric: "Social Score", timestamp: "5 minutes ago" },
              { source: "On-chain Analytics", metric: "Whale Activity", timestamp: "8 minutes ago" },
            ].map((citation, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                <div>
                  <div className="font-medium text-foreground">{citation.source}</div>
                  <div className="text-sm text-muted-foreground">{citation.metric}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {citation.timestamp}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Asset;
