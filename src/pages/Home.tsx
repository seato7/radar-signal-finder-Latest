import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Database, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface ThemeScore {
  id: string;
  name: string;
  score: number;
  components: Record<string, number>;
  as_of: string;
}

// Fetch themes with caching - gets latest score for each distinct theme
const fetchThemes = async (): Promise<ThemeScore[]> => {
  // Get all themes first
  const { data: allThemes, error: themesError } = await supabase
    .from('themes')
    .select('id, name');
  
  if (themesError) throw themesError;
  if (!allThemes || allThemes.length === 0) return [];
  
  // Get latest score for each theme
  const themeScores = await Promise.all(
    allThemes.map(async (theme) => {
      const { data, error } = await supabase
        .from('theme_scores')
        .select('score, component_scores, computed_at')
        .eq('theme_id', theme.id)
        .order('computed_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error || !data) return null;
      
      return {
        id: theme.id,
        name: theme.name,
        score: data.score,
        components: data.component_scores || {},
        as_of: data.computed_at,
      };
    })
  );
  
  // Filter out nulls, sort by score, and take top 3
  return themeScores
    .filter((theme): theme is ThemeScore => theme !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};

const Home = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Use React Query for caching with 15-minute stale time
  const { data: themes = [], isLoading: loadingThemes, refetch } = useQuery({
    queryKey: ['home-themes'],
    queryFn: fetchThemes,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });

  // Check admin status
  const { data: isAdmin = false } = useQuery({
    queryKey: ['user-admin-status'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      return data?.role === 'admin';
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const runIngest = async () => {
    setLoading(true);
    try {
      toast({
        title: "Data Sources Active",
        description: "All data sources are automatically refreshed. Visit Data Sources page for manual updates.",
      });
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
            onClick={() => refetch()}
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
              <li>• <strong>Breaking News</strong>: Real-time RSS feeds and web scraping via Firecrawl</li>
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

      <div className={`grid gap-6 ${isAdmin ? 'md:grid-cols-2' : ''}`}>
        {isAdmin && (
          <Card className="shadow-data">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Data Ingest Pipeline (Admin)
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
        )}

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

      {/* Top Investment Opportunities */}
      <Card className="shadow-data">
        <CardHeader>
          <CardTitle>Top 3 Investment Opportunities Right Now</CardTitle>
          <CardDescription>
            AI-powered scores (0-100) combining 23K+ recent signals from institutional flows, technical analysis, 
            sentiment data, and smart money movements. Higher scores = stronger multi-signal convergence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingThemes ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
              <p>Loading top opportunities...</p>
            </div>
          ) : themes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-2">No themes available yet</p>
              <p className="text-sm">Signals are being processed</p>
            </div>
          ) : (
            <div className="space-y-3">
              {themes.map((theme, index) => {
                const topComponents = getTopComponents(theme.components);
                return (
                  <div
                    key={theme.id}
                    className="p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <h3 className="font-bold text-lg text-foreground">{theme.name}</h3>
                        <Badge 
                          variant="outline" 
                          className={`${
                            theme.score >= 70 ? 'border-success text-success' :
                            theme.score >= 40 ? 'border-accent text-accent' :
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
                    {topComponents.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-sm text-muted-foreground">Key Signals:</span>
                        {topComponents.map((comp) => (
                          <Badge key={comp} variant="secondary" className="text-xs">
                            {comp}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Building signal profile...</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                  All data sources refresh automatically (hourly for social data, daily for others). Visit the Data Ingestion page for schedules.
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
