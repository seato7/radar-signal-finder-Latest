import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Play, Database, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ThemeScore {
  id: string;
  name: string;
  score: number;
  components: Record<string, number>;
  as_of: string;
}

const Home = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [themes, setThemes] = useState<ThemeScore[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);

  const fetchThemes = async () => {
    setLoadingThemes(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-themes', {
        body: { days: 45 }
      });
      
      if (error) throw error;
      setThemes(data.slice(0, 3)); // Top 3 themes
    } catch (error) {
      console.error("Failed to fetch themes:", error);
    } finally {
      setLoadingThemes(false);
    }
  };

  useEffect(() => {
    fetchThemes();
  }, []);

  const runIngest = async () => {
    setLoading(true);
    try {
      // Note: Data ingestion now runs automatically via scheduled edge functions
      // This manual trigger is kept for backward compatibility
      toast({
        title: "Data Sources Active",
        description: "All data sources are automatically refreshed. Visit Data Sources page for manual updates.",
      });

      setTimeout(() => fetchThemes(), 1000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not refresh themes",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getTopComponents = (components: Record<string, number>) => {
    return Object.entries(components)
      .filter(([_, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insider Pulse Control"
        description="Run ETL pipelines and monitor system health"
        action={
          <Button
            onClick={fetchThemes}
            disabled={loadingThemes}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingThemes ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* How It Works Section */}
      <Card className="shadow-data border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            How Insider Pulse Works
          </CardTitle>
          <CardDescription>
            Multi-signal investment analysis combining 11+ alternative data sources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">📊 Core Data Sources (MongoDB Backend)</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• <strong>13F Holdings</strong>: Hedge fund and institutional investor positions</li>
              <li>• <strong>Form 4 Filings</strong>: Insider buying and selling by company executives</li>
              <li>• <strong>Policy Feeds</strong>: Government policy changes affecting markets</li>
              <li>• <strong>ETF Flows</strong>: Money flowing into and out of ETFs</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-2">🔍 Alternative Data Sources (Supabase)</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• <strong>Social Sentiment</strong>: Reddit & StockTwits sentiment analysis</li>
              <li>• <strong>Congressional Trades</strong>: Real-time tracking of Congress stock trades</li>
              <li>• <strong>Patent Filings</strong>: Technology innovation indicators from USPTO</li>
              <li>• <strong>Search Trends</strong>: Google search volume changes</li>
              <li>• <strong>Short Interest</strong>: Short squeeze potential indicators</li>
              <li>• <strong>Earnings Sentiment</strong>: Post-earnings reaction analysis</li>
              <li>• <strong>Breaking News</strong>: Real-time web search via Perplexity AI</li>
            </ul>
          </div>

          <div className="pt-2 border-t">
            <h4 className="font-semibold mb-2">💡 How to Use</h4>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>1. Automated Updates:</strong> All data sources refresh automatically (hourly for social data, daily for others)
              </p>
              <p>
                <strong>2. Manual Refresh:</strong> Visit <strong>Data Sources</strong> page to manually trigger any ingestion
              </p>
              <p>
                <strong>3. AI Analysis:</strong> Ask the <strong>AI Assistant</strong> questions like "What's happening with NVDA?" 
                to get comprehensive analysis across all 11 data sources
              </p>
              <p>
                <strong>4. Explore Signals:</strong> Use <strong>Radar</strong> and <strong>Themes</strong> pages to discover 
                investment opportunities where multiple signals converge
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Plan Status Card */}
      <Card className="shadow-data border-primary/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Subscription</CardTitle>
              <CardDescription>Current plan and features</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold capitalize mb-1">Premium Plan</div>
              <div className="text-sm text-muted-foreground">
                ✓ Unlimited bots • ✓ Unlimited alerts • ✓ Advanced analytics
              </div>
            </div>
            <Badge variant="default" className="text-base px-4 py-2">
              Active
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-data">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Data Ingest Pipeline
              </CardTitle>
              <CardDescription>
                Fetch latest market signals and data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={runIngest}
                disabled={loading}
                className="w-full justify-start bg-gradient-chrome text-primary-foreground"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Processing...' : 'Run Data Ingest'}
              </Button>
            </CardContent>
          </Card>

        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current operational metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <span className="text-sm text-muted-foreground">API Status</span>
              <span className="text-sm font-medium text-success">● Online</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <span className="text-sm text-muted-foreground">Database</span>
              <span className="text-sm font-medium text-success">● Connected</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <span className="text-sm text-muted-foreground">Active Themes</span>
              <span className="text-sm font-medium text-foreground">{themes.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Theme Scores Table */}
      {themes.length > 0 && (
        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Today's Theme Scores</CardTitle>
            <CardDescription>Top scored themes with component breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {themes.map((theme) => {
                const topComponents = getTopComponents(theme.components);
                return (
                  <div
                    key={theme.id}
                    className="p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-lg text-foreground">{theme.name}</h3>
                        <Badge 
                          variant="outline" 
                          className={`${
                            theme.score >= 80 ? 'border-success text-success' :
                            theme.score >= 60 ? 'border-accent text-accent' :
                            'border-warning text-warning'
                          }`}
                        >
                          Score: {theme.score.toFixed(1)}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(theme.as_of).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-sm text-muted-foreground">Top Components:</span>
                      {topComponents.map((comp) => (
                        <Badge key={comp} variant="secondary" className="text-xs">
                          {comp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-data">
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>Your first steps to discovering investment opportunities</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                1
              </div>
              <div>
                <h4 className="font-medium text-foreground">Refresh Market Data</h4>
                <p className="text-sm text-muted-foreground">
                  Click "Run Data Ingest" above to fetch the latest market signals across all 11+ data sources
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div>
                <h4 className="font-medium text-foreground">Discover Investment Themes</h4>
                <p className="text-sm text-muted-foreground">
                  Visit the <strong>Themes</strong> page to see investment opportunities where multiple signals converge
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div>
                <h4 className="font-medium text-foreground">Set Up Alerts & Bots</h4>
                <p className="text-sm text-muted-foreground">
                  Create custom <strong>Alerts</strong> to track specific opportunities, or deploy <strong>Trading Bots</strong> to automate your strategies
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Home;
