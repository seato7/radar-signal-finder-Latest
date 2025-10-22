import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, TrendingUp, Users, FileText, Search, Shield, Newspaper, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";

export default function DataSources() {
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState<Record<string, boolean>>({});
  const [socialSignals, setSocialSignals] = useState<any[]>([]);
  const [congressionalTrades, setCongressionalTrades] = useState<any[]>([]);
  const [patents, setPatents] = useState<any[]>([]);
  const [searchTrends, setSearchTrends] = useState<any[]>([]);
  const [shortInterest, setShortInterest] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      const [social, congressional, patentData, trends, shorts, earningsData] = await Promise.all([
        supabase.from('social_signals').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('congressional_trades').select('*').order('transaction_date', { ascending: false }).limit(50),
        supabase.from('patent_filings').select('*').order('filing_date', { ascending: false }).limit(50),
        supabase.from('search_trends').select('*').order('period_start', { ascending: false }).limit(50),
        supabase.from('short_interest').select('*').order('report_date', { ascending: false }).limit(50),
        supabase.from('earnings_sentiment').select('*').order('earnings_date', { ascending: false }).limit(50)
      ]);

      if (social.error) throw social.error;
      if (congressional.error) throw congressional.error;
      if (patentData.error) throw patentData.error;
      if (trends.error) throw trends.error;
      if (shorts.error) throw shorts.error;
      if (earningsData.error) throw earningsData.error;

      setSocialSignals(social.data || []);
      setCongressionalTrades(congressional.data || []);
      setPatents(patentData.data || []);
      setSearchTrends(trends.data || []);
      setShortInterest(shorts.data || []);
      setEarnings(earningsData.data || []);
    } catch (error: any) {
      toast.error("Failed to load data sources");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (score: number) => {
    if (score > 0.3) return "text-green-600";
    if (score < -0.3) return "text-red-600";
    return "text-yellow-600";
  };

  const runIngestion = async (functionName: string, displayName: string) => {
    setIngesting(prev => ({ ...prev, [functionName]: true }));
    try {
      const { error } = await supabase.functions.invoke(functionName);
      
      if (error) throw error;
      
      toast.success(`${displayName} data ingestion started`);
      
      // Refresh data after a delay
      setTimeout(() => {
        fetchAllData();
      }, 3000);
    } catch (error: any) {
      toast.error(`Failed to ingest ${displayName} data: ${error.message}`);
    } finally {
      setIngesting(prev => ({ ...prev, [functionName]: false }));
    }
  };

  const runAllIngestions = async () => {
    toast.info("Starting all data ingestions...");
    const functions = [
      { name: 'ingest-reddit-sentiment', display: 'Reddit' },
      { name: 'ingest-stocktwits', display: 'StockTwits' },
      { name: 'ingest-congressional-trades', display: 'Congressional Trades' },
      { name: 'ingest-google-trends', display: 'Google Trends' },
      { name: 'ingest-patents', display: 'Patents' },
      { name: 'ingest-short-interest', display: 'Short Interest' },
      { name: 'ingest-earnings', display: 'Earnings' }
    ];

    for (const func of functions) {
      await runIngestion(func.name, func.display);
      // Small delay between calls to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    toast.success("All ingestions completed!");
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Alternative Data Sources"
        description="Real-time data from social media, congressional trades, patents, and more"
      />

      <div className="container py-6">
        {/* Info Section */}
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>About Alternative Data Sources</AlertTitle>
          <AlertDescription>
            These data sources provide unique market insights beyond traditional financial data. They run automatically on a schedule, 
            but you can manually trigger ingestion anytime using the "Refresh All Data" button below. The AI Assistant combines all 
            these sources to provide comprehensive market analysis.
          </AlertDescription>
        </Alert>

        {/* Manual Ingestion Controls */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Data Ingestion Controls</CardTitle>
            <CardDescription>
              Manually refresh data from all sources or trigger individual ingestion jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={runAllIngestions}
                disabled={Object.values(ingesting).some(v => v)}
                size="lg"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${Object.values(ingesting).some(v => v) ? 'animate-spin' : ''}`} />
                Refresh All Data
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-reddit-sentiment', 'Reddit')}
                disabled={ingesting['ingest-reddit-sentiment']}
                variant="outline"
              >
                {ingesting['ingest-reddit-sentiment'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reddit
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-stocktwits', 'StockTwits')}
                disabled={ingesting['ingest-stocktwits']}
                variant="outline"
              >
                {ingesting['ingest-stocktwits'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                StockTwits
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-congressional-trades', 'Congress')}
                disabled={ingesting['ingest-congressional-trades']}
                variant="outline"
              >
                {ingesting['ingest-congressional-trades'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Congress
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-google-trends', 'Trends')}
                disabled={ingesting['ingest-google-trends']}
                variant="outline"
              >
                {ingesting['ingest-google-trends'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Trends
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-patents', 'Patents')}
                disabled={ingesting['ingest-patents']}
                variant="outline"
              >
                {ingesting['ingest-patents'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Patents
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-short-interest', 'Shorts')}
                disabled={ingesting['ingest-short-interest']}
                variant="outline"
              >
                {ingesting['ingest-short-interest'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Shorts
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-earnings', 'Earnings')}
                disabled={ingesting['ingest-earnings']}
                variant="outline"
              >
                {ingesting['ingest-earnings'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Earnings
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              💡 <strong>Tip:</strong> Data refreshes automatically every hour for social sources, every 2 hours for congressional trades, 
              and daily for others. Use manual refresh when you need the latest data immediately.
            </p>
          </CardContent>
        </Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="social" className="space-y-6">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="social">
                <Users className="h-4 w-4 mr-2" />
                Social
              </TabsTrigger>
              <TabsTrigger value="congressional">
                <Shield className="h-4 w-4 mr-2" />
                Congress
              </TabsTrigger>
              <TabsTrigger value="patents">
                <FileText className="h-4 w-4 mr-2" />
                Patents
              </TabsTrigger>
              <TabsTrigger value="trends">
                <Search className="h-4 w-4 mr-2" />
                Trends
              </TabsTrigger>
              <TabsTrigger value="shorts">
                <TrendingUp className="h-4 w-4 mr-2" />
                Shorts
              </TabsTrigger>
              <TabsTrigger value="earnings">
                <Newspaper className="h-4 w-4 mr-2" />
                Earnings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="social" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Social Media Sentiment</CardTitle>
                  <CardDescription>
                    Reddit and StockTwits sentiment data • Updates: Every hour
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>What This Shows</AlertTitle>
                    <AlertDescription>
                      Social sentiment tracks retail investor sentiment from Reddit (r/wallstreetbets, r/stocks) and StockTwits. 
                      High bullish sentiment + institutional buying = strong conviction opportunity. Watch for sentiment spikes 
                      before major moves.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-4">
                    {socialSignals.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data available yet. Data will populate within the hour.</p>
                    ) : (
                      socialSignals.map((signal) => (
                        <div key={signal.id} className="flex items-center justify-between border-b pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{signal.ticker}</span>
                              <Badge variant="outline">{signal.source}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {signal.mention_count} mentions • {signal.bullish_count} bullish • {signal.bearish_count} bearish
                            </p>
                          </div>
                          <div className={`text-xl font-bold ${getSentimentColor(signal.sentiment_score)}`}>
                            {signal.sentiment_score > 0 ? '+' : ''}{(signal.sentiment_score * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="congressional" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Congressional Trades</CardTitle>
                  <CardDescription>
                    Recent stock trades by members of Congress • Updates: Every 2 hours
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>What This Shows</AlertTitle>
                    <AlertDescription>
                      Tracks real-time stock purchases and sales by U.S. Congress members. Research shows congressional trades 
                      often outperform the market. Look for clusters of purchases by multiple members in the same stock - 
                      they may know something the market doesn't yet.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-4">
                    {congressionalTrades.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data available yet. Data will populate within 2 hours.</p>
                    ) : (
                      congressionalTrades.map((trade) => (
                        <div key={trade.id} className="border-b pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{trade.ticker}</span>
                                <Badge variant={trade.transaction_type === 'purchase' ? 'default' : 'destructive'}>
                                  {trade.transaction_type}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{trade.representative}</p>
                              {trade.party && <Badge variant="outline" className="mt-1">{trade.party}</Badge>}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                ${trade.amount_min?.toLocaleString()} - ${trade.amount_max?.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(trade.transaction_date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="patents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Patent Filings</CardTitle>
                  <CardDescription>
                    Recent patent applications by major tech companies • Updates: Daily at 3 AM
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>What This Shows</AlertTitle>
                    <AlertDescription>
                      Patent filings reveal where tech companies are investing in innovation. Clusters of patents in emerging 
                      technologies (AI, quantum, biotech) signal strategic pivots. Cross-reference with R&D spending and recent 
                      acquisitions for the full innovation picture.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-4">
                    {patents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data available yet. Data will populate tomorrow at 3 AM.</p>
                    ) : (
                      patents.map((patent) => (
                        <div key={patent.id} className="border-b pb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{patent.ticker}</span>
                            <Badge variant="outline">{patent.technology_category}</Badge>
                          </div>
                          <p className="text-sm font-medium mt-1">{patent.patent_title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {patent.company} • Filed: {new Date(patent.filing_date).toLocaleDateString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Search Trends</CardTitle>
                  <CardDescription>
                    Google search volume trends for stocks • Updates: Daily at 2 AM
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>What This Shows</AlertTitle>
                    <AlertDescription>
                      Google search volume spikes often precede major price moves. Sudden 200%+ increases in searches can 
                      indicate breaking news, viral social media discussion, or emerging retail interest. Best used to confirm 
                      other signals rather than standalone.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-4">
                    {searchTrends.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data available yet. Data will populate tomorrow at 2 AM.</p>
                    ) : (
                      searchTrends.map((trend) => (
                        <div key={trend.id} className="flex items-center justify-between border-b pb-3">
                          <div>
                            <span className="font-semibold">{trend.ticker}</span>
                            <p className="text-sm text-muted-foreground mt-1">{trend.keyword}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{trend.search_volume?.toLocaleString()} searches</p>
                            <p className={`text-sm ${trend.trend_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {trend.trend_change > 0 ? '+' : ''}{trend.trend_change?.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="shorts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Short Interest</CardTitle>
                  <CardDescription>
                    Short position data for heavily shorted stocks • Updates: Daily at 4 AM
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>What This Shows</AlertTitle>
                    <AlertDescription>
                      Short interest measures bearish bets against stocks. High short interest (&gt;20% of float) + positive news = 
                      short squeeze potential. Watch for: (1) high % of float shorted, (2) low days-to-cover (buying pressure), 
                      (3) unexpected positive catalysts.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-4">
                    {shortInterest.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data available yet. Data will populate tomorrow at 4 AM.</p>
                    ) : (
                      shortInterest.map((short) => (
                        <div key={short.id} className="flex items-center justify-between border-b pb-3">
                          <div>
                            <span className="font-semibold">{short.ticker}</span>
                            <p className="text-sm text-muted-foreground mt-1">
                              {short.short_volume?.toLocaleString()} shares short
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-red-600">{short.float_percentage?.toFixed(1)}% of float</p>
                            <p className="text-sm text-muted-foreground">{short.days_to_cover?.toFixed(1)} days to cover</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="earnings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Earnings Sentiment</CardTitle>
                  <CardDescription>
                    Earnings surprise and sentiment analysis • Updates: Daily at 5 AM
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>What This Shows</AlertTitle>
                    <AlertDescription>
                      Analyzes post-earnings reactions: EPS/revenue beats vs. misses, and market sentiment. Positive surprise + 
                      positive sentiment = strong upward momentum. Negative surprise + congressional buying = potential 
                      contrarian opportunity (insiders see recovery).
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-4">
                    {earnings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data available yet. Data will populate tomorrow at 5 AM.</p>
                    ) : (
                      earnings.map((earning) => (
                        <div key={earning.id} className="border-b pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{earning.ticker}</span>
                                <Badge variant="outline">{earning.quarter}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {new Date(earning.earnings_date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${getSentimentColor(earning.sentiment_score)}`}>
                                Sentiment: {(earning.sentiment_score * 100).toFixed(0)}%
                              </p>
                              <p className="text-sm text-muted-foreground">
                                EPS: {earning.earnings_surprise > 0 ? '+' : ''}{earning.earnings_surprise?.toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
