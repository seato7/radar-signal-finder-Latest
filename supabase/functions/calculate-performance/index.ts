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
    
    // Get all snapshots to determine date range and assets
    const { data: allSnapshots, error: snapshotError } = await supabase
      .from('asset_score_snapshots')
      .select('snapshot_date, ticker, asset_name, computed_score, rank')
      .order('snapshot_date', { ascending: true })
      .order('rank', { ascending: true });
    
    if (snapshotError) throw snapshotError;
    
    // Group by date
    const snapshotsByDate: Record<string, Array<{ ticker: string; name: string; score: number }>> = {};
    for (const s of allSnapshots || []) {
      if (!snapshotsByDate[s.snapshot_date]) {
        snapshotsByDate[s.snapshot_date] = [];
      }
      if (snapshotsByDate[s.snapshot_date].length < 10) {
        snapshotsByDate[s.snapshot_date].push({
          ticker: s.ticker,
          name: s.asset_name || s.ticker,
          score: s.computed_score || 0,
        });
      }
    }
    
    const snapshotDates = Object.keys(snapshotsByDate).sort();
    
    if (snapshotDates.length === 0) {
      // Fallback to current top assets if no snapshots
      const { data: topAssets } = await supabase
        .from('assets')
        .select('ticker, name, computed_score')
        .not('computed_score', 'is', null)
        .order('computed_score', { ascending: false })
        .limit(10);
      
      if (!topAssets || topAssets.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No scored assets found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Calculate period boundaries
    const now = new Date();
    let periodStartDate: Date;
    
    if (period === '1W') {
      periodStartDate = new Date(now);
      periodStartDate.setDate(periodStartDate.getDate() - 7);
    } else if (period === '1M') {
      periodStartDate = new Date(now);
      periodStartDate.setMonth(periodStartDate.getMonth() - 1);
    } else {
      // 'ALL' - use earliest snapshot
      periodStartDate = new Date(snapshotDates[0] || now);
    }
    
    const periodStartStr = periodStartDate.toISOString().split('T')[0];
    
    // Filter dates within period
    const filteredDates = snapshotDates.filter(d => d >= periodStartStr);
    
    if (filteredDates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data available for selected period' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const startDate = filteredDates[0];
    const endDate = filteredDates[filteredDates.length - 1];
    
    // Get all unique tickers from filtered snapshots
    const allTickers = new Set<string>();
    for (const date of filteredDates) {
      for (const asset of snapshotsByDate[date] || []) {
        allTickers.add(asset.ticker);
      }
    }
    allTickers.add('SPY');
    
    // Get price data
    const { data: priceData, error: priceError } = await supabase
      .from('prices')
      .select('ticker, date, close, updated_at')
      .in('ticker', Array.from(allTickers))
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });
    
    if (priceError) throw priceError;
    
    // Organize prices
    const pricesByDate: Record<string, Record<string, number>> = {};
    let lastUpdatedAt: string | null = null;
    
    for (const p of priceData || []) {
      if (!pricesByDate[p.date]) {
        pricesByDate[p.date] = {};
      }
      pricesByDate[p.date][p.ticker] = p.close;
      if (!lastUpdatedAt || p.updated_at > lastUpdatedAt) {
        lastUpdatedAt = p.updated_at;
      }
    }
    
    // Calculate cumulative returns
    const STARTING_INVESTMENT = 10000;
    const chartData: Array<{ date: string; portfolio: number; spy: number }> = [];
    
    let portfolioCumulative = STARTING_INVESTMENT;
    let spyCumulative = STARTING_INVESTMENT;
    
    for (let i = 0; i < filteredDates.length; i++) {
      const date = filteredDates[i];
      const assets = snapshotsByDate[date] || [];
      const todayPrices = pricesByDate[date] || {};
      
      if (i > 0) {
        const prevDate = filteredDates[i - 1];
        const prevPrices = pricesByDate[prevDate] || {};
        
        // Portfolio daily return
        let portfolioReturn = 0;
        let validCount = 0;
        
        for (const asset of assets) {
          const todayPrice = todayPrices[asset.ticker];
          const prevPrice = prevPrices[asset.ticker];
          
          if (todayPrice && prevPrice && prevPrice > 0) {
            portfolioReturn += (todayPrice - prevPrice) / prevPrice;
            validCount++;
          } else if (asset.score) {
            // Use stored daily return percentage
            portfolioReturn += asset.score / 100;
            validCount++;
          }
        }
        
        if (validCount > 0) {
          portfolioReturn = portfolioReturn / validCount;
          portfolioCumulative = portfolioCumulative * (1 + portfolioReturn);
        }
        
        // SPY daily return
        const todaySpyPrice = todayPrices['SPY'];
        const prevSpyPrice = prevPrices['SPY'];
        
        if (todaySpyPrice && prevSpyPrice && prevSpyPrice > 0) {
          const spyReturn = (todaySpyPrice - prevSpyPrice) / prevSpyPrice;
          spyCumulative = spyCumulative * (1 + spyReturn);
        }
      }
      
      chartData.push({
        date,
        portfolio: Math.round(portfolioCumulative),
        spy: Math.round(spyCumulative),
      });
    }
    
    // Final values
    const portfolioValue = chartData[chartData.length - 1]?.portfolio || STARTING_INVESTMENT;
    const spyValue = chartData[chartData.length - 1]?.spy || STARTING_INVESTMENT;
    
    const portfolioReturnPct = ((portfolioValue - STARTING_INVESTMENT) / STARTING_INVESTMENT) * 100;
    const spyReturnPct = ((spyValue - STARTING_INVESTMENT) / STARTING_INVESTMENT) * 100;
    const outperformance = portfolioReturnPct - spyReturnPct;
    
    // Get latest day's assets for breakdown
    const latestAssets = snapshotsByDate[endDate] || [];
    
    // Calculate individual asset returns for the period
    const assetBreakdown = latestAssets.map(asset => {
      const firstPrice = pricesByDate[startDate]?.[asset.ticker];
      const lastPrice = pricesByDate[endDate]?.[asset.ticker];
      
      let returnPct = 0;
      let hasData = false;
      
      if (firstPrice && lastPrice && firstPrice > 0) {
        returnPct = ((lastPrice - firstPrice) / firstPrice) * 100;
        hasData = true;
      } else {
        // Use cumulative of daily scores
        returnPct = asset.score;
        hasData = true;
      }
      
      return {
        ticker: asset.ticker,
        name: asset.name,
        score: asset.score,
        return_pct: Math.round(returnPct * 100) / 100,
        contribution: Math.round((returnPct / 10) * 100) / 100,
        first_price: firstPrice || null,
        last_price: lastPrice || null,
        has_data: hasData,
      };
    });
    
    const periodDays = filteredDates.length;
    
    console.log(`Performance calculated: Portfolio ${portfolioReturnPct.toFixed(2)}%, SPY ${spyReturnPct.toFixed(2)}%, Outperformance ${outperformance.toFixed(2)}%`);
    console.log(`Date range: ${startDate} to ${endDate} (${periodDays} days)`);
    
    return new Response(
      JSON.stringify({
        portfolio_value: portfolioValue,
        portfolio_return_pct: Math.round(portfolioReturnPct * 100) / 100,
        spy_return_pct: Math.round(spyReturnPct * 100) / 100,
        outperformance: Math.round(outperformance * 100) / 100,
        period_days: periodDays,
        start_date: startDate,
        end_date: endDate,
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
