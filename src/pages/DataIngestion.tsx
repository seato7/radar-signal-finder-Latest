import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, CheckCircle, XCircle, Clock } from 'lucide-react';

interface DataSource {
  id: string;
  name: string;
  function: string;
  frequency: string;
  category: 'real-time' | 'hourly' | 'daily' | 'weekly';
}

const dataSources: DataSource[] = [
  // Real-time (15 min)
  { id: '1', name: 'Breaking News', function: 'ingest-breaking-news', frequency: 'Every 15 min', category: 'real-time' },
  { id: '2', name: 'Options Flow', function: 'ingest-options-flow', frequency: 'Every 15 min', category: 'real-time' },
  { id: '3', name: 'News Sentiment', function: 'ingest-news-sentiment', frequency: 'Every 15 min', category: 'real-time' },
  
  // Hourly
  { id: '4', name: 'Advanced Technicals', function: 'ingest-advanced-technicals', frequency: 'Hourly', category: 'hourly' },
  { id: '5', name: 'Forex Technicals', function: 'ingest-forex-technicals', frequency: 'Hourly', category: 'hourly' },
  { id: '6', name: 'Crypto On-Chain', function: 'ingest-crypto-onchain', frequency: 'Hourly', category: 'hourly' },
  { id: '7', name: 'Pattern Recognition', function: 'ingest-pattern-recognition', frequency: 'Hourly', category: 'hourly' },
  { id: '8', name: 'Reddit Sentiment', function: 'ingest-reddit-sentiment', frequency: 'Hourly', category: 'hourly' },
  { id: '9', name: 'StockTwits', function: 'ingest-stocktwits', frequency: 'Hourly', category: 'hourly' },
  { id: '10', name: 'Forex Sentiment', function: 'ingest-forex-sentiment', frequency: 'Hourly', category: 'hourly' },
  
  // Daily
  { id: '11', name: 'Congressional Trades', function: 'ingest-congressional-trades', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '12', name: 'Insider Transactions', function: 'ingest-form4', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '13', name: '13F Holdings', function: 'ingest-13f-holdings', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '14', name: 'Patent Filings', function: 'ingest-patents', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '15', name: 'Earnings', function: 'ingest-earnings', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '16', name: 'Short Interest', function: 'ingest-short-interest', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '17', name: 'Job Postings', function: 'ingest-job-postings', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '18', name: 'Google Trends', function: 'ingest-google-trends', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '19', name: 'Supply Chain', function: 'ingest-supply-chain', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '20', name: 'Policy Feeds', function: 'ingest-policy-feeds', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '21', name: 'ETF Flows', function: 'ingest-etf-flows', frequency: 'Daily 6 AM', category: 'daily' },
  { id: '22', name: 'Economic Calendar', function: 'ingest-economic-calendar', frequency: 'Daily 8 AM', category: 'daily' },
  { id: '23', name: 'AI Research Reports', function: 'generate-ai-research', frequency: 'Daily 10 PM', category: 'daily' },
  
  // Weekly
  { id: '24', name: 'COT Reports', function: 'ingest-cot-reports', frequency: 'Weekly (Fri)', category: 'weekly' },
];

const DataIngestion = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, 'idle' | 'success' | 'error'>>({});
  const [triggeringAll, setTriggeringAll] = useState(false);

  const triggerFunction = async (functionName: string, sourceId: string) => {
    setLoading(prev => ({ ...prev, [sourceId]: true }));
    setStatus(prev => ({ ...prev, [sourceId]: 'idle' }));

    try {
      const { error } = await supabase.functions.invoke(functionName, {
        body: { manual: true }
      });

      if (error) throw error;

      setStatus(prev => ({ ...prev, [sourceId]: 'success' }));
      toast({
        title: "Success",
        description: `${functionName} triggered successfully`,
      });
    } catch (error) {
      console.error(`Error triggering ${functionName}:`, error);
      setStatus(prev => ({ ...prev, [sourceId]: 'error' }));
      toast({
        title: "Error",
        description: `Failed to trigger ${functionName}`,
        variant: "destructive",
      });
    } finally {
      setLoading(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  const triggerAllFunctions = async () => {
    setTriggeringAll(true);
    toast({
      title: "Starting bulk ingestion",
      description: "Triggering all data sources. This may take a few minutes...",
    });

    // Trigger in batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < dataSources.length; i += batchSize) {
      const batch = dataSources.slice(i, i + batchSize);
      await Promise.all(
        batch.map(source => triggerFunction(source.function, source.id))
      );
      // Wait 2 seconds between batches
      if (i + batchSize < dataSources.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setTriggeringAll(false);
    toast({
      title: "Bulk ingestion complete",
      description: "All data sources have been triggered",
    });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'real-time': return 'bg-red-500';
      case 'hourly': return 'bg-orange-500';
      case 'daily': return 'bg-blue-500';
      case 'weekly': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (sourceId: string) => {
    const state = status[sourceId];
    if (loading[sourceId]) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (state === 'success') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (state === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Ingestion Control"
        description="Manually trigger data ingestion for all alternative data sources"
      />

      <Card>
        <CardHeader>
          <CardTitle>Bulk Actions</CardTitle>
          <CardDescription>
            Trigger all data sources at once to populate initial data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={triggerAllFunctions} 
            disabled={triggeringAll}
            size="lg"
            className="w-full"
          >
            {triggeringAll ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Triggering All Sources...
              </>
            ) : (
              <>
                <Play className="mr-2 h-5 w-5" />
                Trigger All Data Sources
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {dataSources.map((source) => (
          <Card key={source.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">{source.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {source.frequency}
                  </CardDescription>
                </div>
                <Badge className={getCategoryColor(source.category)} variant="secondary">
                  {source.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => triggerFunction(source.function, source.id)}
                disabled={loading[source.id]}
                size="sm"
                className="w-full"
                variant="outline"
              >
                {loading[source.id] ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Trigger Now
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                {getStatusIcon(source.id)}
                <span className="text-xs">
                  {status[source.id] === 'success' && 'Completed'}
                  {status[source.id] === 'error' && 'Failed'}
                  {status[source.id] === 'idle' && !loading[source.id] && 'Ready'}
                  {loading[source.id] && 'Running'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DataIngestion;
