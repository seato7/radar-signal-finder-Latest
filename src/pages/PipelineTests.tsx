import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";

export default function PipelineTests() {
  const [isRunning, setIsRunning] = useState(false);

  const { data: testSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['test-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('view_test_suite_summary')
        .select('*')
        .order('last_run_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: recentTests, refetch: refetchRecent } = useQuery({
    queryKey: ['recent-tests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingest_logs_test_audit')
        .select('*')
        .order('tested_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
  });

  const runTests = async () => {
    setIsRunning(true);
    try {
      toast.info("Running production test suite...");
      
      const { data, error } = await supabase.functions.invoke('test-pipeline-sla');

      if (error) throw error;

      toast.success(`Tests completed! Pass rate: ${data.summary.pass_rate}%`);
      
      // Refetch data
      await Promise.all([refetchSummary(), refetchRecent()]);
    } catch (error) {
      console.error('Test execution failed:', error);
      toast.error('Failed to run tests: ' + error.message);
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'FAIL':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'WARN':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variant = {
      'PASS': 'default' as const,
      'FAIL': 'destructive' as const,
      'WARN': 'secondary' as const,
      'SKIP': 'outline' as const,
    }[status] || 'outline' as const;

    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <PageHeader 
        title="Pipeline Tests" 
        description="Production SLA compliance testing for real-time data pipeline"
      />

      <div className="mt-6 space-y-6">
        {/* Run Tests Card */}
        <Card>
          <CardHeader>
            <CardTitle>Test Suite Execution</CardTitle>
            <CardDescription>
              Run comprehensive tests to validate ≤5s SLA compliance across all data sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button 
                onClick={runTests} 
                disabled={isRunning}
                className="flex items-center gap-2"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    Run Full Test Suite
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => {
                refetchSummary();
                refetchRecent();
              }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Results
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Summary */}
        {testSummary && testSummary.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {testSummary.map((suite) => (
              <Card key={suite.test_suite}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    {suite.test_suite.replace(/_/g, ' ').toUpperCase()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-medium">{suite.total_tests}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">Passed:</span>
                      <span className="font-medium">{suite.passed}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-red-600">Failed:</span>
                      <span className="font-medium">{suite.failed}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-yellow-600">Warnings:</span>
                      <span className="font-medium">{suite.warnings}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pass Rate:</span>
                        <span className="font-bold text-primary">
                          {((suite.passed / suite.total_tests) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recent Test Results */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Test Results</CardTitle>
            <CardDescription>Last 50 test executions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentTests && recentTests.length > 0 ? (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left text-sm font-medium">Status</th>
                        <th className="p-2 text-left text-sm font-medium">Suite</th>
                        <th className="p-2 text-left text-sm font-medium">Test Name</th>
                        <th className="p-2 text-left text-sm font-medium">Ticker</th>
                        <th className="p-2 text-left text-sm font-medium">Expected</th>
                        <th className="p-2 text-left text-sm font-medium">Actual</th>
                        <th className="p-2 text-left text-sm font-medium">Time</th>
                        <th className="p-2 text-left text-sm font-medium">Tested At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTests.map((test) => (
                        <tr key={test.id} className="border-b hover:bg-muted/30">
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(test.status)}
                              {getStatusBadge(test.status)}
                            </div>
                          </td>
                          <td className="p-2 text-sm">{test.test_suite}</td>
                          <td className="p-2 text-sm">{test.test_name}</td>
                          <td className="p-2 text-sm">{test.ticker || '-'}</td>
                          <td className="p-2 text-sm text-muted-foreground">
                            {test.expected_result}
                          </td>
                          <td className="p-2 text-sm">{test.actual_result}</td>
                          <td className="p-2 text-sm">{test.execution_time_ms}ms</td>
                          <td className="p-2 text-sm text-muted-foreground">
                            {new Date(test.tested_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No test results yet. Run the test suite to see results.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
