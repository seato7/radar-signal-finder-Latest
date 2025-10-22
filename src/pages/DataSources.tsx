import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, TrendingUp, Users, FileText, Search, Shield, Newspaper, RefreshCw, Info, DollarSign, Briefcase, Package } from "lucide-react";
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
  const [breakingNews, setBreakingNews] = useState<any[]>([]);
  const [twitterSignals, setTwitterSignals] = useState<any[]>([]);
  const [optionsFlow, setOptionsFlow] = useState<any[]>([]);
  const [jobPostings, setJobPostings] = useState<any[]>([]);
  const [supplyChain, setSupplyChain] = useState<any[]>([]);

  useEffect(() => {
    fetchAllData();
    
    // Auto-populate data on first load if no data exists
    const checkAndPopulate = async () => {
      const hasRun = localStorage.getItem('datasources_initialized');
      if (!hasRun) {
        setTimeout(async () => {
          console.log('Auto-populating data sources on first load...');
          await runAllIngestions();
          localStorage.setItem('datasources_initialized', 'true');
        }, 2000);
      }
    };
    
    checkAndPopulate();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      const [social, congressional, patentData, trends, shorts, earningsData, news, twitter, options, jobs, supply] = await Promise.all([
        supabase.from('social_signals').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('congressional_trades').select('*').order('transaction_date', { ascending: false }).limit(50),
        supabase.from('patent_filings').select('*').order('filing_date', { ascending: false }).limit(50),
        supabase.from('search_trends').select('*').order('period_start', { ascending: false }).limit(50),
        supabase.from('short_interest').select('*').order('report_date', { ascending: false }).limit(50),
        supabase.from('earnings_sentiment').select('*').order('earnings_date', { ascending: false }).limit(50),
        supabase.from('breaking_news').select('*').order('published_at', { ascending: false }).limit(50),
        supabase.from('twitter_signals').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('options_flow').select('*').order('trade_date', { ascending: false }).limit(50),
        supabase.from('job_postings').select('*').order('posted_date', { ascending: false }).limit(50),
        supabase.from('supply_chain_signals').select('*').order('report_date', { ascending: false }).limit(50)
      ]);

      if (social.error) throw social.error;
      if (congressional.error) throw congressional.error;
      if (patentData.error) throw patentData.error;
      if (trends.error) throw trends.error;
      if (shorts.error) throw shorts.error;
      if (earningsData.error) throw earningsData.error;
      if (news.error) throw news.error;
      if (twitter.error) throw twitter.error;
      if (options.error) throw options.error;
      if (jobs.error) throw jobs.error;
      if (supply.error) throw supply.error;

      setSocialSignals(social.data || []);
      setCongressionalTrades(congressional.data || []);
      setPatents(patentData.data || []);
      setSearchTrends(trends.data || []);
      setShortInterest(shorts.data || []);
      setEarnings(earningsData.data || []);
      setBreakingNews(news.data || []);
      setTwitterSignals(twitter.data || []);
      setOptionsFlow(options.data || []);
      setJobPostings(jobs.data || []);
      setSupplyChain(supply.data || []);
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
      const { data, error } = await supabase.functions.invoke(functionName);
      
      if (error) {
        console.error(`Error invoking ${functionName}:`, error);
        toast.warning(`${displayName} completed with warnings - check logs for details`);
      } else {
        toast.success(`${displayName} data refreshed successfully`);
      }
      
      // Refresh data after a delay
      setTimeout(() => {
        fetchAllData();
      }, 2000);
    } catch (error: any) {
      console.error(`Failed to ingest ${displayName}:`, error);
      toast.error(`${displayName} refresh failed: ${error.message}`);
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
      { name: 'ingest-earnings', display: 'Earnings' },
      { name: 'ingest-breaking-news', display: 'Breaking News' },
      { name: 'ingest-twitter', display: 'Twitter' },
      { name: 'ingest-options-flow', display: 'Options Flow' },
      { name: 'ingest-job-postings', display: 'Job Postings' },
      { name: 'ingest-supply-chain', display: 'Supply Chain' }
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
              
              <Button 
                onClick={() => runIngestion('ingest-breaking-news', 'News')}
                disabled={ingesting['ingest-breaking-news']}
                variant="outline"
              >
                {ingesting['ingest-breaking-news'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                News
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-twitter', 'Twitter')}
                disabled={ingesting['ingest-twitter']}
                variant="outline"
              >
                {ingesting['ingest-twitter'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Twitter
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-options-flow', 'Options')}
                disabled={ingesting['ingest-options-flow']}
                variant="outline"
              >
                {ingesting['ingest-options-flow'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Options
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-job-postings', 'Jobs')}
                disabled={ingesting['ingest-job-postings']}
                variant="outline"
              >
                {ingesting['ingest-job-postings'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Jobs
              </Button>
              
              <Button 
                onClick={() => runIngestion('ingest-supply-chain', 'Supply Chain')}
                disabled={ingesting['ingest-supply-chain']}
                variant="outline"
              >
                {ingesting['ingest-supply-chain'] && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Supply
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
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 xl:grid-cols-9 gap-2">
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
              <TabsTrigger value="news">
                <Newspaper className="h-4 w-4 mr-2" />
                News
              </TabsTrigger>
              <TabsTrigger value="options">
                <DollarSign className="h-4 w-4 mr-2" />
                Options
              </TabsTrigger>
              <TabsTrigger value="jobs">
                <Briefcase className="h-4 w-4 mr-2" />
                Jobs
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
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground mb-2">No data available yet.</p>
                        <Button onClick={() => runIngestion('ingest-stocktwits', 'StockTwits')} size="sm">
                          Load Social Data
                        </Button>
                      </div>
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
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground mb-2">No data available yet.</p>
                        <Button onClick={() => runIngestion('ingest-congressional-trades', 'Congress')} size="sm">
                          Load Congressional Data
                        </Button>
                      </div>
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
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground mb-2">No data available yet.</p>
                        <Button onClick={() => runIngestion('ingest-patents', 'Patents')} size="sm">
                          Load Patent Data
                        </Button>
                      </div>
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
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground mb-2">No data available yet.</p>
                        <Button onClick={() => runIngestion('ingest-google-trends', 'Trends')} size="sm">
                          Load Trends Data
                        </Button>
                      </div>
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
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground mb-2">No data available yet.</p>
                        <Button onClick={() => runIngestion('ingest-short-interest', 'Shorts')} size="sm">
                          Load Short Interest Data
                        </Button>
                      </div>
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
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground mb-2">No data available yet.</p>
                        <Button onClick={() => runIngestion('ingest-earnings', 'Earnings')} size="sm">
                          Load Earnings Data
                        </Button>
                      </div>
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

            <TabsContent value="news" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Breaking News</CardTitle>
                  <CardDescription>
                    Real-time market-moving news detected by AI
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {breakingNews.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No breaking news available yet. Click "Refresh All Data" to fetch latest news.
                      </p>
                    ) : (
                      breakingNews.map((news) => (
                        <div key={news.id} className="border-b pb-4 last:border-0">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">{news.ticker}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {news.source}
                                </span>
                              </div>
                              <h4 className="font-semibold mb-2">{news.headline}</h4>
                              <p className="text-sm text-muted-foreground mb-2">{news.summary}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(news.published_at).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${getSentimentColor(news.sentiment_score)}`}>
                                {news.sentiment_score > 0 ? 'Bullish' : news.sentiment_score < 0 ? 'Bearish' : 'Neutral'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Relevance: {(news.relevance_score * 100).toFixed(0)}%
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

            <TabsContent value="options" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Options Flow</CardTitle>
                  <CardDescription>
                    Large options trades indicating institutional positioning
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {optionsFlow.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No options flow data available yet. Click "Refresh All Data" to fetch latest data.
                      </p>
                    ) : (
                      optionsFlow.map((option) => (
                        <div key={option.id} className="border-b pb-4 last:border-0">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">{option.ticker}</Badge>
                                <Badge variant={option.sentiment === 'bullish' ? 'default' : 'destructive'}>
                                  {option.option_type.toUpperCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground capitalize">
                                  {option.flow_type}
                                </span>
                              </div>
                              <p className="text-sm">
                                Strike: ${option.strike_price} | Exp: {new Date(option.expiration_date).toLocaleDateString()}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Volume: {option.volume.toLocaleString()} | OI: {option.open_interest.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(option.trade_date).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-lg">
                                ${(option.premium / 1000000).toFixed(2)}M
                              </p>
                              <p className="text-xs text-muted-foreground">
                                IV: {(option.implied_volatility * 100).toFixed(0)}%
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

            <TabsContent value="jobs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Job Postings</CardTitle>
                  <CardDescription>
                    Company hiring trends as a leading indicator of growth
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {jobPostings.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No job postings data available yet. Click "Refresh All Data" to fetch latest data.
                      </p>
                    ) : (
                      jobPostings.map((job) => (
                        <div key={job.id} className="border-b pb-4 last:border-0">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">{job.ticker}</Badge>
                                <Badge variant="secondary" className="capitalize">{job.role_type}</Badge>
                              </div>
                              <h4 className="font-semibold mb-1">{job.job_title}</h4>
                              <p className="text-sm text-muted-foreground mb-2">
                                {job.company} • {job.department} • {job.location}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Posted: {new Date(job.posted_date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-lg">
                                {job.posting_count} openings
                              </p>
                              <p className={`text-sm ${job.growth_indicator > 0 ? 'text-green-600' : job.growth_indicator < 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                                {job.growth_indicator > 0 ? '+' : ''}{job.growth_indicator}% growth
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
