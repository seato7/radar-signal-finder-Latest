import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { isPremiumOrAbove } from '@/lib/planLimits';
import { TrendingUp, TrendingDown, Activity, DollarSign, Target, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function Analytics() {
  const { userPlan } = useAuth();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPremiumOrAbove(userPlan)) {
      setLoading(false);
      return;
    }
    
    fetchAnalytics();
  }, [userPlan]);

  const fetchAnalytics = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-analytics');
      
      if (!error && data) {
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isPremiumOrAbove(userPlan)) {
    return (
      <div className="container mx-auto p-6">
        <PageHeader
          title="Advanced Analytics"
          description="Premium feature for in-depth trading insights"
        />
        
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Premium Feature</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Advanced Analytics is available for Premium and Enterprise plans. 
              Upgrade to access detailed performance metrics, risk analysis, and trading insights.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <PageHeader title="Advanced Analytics" description="Loading your data..." />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Advanced Analytics"
        description="Deep insights into your trading performance"
      />

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Total P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${analytics?.total_pnl?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all bots
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics?.win_rate?.toFixed(1) || '0.0'}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Winning trades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Total Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics?.total_trades || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Executed orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              Max Drawdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics?.max_drawdown?.toFixed(1) || '0.0'}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Peak to trough
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bot Performance Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Bot Performance Breakdown</CardTitle>
          <CardDescription>Performance metrics per trading bot</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics?.bot_performance?.map((bot: any) => (
              <div key={bot.bot_id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold">{bot.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {bot.strategy} • {bot.trades} trades
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${bot.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {bot.pnl >= 0 ? '+' : ''}{bot.pnl.toFixed(2)}
                  </div>
                  <Badge variant={bot.pnl >= 0 ? 'default' : 'destructive'}>
                    {bot.win_rate.toFixed(1)}% win rate
                  </Badge>
                </div>
              </div>
            )) || (
              <p className="text-muted-foreground text-center py-8">
                No bot performance data yet. Create and run bots to see analytics.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Risk Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Analysis</CardTitle>
          <CardDescription>Risk metrics and exposure</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Sharpe Ratio</div>
              <div className="text-2xl font-bold">{analytics?.sharpe_ratio?.toFixed(2) || 'N/A'}</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Volatility</div>
              <div className="text-2xl font-bold">{analytics?.volatility?.toFixed(1) || 'N/A'}%</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Profit Factor</div>
              <div className="text-2xl font-bold">{analytics?.profit_factor?.toFixed(2) || 'N/A'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
