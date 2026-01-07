import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { period } = await req.json();
    
    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    const DATA_START_DATE = new Date('2025-12-05');
    
    if (period === '1W') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '1M') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      // 'ALL' - use data start date
      startDate = DATA_START_DATE;
    }
    
    // Ensure start date is not before data availability
    if (startDate < DATA_START_DATE) {
      startDate = DATA_START_DATE;
    }
    
    // Get top 10 assets by computed_score
    const { data: topAssets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, computed_score')
      .not('computed_score', 'is', null)
      .order('computed_score', { ascending: false })
      .limit(10);
    
    if (assetsError) throw assetsError;
    
    if (!topAssets || topAssets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No scored assets found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const tickers = topAssets.map(a => a.ticker);
    
    // Get price data for top 10 + SPY benchmark
    const allTickers = [...tickers, 'SPY'];
    
    const { data: priceData, error: priceError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', allTickers)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });
    
    if (priceError) throw priceError;
    
    if (!priceData || priceData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No price data found for the selected period' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Organize prices by ticker and date
    const pricesByTicker: Record<string, Record<string, number>> = {};
    for (const p of priceData) {
      if (!pricesByTicker[p.ticker]) {
        pricesByTicker[p.ticker] = {};
      }
      pricesByTicker[p.ticker][p.date] = p.close;
    }
    
    // Get all unique dates
    const allDates = [...new Set(priceData.map(p => p.date))].sort();
    
    if (allDates.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Not enough price data for comparison' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const firstDate = allDates[0];
    const lastDate = allDates[allDates.length - 1];
    
    // Calculate portfolio returns (equal-weighted)
    const chartData: Array<{ date: string; portfolio: number; spy: number }> = [];
    const STARTING_INVESTMENT = 10000;
    
    // Get initial prices for normalization
    const initialPrices: Record<string, number> = {};
    for (const ticker of allTickers) {
      if (pricesByTicker[ticker] && pricesByTicker[ticker][firstDate]) {
        initialPrices[ticker] = pricesByTicker[ticker][firstDate];
      }
    }
    
    // Calculate daily portfolio value
    for (const date of allDates) {
      // Equal-weighted portfolio of top 10
      let portfolioReturn = 0;
      let validAssets = 0;
      
      for (const ticker of tickers) {
        if (pricesByTicker[ticker]?.[date] && initialPrices[ticker]) {
          const returnPct = (pricesByTicker[ticker][date] - initialPrices[ticker]) / initialPrices[ticker];
          portfolioReturn += returnPct;
          validAssets++;
        }
      }
      
      if (validAssets > 0) {
        portfolioReturn = portfolioReturn / validAssets;
      }
      
      // SPY return
      let spyReturn = 0;
      if (pricesByTicker['SPY']?.[date] && initialPrices['SPY']) {
        spyReturn = (pricesByTicker['SPY'][date] - initialPrices['SPY']) / initialPrices['SPY'];
      }
      
      chartData.push({
        date,
        portfolio: Math.round(STARTING_INVESTMENT * (1 + portfolioReturn)),
        spy: Math.round(STARTING_INVESTMENT * (1 + spyReturn)),
      });
    }
    
    // Calculate final returns
    const lastChartPoint = chartData[chartData.length - 1];
    const portfolioValue = lastChartPoint?.portfolio || STARTING_INVESTMENT;
    const spyValue = lastChartPoint?.spy || STARTING_INVESTMENT;
    
    const portfolioReturnPct = ((portfolioValue - STARTING_INVESTMENT) / STARTING_INVESTMENT) * 100;
    const spyReturnPct = ((spyValue - STARTING_INVESTMENT) / STARTING_INVESTMENT) * 100;
    const outperformance = portfolioReturnPct - spyReturnPct;
    
    // Calculate individual asset breakdown
    const assetBreakdown = topAssets.map(asset => {
      const firstPrice = initialPrices[asset.ticker];
      const lastPrice = pricesByTicker[asset.ticker]?.[lastDate];
      
      let returnPct = 0;
      if (firstPrice && lastPrice) {
        returnPct = ((lastPrice - firstPrice) / firstPrice) * 100;
      }
      
      return {
        ticker: asset.ticker,
        name: asset.name || asset.ticker,
        score: asset.computed_score,
        return_pct: Math.round(returnPct * 100) / 100,
        contribution: Math.round((returnPct / 10) * 100) / 100, // 10% weight each
      };
    });
    
    const periodDays = Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24));
    
    return new Response(
      JSON.stringify({
        portfolio_value: portfolioValue,
        portfolio_return_pct: Math.round(portfolioReturnPct * 100) / 100,
        spy_return_pct: Math.round(spyReturnPct * 100) / 100,
        outperformance: Math.round(outperformance * 100) / 100,
        period_days: periodDays,
        start_date: firstDate,
        end_date: lastDate,
        chart_data: chartData,
        asset_breakdown: assetBreakdown,
        starting_investment: STARTING_INVESTMENT,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in calculate-performance:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
