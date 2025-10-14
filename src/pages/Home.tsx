import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Play, Database } from "lucide-react";

const Home = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunity Radar Control"
        description="Run ETL pipelines and monitor system health"
      />

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
              <span className="text-sm text-muted-foreground">Last Ingest</span>
              <span className="text-sm font-medium text-foreground">Just now</span>
            </div>
          </CardContent>
        </Card>
      </div>

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
                <h4 className="font-medium text-foreground">Run Demo Ingest</h4>
                <p className="text-sm text-muted-foreground">
                  Click "Run Demo Mode" above to populate the database with test data
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div>
                <h4 className="font-medium text-foreground">Explore Radar</h4>
                <p className="text-sm text-muted-foreground">
                  Navigate to Radar page to see scored opportunities
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div>
                <h4 className="font-medium text-foreground">Configure Alerts</h4>
                <p className="text-sm text-muted-foreground">
                  Set thresholds in Alerts page to receive notifications
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
