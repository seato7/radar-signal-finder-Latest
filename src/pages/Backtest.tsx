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
            <CardDescription>Run a backtest to see results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>Configure parameters and run a backtest to see historical performance analysis.</p>
              <p className="text-sm mt-2">Results will appear here after running a backtest.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Backtest;
