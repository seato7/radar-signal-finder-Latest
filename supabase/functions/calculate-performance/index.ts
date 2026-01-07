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
    const allTickers = [...tickers, 'SPY'];
    
    // Get ALL price data for these tickers to find actual data boundaries
    const { data: allPriceData, error: priceError } = await supabase
      .from('prices')
      .select('ticker, date, close, updated_at')
      .in('ticker', allTickers)
      .order('date', { ascending: true });
    
    if (priceError) throw priceError;
    
    if (!allPriceData || allPriceData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No price data found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Organize prices by ticker
    const pricesByTicker: Record<string, Array<{ date: string; close: number; updated_at: string }>> = {};
    for (const p of allPriceData) {
      if (!pricesByTicker[p.ticker]) {
        pricesByTicker[p.ticker] = [];
      }
      pricesByTicker[p.ticker].push({ date: p.date, close: p.close, updated_at: p.updated_at });
    }
    
    // Find the COMMON start date where BOTH SPY and at least some assets have data
    const spyDates = pricesByTicker['SPY']?.map(p => p.date) || [];
    if (spyDates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No SPY benchmark data available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get earliest date where SPY has data
    const earliestSpyDate = spyDates[0];
    const latestSpyDate = spyDates[spyDates.length - 1];
    
    // Calculate period start date
    const now = new Date();
    let periodStartDate: Date;
    
    if (period === '1W') {
      periodStartDate = new Date(now);
      periodStartDate.setDate(periodStartDate.getDate() - 7);
    } else if (period === '1M') {
      periodStartDate = new Date(now);
      periodStartDate.setMonth(periodStartDate.getMonth() - 1);
    } else {
      // 'ALL' - use earliest SPY date
      periodStartDate = new Date(earliestSpyDate);
    }
    
    const periodStartStr = periodStartDate.toISOString().split('T')[0];
    
    // Use the later of: period start or earliest SPY date
    const effectiveStartDate = periodStartStr > earliestSpyDate ? periodStartStr : earliestSpyDate;
    
    // Filter to only dates in our range
    const spyPricesFiltered = pricesByTicker['SPY']?.filter(p => p.date >= effectiveStartDate) || [];
    
    if (spyPricesFiltered.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Not enough price data for comparison' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const firstDate = spyPricesFiltered[0].date;
    const lastDate = spyPricesFiltered[spyPricesFiltered.length - 1].date;
    
    // Get all unique dates from SPY (our reference)
    const allDates = spyPricesFiltered.map(p => p.date);
    
    // Create price lookup by ticker and date
    const priceLookup: Record<string, Record<string, number>> = {};
    for (const p of allPriceData) {
      if (!priceLookup[p.ticker]) {
        priceLookup[p.ticker] = {};
      }
      priceLookup[p.ticker][p.date] = p.close;
    }
    
    // Get initial prices - for each asset, find its first available price in our date range
    const initialPrices: Record<string, { price: number; date: string }> = {};
    const lastPrices: Record<string, { price: number; date: string }> = {};
    
    for (const ticker of allTickers) {
      const tickerPrices = pricesByTicker[ticker]?.filter(p => p.date >= firstDate && p.date <= lastDate) || [];
      if (tickerPrices.length > 0) {
        initialPrices[ticker] = { price: tickerPrices[0].close, date: tickerPrices[0].date };
        lastPrices[ticker] = { 
          price: tickerPrices[tickerPrices.length - 1].close, 
          date: tickerPrices[tickerPrices.length - 1].date 
        };
      }
    }
    
    // Calculate daily portfolio value
    const STARTING_INVESTMENT = 10000;
    const chartData: Array<{ date: string; portfolio: number; spy: number }> = [];
    
    // For forward-fill, track last known prices
    const lastKnownPrices: Record<string, number> = {};
    
    for (const date of allDates) {
      // Update last known prices
      for (const ticker of allTickers) {
        if (priceLookup[ticker]?.[date]) {
          lastKnownPrices[ticker] = priceLookup[ticker][date];
        }
      }
      
      // Calculate portfolio return - equal weighted across assets with data
      let portfolioReturn = 0;
      let validAssets = 0;
      
      for (const ticker of tickers) {
        const currentPrice = lastKnownPrices[ticker];
        const initialData = initialPrices[ticker];
        
        if (currentPrice && initialData) {
          const returnPct = (currentPrice - initialData.price) / initialData.price;
          portfolioReturn += returnPct;
          validAssets++;
        }
      }
      
      if (validAssets > 0) {
        portfolioReturn = portfolioReturn / validAssets;
      }
      
      // SPY return
      let spyReturn = 0;
      const spyCurrentPrice = lastKnownPrices['SPY'];
      const spyInitialData = initialPrices['SPY'];
      if (spyCurrentPrice && spyInitialData) {
        spyReturn = (spyCurrentPrice - spyInitialData.price) / spyInitialData.price;
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
    
    // Calculate individual asset breakdown using each asset's own first/last prices
    const assetBreakdown = topAssets.map(asset => {
      const firstData = initialPrices[asset.ticker];
      const lastData = lastPrices[asset.ticker];
      
      let returnPct = 0;
      let hasData = false;
      
      if (firstData && lastData && firstData.price > 0) {
        returnPct = ((lastData.price - firstData.price) / firstData.price) * 100;
        hasData = true;
      }
      
      return {
        ticker: asset.ticker,
        name: asset.name || asset.ticker,
        score: asset.computed_score,
        return_pct: Math.round(returnPct * 100) / 100,
        contribution: Math.round((returnPct / 10) * 100) / 100,
        first_price: firstData?.price || null,
        last_price: lastData?.price || null,
        first_date: firstData?.date || null,
        last_date: lastData?.date || null,
        has_data: hasData,
      };
    });
    
    // Get last updated timestamp from most recent price
    let lastUpdatedAt = null;
    for (const ticker of allTickers) {
      const tickerData = pricesByTicker[ticker];
      if (tickerData && tickerData.length > 0) {
        const lastEntry = tickerData[tickerData.length - 1];
        if (!lastUpdatedAt || lastEntry.updated_at > lastUpdatedAt) {
          lastUpdatedAt = lastEntry.updated_at;
        }
      }
    }
    
    const periodDays = Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`Performance calculated: Portfolio ${portfolioReturnPct.toFixed(2)}%, SPY ${spyReturnPct.toFixed(2)}%, Outperformance ${outperformance.toFixed(2)}%`);
    console.log(`Date range: ${firstDate} to ${lastDate} (${periodDays} days)`);
    console.log(`Assets with valid returns: ${assetBreakdown.filter(a => a.has_data).length}/${assetBreakdown.length}`);
    
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
        last_updated_at: lastUpdatedAt,
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
