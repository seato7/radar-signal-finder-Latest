import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  actual: string | number;
  expected: string;
  critical: boolean;
}

interface DecileData {
  decile: number;
  avgScore: number;
  avgReturn: number;
  count: number;
}

interface SignalStats {
  total_24h: number;
  momentum_24h: number;
  last_score_update: string | null;
}

interface PipelineProgress {
  current: number;
  total: number;
  stage: string;
}

export function SystemValidationCard() {
  const [loading, setLoading] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [decileAnalysis, setDecileAnalysis] = useState<DecileData[]>([]);
  const [correlation, setCorrelation] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<{ assets_with_signals: number; total_assets: number; percentage: number } | null>(null);
  const [lastValidation, setLastValidation] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
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

  const runFullPipeline = async () => {
    setRunningPipeline(true);
    setPipelineProgress({ current: 0, total: 100, stage: 'Starting...' });
    
    try {
      // Stage 1: Run momentum generator with chunking
      let offset = 0;
      let totalAssets = 0;
      let chunkCount = 0;
      
      while (true) {
        setPipelineProgress({ 
          current: Math.min(40, chunkCount * 5), 
          total: 100, 
          stage: `Generating momentum signals (chunk ${chunkCount + 1})...` 
        });
        
        const { data, error } = await supabase.functions.invoke('generate-signals-from-momentum', {
          body: { offset }
        });
        
        if (error) {
          console.error('Momentum chunk error:', error);
          break;
        }
        
        totalAssets = data?.total_assets || totalAssets;
        chunkCount++;
        
        if (data?.complete || !data?.next_offset) {
          toast.success(`Momentum: ${chunkCount} chunks processed`);
          break;
        }
        
        offset = data.next_offset;
        
        // Safety limit
        if (chunkCount > 50) {
          console.warn('Safety limit reached');
          break;
        }
      }

      // Stage 2: Run other generators
      setPipelineProgress({ current: 50, total: 100, stage: 'Running breaking news generator...' });
      await supabase.functions.invoke('generate-signals-from-breaking-news');
      
      setPipelineProgress({ current: 60, total: 100, stage: 'Running Form4 generator...' });
      await supabase.functions.invoke('generate-signals-from-form4');

      // Stage 3: Compute scores
      setPipelineProgress({ current: 80, total: 100, stage: 'Computing asset scores...' });
      const { error: scoresError } = await supabase.functions.invoke('compute-asset-scores');
      if (scoresError) {
        console.error('Score computation error:', scoresError);
      }

      // Stage 4: Run validation
      setPipelineProgress({ current: 95, total: 100, stage: 'Running validation...' });
      await runValidation();

      setPipelineProgress({ current: 100, total: 100, stage: 'Complete!' });
      toast.success("Full pipeline completed!");
      
    } catch (error: unknown) {
      toast.error(`Pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRunningPipeline(false);
      setPipelineProgress(null);
      await fetchStats();
    }
  };

  const runValidation = async () => {
    setLoading(true);
    setValidationResults([]);
    setDecileAnalysis([]);
    setCorrelation(null);
    setCoverage(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('validate-scoring-system');
      
      if (error) {
        toast.error(`Validation failed: ${error.message}`);
        return;
      }

      if (data?.results) {
        setValidationResults(data.results);
        setLastValidation(new Date().toISOString());
        
        if (data.decile_analysis) {
          setDecileAnalysis(data.decile_analysis);
        }
        if (typeof data.correlation === 'number') {
          setCorrelation(data.correlation);
        }
        if (data.coverage) {
          setCoverage(data.coverage);
        }
        
        const passedCount = data.results.filter((r: ValidationResult) => r.passed).length;
        const criticalPassed = data.results.filter((r: ValidationResult) => r.critical && r.passed).length;
        const criticalTotal = data.results.filter((r: ValidationResult) => r.critical).length;
        const totalCount = data.results.length;
        
        if (passedCount === totalCount) {
          toast.success(`✅ All ${totalCount} tests passed! (${criticalPassed}/${criticalTotal} critical)`);
        } else {
          toast.warning(`${passedCount}/${totalCount} tests passed (${criticalPassed}/${criticalTotal} critical)`);
        }
      }

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

  const getCorrelationColor = (corr: number) => {
    if (corr >= 0.05) return 'text-green-500';
    if (corr >= 0) return 'text-green-400';
    if (corr >= -0.05) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          System Validation
        </CardTitle>
        <CardDescription>
          Verify signal generation and scoring system health across all assets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{stats?.total_24h?.toLocaleString() ?? '-'}</div>
            <div className="text-xs text-muted-foreground">Signals (24h)</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{stats?.momentum_24h?.toLocaleString() ?? '-'}</div>
            <div className="text-xs text-muted-foreground">Momentum (24h)</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-sm font-medium">{formatTimeAgo(stats?.last_score_update ?? null)}</div>
            <div className="text-xs text-muted-foreground">Last Score Update</div>
          </div>
        </div>

        {/* Coverage Stats */}
        {coverage && (
          <div className="p-3 rounded-lg bg-muted/30 border">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Signal Coverage</span>
              <Badge variant={coverage.percentage >= 15 ? "default" : "secondary"}>
                {coverage.percentage.toFixed(1)}%
              </Badge>
            </div>
            <Progress value={Math.min(coverage.percentage, 100)} className="h-2" />
            <div className="text-xs text-muted-foreground mt-1">
              {coverage.assets_with_signals.toLocaleString()} of {coverage.total_assets.toLocaleString()} assets have signals
            </div>
          </div>
        )}

        {/* Correlation Display */}
        {correlation !== null && (
          <div className="p-3 rounded-lg bg-muted/30 border">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Score-Return Correlation</span>
              <span className={`text-lg font-bold ${getCorrelationColor(correlation)}`}>
                {correlation >= 0 ? '+' : ''}{correlation.toFixed(4)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {correlation >= 0 ? 'Higher scores predict higher returns' : 'Inverse correlation detected'}
            </div>
          </div>
        )}

        {/* Decile Analysis Table */}
        {decileAnalysis.length > 0 && (
          <div className="p-3 rounded-lg bg-muted/30 border">
            <div className="text-sm font-medium mb-2">Score vs Return by Decile</div>
            <div className="grid grid-cols-5 gap-1 text-xs">
              <div className="font-medium">Decile</div>
              <div className="font-medium">Avg Score</div>
              <div className="font-medium">Avg Return</div>
              <div className="font-medium">Count</div>
              <div></div>
              {[decileAnalysis[0], decileAnalysis[4], decileAnalysis[9]].filter(Boolean).map((d) => (
                <>
                  <div key={`d-${d.decile}`}>D{d.decile}</div>
                  <div key={`s-${d.decile}`}>{d.avgScore.toFixed(1)}</div>
                  <div key={`r-${d.decile}`} className={d.avgReturn >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {d.avgReturn >= 0 ? '+' : ''}{d.avgReturn.toFixed(2)}%
                  </div>
                  <div key={`c-${d.decile}`}>{d.count}</div>
                  <div key={`l-${d.decile}`}>{d.decile === 1 ? 'Lowest' : d.decile === 5 ? 'Middle' : 'Highest'}</div>
                </>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline Progress */}
        {pipelineProgress && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">{pipelineProgress.stage}</span>
              <span className="text-sm">{pipelineProgress.current}%</span>
            </div>
            <Progress value={pipelineProgress.current} className="h-2" />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={runFullPipeline}
            disabled={runningPipeline || loading}
            variant="default"
            className="flex-1"
          >
            {runningPipeline ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Run Full Pipeline
          </Button>
          <Button 
            onClick={runValidation}
            disabled={loading || runningPipeline}
            variant="outline"
            className="flex-1"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Validate Only
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
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {validationResults.map((result, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30"
                >
                  {result.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  ) : result.critical ? (
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1">
                      {result.name.replace(/_/g, ' ')}
                      {result.critical && <Badge variant="outline" className="text-[10px] px-1">critical</Badge>}
                    </div>
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

        {validationResults.length === 0 && !loading && !runningPipeline && (
          <div className="text-center text-sm text-muted-foreground py-4">
            Click "Run Full Pipeline" to process all assets and validate
          </div>
        )}
      </CardContent>
    </Card>
  );
}
