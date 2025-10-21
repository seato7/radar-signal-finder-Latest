import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Play, Database, RefreshCw } from "lucide-react";

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
      const response = await fetch(`http://localhost:8000/api/radar/themes?days=45`);
      const data = await response.json();
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

  const runIngest = async (mode: 'demo' | 'real') => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/ingest/run?mode=${mode}`, {
        method: 'POST'
      });
      const data = await response.json();
      
      toast({
        title: `${mode === 'demo' ? 'Demo' : 'Real'} Ingest Complete`,
        description: `Created ${data.summary.signals_created || 0} signals`,
      });

      // Refresh themes after ingest
      setTimeout(() => {
        fetchThemes();
      }, 1000);
    } catch (error) {
      toast({
        title: "Ingest Failed",
        description: "Could not connect to backend API",
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
        title="Opportunity Radar Control"
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
              <Play className="h-5 w-5 text-accent" />
              Run Ingest Pipeline
            </CardTitle>
            <CardDescription>
              Execute ETL to fetch and process latest market signals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => runIngest('demo')}
              disabled={loading}
              className="w-full bg-gradient-chrome text-primary-foreground hover:opacity-90"
            >
              <Database className="mr-2 h-4 w-4" />
              Run Demo Mode
            </Button>
            <Button
              onClick={() => runIngest('real')}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              <Play className="mr-2 h-4 w-4" />
              Run Real Mode
            </Button>
            <p className="text-xs text-muted-foreground">
              Demo mode generates synthetic signals for testing. Real mode fetches live data.
            </p>
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
          <CardTitle>Quick Start Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                1
              </div>
              <div>
                <h4 className="font-medium text-foreground">Seed Canonical Themes</h4>
                <p className="text-sm text-muted-foreground">
                  Run <code className="px-1 py-0.5 bg-muted rounded text-xs">make seed</code> in terminal to load the 3 themes
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div>
                <h4 className="font-medium text-foreground">Run Demo Ingest</h4>
                <p className="text-sm text-muted-foreground">
                  Click "Run Demo Mode" above to populate signals with test data
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div>
                <h4 className="font-medium text-foreground">Explore Results</h4>
                <p className="text-sm text-muted-foreground">
                  Navigate to Radar or Themes page to see scored opportunities
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
