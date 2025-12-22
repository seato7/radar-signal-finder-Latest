import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface FunctionStatus {
  function_name: string;
  last_run: string | null;
  status: string;
  rows_inserted: number;
  rows_skipped: number;
  fallback_used: string | null;
  duration_ms: number;
  source_used: string;
  error_message: string | null;
  minutes_stale: number | null;
  expected_interval: number;
}

export default function IngestionBurnin() {
  const [functions, setFunctions] = useState<FunctionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [healthSummary, setHealthSummary] = useState({
    total: 0,
    healthy: 0,
    stale: 0,
    failed: 0,
    coverage: 0
  });

  const FUNCTION_INTERVALS: Record<string, number> = {
    'ingest-prices-yahoo': 15,
    'ingest-breaking-news': 180,
    'ingest-news-sentiment': 180,
    'ingest-smart-money': 360,
    'ingest-pattern-recognition': 360,
    'ingest-advanced-technicals': 360,
    'ingest-ai-research': 360,
    'ingest-etf-flows': 360,
    'ingest-form4': 360,
    'ingest-policy-feeds': 360,
    'ingest-forex-sentiment': 360,
    'ingest-forex-technicals': 360,
    'ingest-crypto-onchain': 360,
    'ingest-dark-pool': 360,
    'ingest-sec-13f-edgar': 360,
    'ingest-search-trends': 360,
    'ingest-short-interest': 360,
    'ingest-earnings': 360,
    'ingest-stocktwits': 360,
    'ingest-supply-chain': 360,
    'ingest-job-postings': 360,
    'ingest-congressional-trades': 360,
    'ingest-options-flow': 360,
    'ingest-reddit-sentiment': 360,
    'ingest-cot-reports': 360,
    'ingest-cot-cftc': 360,
    'ingest-finra-darkpool': 360,
    'ingest-patents': 360,
    'ingest-economic-calendar': 360,
    'ingest-fred-economics': 360,
  };

  const fetchFunctionStats = async () => {
    try {
      const { data, error } = await supabase
        .from('function_status')
        .select('*')
        .order('executed_at', { ascending: false });

      if (error) throw error;

      // Group by function name and get latest status
      const latestByFunction = new Map<string, FunctionStatus>();
      
      data?.forEach((record: any) => {
        if (!latestByFunction.has(record.function_name)) {
          const expectedInterval = FUNCTION_INTERVALS[record.function_name] || 360;
          const lastRun = record.executed_at ? new Date(record.executed_at) : null;
          const minutesStale = lastRun ? Math.round((Date.now() - lastRun.getTime()) / 60000) : null;

          latestByFunction.set(record.function_name, {
            function_name: record.function_name,
            last_run: record.executed_at,
            status: record.status,
            rows_inserted: record.rows_inserted || 0,
            rows_skipped: record.rows_skipped || 0,
            fallback_used: record.fallback_used,
            duration_ms: record.duration_ms || 0,
            source_used: record.source_used || 'unknown',
            error_message: record.error_message,
            minutes_stale: minutesStale,
            expected_interval: expectedInterval
          });
        }
      });

      const functionList = Array.from(latestByFunction.values());
      
      // Add functions that haven't run yet
      Object.keys(FUNCTION_INTERVALS).forEach(funcName => {
        if (!latestByFunction.has(funcName)) {
          functionList.push({
            function_name: funcName,
            last_run: null,
            status: 'never_run',
            rows_inserted: 0,
            rows_skipped: 0,
            fallback_used: null,
            duration_ms: 0,
            source_used: 'unknown',
            error_message: null,
            minutes_stale: null,
            expected_interval: FUNCTION_INTERVALS[funcName]
          });
        }
      });

      setFunctions(functionList);

      // Calculate summary
      const total = functionList.length;
      const healthy = functionList.filter(f => 
        f.status === 'success' && 
        (f.minutes_stale === null || f.minutes_stale < f.expected_interval * 2)
      ).length;
      const stale = functionList.filter(f => 
        f.minutes_stale && f.minutes_stale > f.expected_interval * 2
      ).length;
      const failed = functionList.filter(f => f.status === 'failure').length;
      const coverage = Math.round((healthy / total) * 100);

      setHealthSummary({ total, healthy, stale, failed, coverage });
    } catch (error) {
      console.error('Error fetching function stats:', error);
      toast.error('Failed to fetch function statistics');
    } finally {
      setLoading(false);
    }
  };

  const triggerFunction = async (functionName: string) => {
    setTriggering(functionName);
    try {
      const { error } = await supabase.functions.invoke(functionName);
      if (error) throw error;
      toast.success(`${functionName} triggered successfully`);
      setTimeout(fetchFunctionStats, 2000);
    } catch (error: any) {
      toast.error(`Failed to trigger ${functionName}: ${error.message}`);
    } finally {
      setTriggering(null);
    }
  };

  useEffect(() => {
    fetchFunctionStats();
    const interval = setInterval(fetchFunctionStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (func: FunctionStatus) => {
    if (func.status === 'never_run') {
      return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Never Run</Badge>;
    }
    if (func.status === 'failure') {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    }
    if (func.minutes_stale && func.minutes_stale > func.expected_interval * 2) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertTriangle className="w-3 h-3 mr-1" />Stale</Badge>;
    }
    return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">24-Hour Burn-In Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Real-time monitoring of all 34 ingestion functions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Functions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{healthSummary.total}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Healthy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{healthSummary.healthy}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Stale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{healthSummary.stale}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{healthSummary.failed}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{healthSummary.coverage}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Function Status</CardTitle>
            <Button 
              onClick={fetchFunctionStats} 
              disabled={loading}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {functions.map((func) => (
              <div 
                key={func.function_name}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium">{func.function_name}</div>
                  <div className="text-sm text-muted-foreground space-x-4 mt-1">
                    <span>Inserted: {func.rows_inserted}</span>
                    <span>Skipped: {func.rows_skipped}</span>
                    <span>Source: {func.source_used}</span>
                    {func.duration_ms > 0 && <span>Duration: {(func.duration_ms / 1000).toFixed(1)}s</span>}
                  </div>
                  {func.last_run && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Last run: {new Date(func.last_run).toLocaleString()}
                      {func.minutes_stale && ` (${func.minutes_stale}m ago)`}
                    </div>
                  )}
                  {func.error_message && (
                    <div className="text-xs text-red-600 mt-1">
                      Error: {func.error_message}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  {getStatusBadge(func)}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerFunction(func.function_name)}
                    disabled={triggering === func.function_name || loading}
                  >
                    {triggering === func.function_name ? 'Running...' : 'Trigger'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
