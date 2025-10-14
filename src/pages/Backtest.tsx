import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Play } from "lucide-react";

const Backtest = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Backtest Engine"
        description="Validate scoring models against historical data"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Configure Backtest</CardTitle>
            <CardDescription>Set parameters for historical analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input id="start-date" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input id="end-date" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold">Score Threshold</Label>
              <Input id="threshold" type="number" placeholder="85" />
            </div>
            <Button className="w-full bg-gradient-chrome text-primary-foreground">
              <Play className="mr-2 h-4 w-4" />
              Run Backtest
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Recent Results</CardTitle>
            <CardDescription>Last 3 backtest runs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { period: "Q4 2024", hitRate: 72.3, opportunities: 156, avgReturn: 8.4 },
                { period: "Q3 2024", hitRate: 68.9, opportunities: 142, avgReturn: 6.7 },
                { period: "Q2 2024", hitRate: 71.2, opportunities: 138, avgReturn: 7.9 },
              ].map((result) => (
                <div key={result.period} className="p-4 rounded-md bg-muted/50 border border-border space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-foreground">{result.period}</span>
                    <span className="text-sm text-primary font-bold">{result.hitRate}% Hit Rate</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Opportunities</div>
                      <div className="font-medium text-foreground">{result.opportunities}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg Return</div>
                      <div className="font-medium text-success">+{result.avgReturn}%</div>
                    </div>
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

export default Backtest;
