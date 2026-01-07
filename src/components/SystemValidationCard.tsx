import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ValidationResult {
  test_name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface SignalStats {
  total_24h: number;
  momentum_24h: number;
  last_score_update: string | null;
}

export function SystemValidationCard() {
  const [loading, setLoading] = useState(false);
  const [runningGenerators, setRunningGenerators] = useState(false);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [lastValidation, setLastValidation] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Get signal counts
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const [totalSignals, momentumSignals, lastScore] = await Promise.all([
        supabase
          .from('signals')
          .select('id', { count: 'exact', head: true })
          .gte('observed_at', twentyFourHoursAgo),
        supabase
          .from('signals')
          .select('id', { count: 'exact', head: true })
          .gte('observed_at', twentyFourHoursAgo)
          .or('signal_type.eq.momentum_5d_bullish,signal_type.eq.momentum_5d_bearish,signal_type.eq.momentum_20d_bullish,signal_type.eq.momentum_20d_bearish'),
        supabase
          .from('assets')
          .select('score_computed_at')
          .not('score_computed_at', 'is', null)
          .order('score_computed_at', { ascending: false })
          .limit(1)
      ]);

      setStats({
        total_24h: totalSignals.count || 0,
        momentum_24h: momentumSignals.count || 0,
        last_score_update: lastScore.data?.[0]?.score_computed_at || null
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const runSignalGenerators = async () => {
    setRunningGenerators(true);
    toast.info("Running signal generators...");
    
    try {
      // Run momentum generator
      const { error: momentumError } = await supabase.functions.invoke('generate-signals-from-momentum');
      if (momentumError) {
        console.error('Momentum generator error:', momentumError);
      } else {
        toast.success("Momentum signals generated");
      }

      // Run compute-asset-scores
      const { error: scoresError } = await supabase.functions.invoke('compute-asset-scores');
      if (scoresError) {
        console.error('Asset scores error:', scoresError);
      } else {
        toast.success("Asset scores computed");
      }

      // Refresh stats
      await fetchStats();
      toast.success("Signal generators completed!");
    } catch (error: unknown) {
      toast.error(`Generator failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRunningGenerators(false);
    }
  };

  const runValidation = async () => {
    setLoading(true);
    setValidationResults([]);
    
    try {
      const { data, error } = await supabase.functions.invoke('validate-scoring-system');
      
      if (error) {
        toast.error(`Validation failed: ${error.message}`);
        return;
      }

      if (data?.results) {
        setValidationResults(data.results);
        setLastValidation(new Date().toISOString());
        
        const passedCount = data.results.filter((r: ValidationResult) => r.passed).length;
        const totalCount = data.results.length;
        
        if (passedCount === totalCount) {
          toast.success(`All ${totalCount} tests passed!`);
        } else {
          toast.warning(`${passedCount}/${totalCount} tests passed`);
        }
      }

      // Refresh stats after validation
      await fetchStats();
    } catch (error: unknown) {
      toast.error(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (isoString: string | null) => {
    if (!isoString) return 'Never';
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d ago`;
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          System Validation
        </CardTitle>
        <CardDescription>
          Verify signal generation and scoring system health
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{stats?.total_24h ?? '-'}</div>
            <div className="text-xs text-muted-foreground">Signals (24h)</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{stats?.momentum_24h ?? '-'}</div>
            <div className="text-xs text-muted-foreground">Momentum (24h)</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-sm font-medium">{formatTimeAgo(stats?.last_score_update ?? null)}</div>
            <div className="text-xs text-muted-foreground">Last Score Update</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={runSignalGenerators}
            disabled={runningGenerators || loading}
            variant="outline"
            className="flex-1"
          >
            {runningGenerators ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Generators
          </Button>
          <Button 
            onClick={runValidation}
            disabled={loading || runningGenerators}
            className="flex-1"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Run Validation
          </Button>
        </div>

        {/* Validation Results */}
        {validationResults.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Validation Results</span>
              {lastValidation && (
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(lastValidation)}
                </span>
              )}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {validationResults.map((result, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30"
                >
                  {result.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{result.test_name}</div>
                    <div className="text-xs text-muted-foreground">{result.message}</div>
                  </div>
                  <Badge variant={result.passed ? "default" : "destructive"} className="shrink-0">
                    {result.passed ? "PASS" : "FAIL"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {validationResults.length === 0 && !loading && (
          <div className="text-center text-sm text-muted-foreground py-4">
            Click "Run Validation" to check system health
          </div>
        )}
      </CardContent>
    </Card>
  );
}