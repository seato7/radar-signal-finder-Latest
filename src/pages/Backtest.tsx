import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Play, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Backtest = () => {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [threshold, setThreshold] = useState("85");
  const [loading, setLoading] = useState(false);

  const handleDownload = async (format: 'csv' | 'parquet') => {
    try {
      const { data } = await supabase.from('signals').select('*');
      const csv = JSON.stringify(data);
      const blob = new Blob([csv], { type: format === 'csv' ? 'text/csv' : 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signals.${format}`;
      a.click();
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export data",
        variant: "destructive"
      });
    }
  };

  const handleRunBacktest = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Missing Dates",
        description: "Please select both start and end dates",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-backtest', {
        body: {
          start_date: startDate,
          end_date: endDate,
          threshold: parseFloat(threshold)
        }
      });

      if (error) throw error;

      toast({
        title: "Backtest Complete",
        description: `Hit rate: ${data.hit_rate}%`
      });
    } catch (error) {
      toast({
        title: "Backtest Failed",
        description: "Could not run backtest",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backtest Engine"
        description="Validate scoring models against historical data"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleDownload('csv')}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownload('parquet')}>
              <Download className="mr-2 h-4 w-4" />
              Export Parquet
            </Button>
          </div>
        }
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
              <Input 
                id="start-date" 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input 
                id="end-date" 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold">Score Threshold</Label>
              <Input 
                id="threshold" 
                type="number" 
                placeholder="85"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleRunBacktest}
              disabled={loading}
              className="w-full bg-gradient-chrome text-primary-foreground"
            >
              <Play className="mr-2 h-4 w-4" />
              {loading ? "Running..." : "Run Backtest"}
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
                { period: "Q1 2025", hitRate: 72.3, opportunities: 156, avgReturn: 8.4 },
                { period: "Q4 2024", hitRate: 68.9, opportunities: 142, avgReturn: 6.7 },
                { period: "Q3 2024", hitRate: 71.2, opportunities: 138, avgReturn: 7.9 },
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
