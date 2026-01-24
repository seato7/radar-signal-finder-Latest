import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { period = 'ALL' } = await req.json().catch(() => ({}));

    // Get all snapshots
    const { data: snapshots, error: snapError } = await supabase
      .from('asset_score_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true });

    if (snapError) throw snapError;

    if (!snapshots || snapshots.length === 0) {
      return new Response(JSON.stringify({
        portfolio_value: 10000,
        portfolio_return_pct: 0,
        spy_return_pct: 0,
        outperformance: 0,
        period_days: 0,
        chart_data: [],
        asset_breakdown: []
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get unique dates and tickers
    const allDates = [...new Set(snapshots.map(s => s.snapshot_date))].sort();
    const tickers = [...new Set(snapshots.map(s => s.ticker))];

    // Filter dates by period
    let dates = allDates;
    if (period === '1W') {
      dates = allDates.slice(-7);
    } else if (period === '1M') {
      dates = allDates.slice(-30);
    }

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    // CRITICAL: Query SPY separately to avoid 1000-row limit cutting it off
    // Portfolio tickers are queried first, SPY last alphabetically, so it gets excluded
    const { data: portfolioPrices, error: portfolioError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', tickers)
      .in('date', dates)
      .limit(2000);

    if (portfolioError) throw portfolioError;

    // Fetch SPY prices separately - guaranteed to get them
    const { data: spyPrices, error: spyError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .eq('ticker', 'SPY')
      .in('date', dates);

    if (spyError) throw spyError;

    // Merge both price sets
    const allPrices = [...(portfolioPrices || []), ...(spyPrices || [])];
    console.log(`Fetched ${portfolioPrices?.length || 0} portfolio prices, ${spyPrices?.length || 0} SPY prices`);

    // Build price lookup
    const priceLookup: Record<string, Record<string, number>> = {};
    for (const p of allPrices) {
      if (!priceLookup[p.ticker]) priceLookup[p.ticker] = {};
      priceLookup[p.ticker][p.date] = p.close;
    }

    // Group snapshots by date
    const snapshotsByDate: Record<string, typeof snapshots> = {};
    for (const s of snapshots) {
      if (dates.includes(s.snapshot_date)) {
        if (!snapshotsByDate[s.snapshot_date]) snapshotsByDate[s.snapshot_date] = [];
        snapshotsByDate[s.snapshot_date].push(s);
      }
    }

    // Get the TOP 10 assets from the FIRST day (buy-and-hold strategy)
    const firstDaySnapshots = (snapshotsByDate[firstDate] || [])
      .sort((a, b) => (b.computed_score || 0) - (a.computed_score || 0))
      .slice(0, 10);

    const portfolioTickers = firstDaySnapshots.map(s => s.ticker);
    console.log('Portfolio tickers (first day):', portfolioTickers);

    // Calculate buy-and-hold returns for each asset
    const assetReturns: Record<string, { startPrice: number; endPrice: number; returnPct: number }> = {};
    let validAssets = 0;
    let totalReturn = 0;

    for (const ticker of portfolioTickers) {
      const startPrice = priceLookup[ticker]?.[firstDate];
      const endPrice = priceLookup[ticker]?.[lastDate];
      
      if (startPrice && endPrice && startPrice > 0) {
        const returnPct = ((endPrice - startPrice) / startPrice) * 100;
        assetReturns[ticker] = { startPrice, endPrice, returnPct };
        totalReturn += returnPct;
        validAssets++;
        console.log(`${ticker}: ${startPrice} -> ${endPrice} = ${returnPct.toFixed(2)}%`);
      }
    }

    // Portfolio return = average of individual asset returns (equal weight)
    const portfolioReturnPct = validAssets > 0 ? totalReturn / validAssets : 0;
    console.log(`Portfolio return: ${portfolioReturnPct.toFixed(2)}% (${validAssets} assets)`);

    // Calculate SPY return
    const spyStart = priceLookup['SPY']?.[firstDate];
    const spyEnd = priceLookup['SPY']?.[lastDate];
    const spyReturn = spyStart && spyEnd && spyStart > 0 
      ? ((spyEnd - spyStart) / spyStart) * 100 
      : 0;

    // Build chart data - track daily portfolio value based on price changes
    const chartData: any[] = [];
    const startingValue = 10000;
    const perAssetAllocation = startingValue / portfolioTickers.length;

    // Track shares bought at start (equal dollar allocation)
    const shares: Record<string, number> = {};
    for (const ticker of portfolioTickers) {
      const startPrice = priceLookup[ticker]?.[firstDate];
      if (startPrice && startPrice > 0) {
        shares[ticker] = perAssetAllocation / startPrice;
      }
    }

    // SPY shares
    const spyShares = spyStart && spyStart > 0 ? startingValue / spyStart : 0;

    for (const date of dates) {
      // Calculate portfolio value on this date
      let portfolioValue = 0;
      let assetsWithPrice = 0;
      
      for (const ticker of portfolioTickers) {
        const price = priceLookup[ticker]?.[date];
        if (price && shares[ticker]) {
          portfolioValue += shares[ticker] * price;
          assetsWithPrice++;
        } else if (shares[ticker]) {
          // Use last known price if missing
          const lastKnownPrice = priceLookup[ticker]?.[firstDate] || 0;
          portfolioValue += shares[ticker] * lastKnownPrice;
          assetsWithPrice++;
        }
      }

      // SPY value
      const spyPrice = priceLookup['SPY']?.[date] || spyStart || 0;
      const spyValue = spyShares * spyPrice;

      chartData.push({
        date,
        portfolio: Math.round(portfolioValue),
        spy: Math.round(spyValue)
      });
    }

    // Final portfolio value from chart
    const finalPortfolioValue = chartData.length > 0 ? chartData[chartData.length - 1].portfolio : startingValue;

    // Get latest day's assets for breakdown
    const latestSnapshots = snapshotsByDate[lastDate] || firstDaySnapshots;
    
    const assetBreakdown = latestSnapshots.slice(0, 10).map(s => {
      const startPrice = priceLookup[s.ticker]?.[firstDate];
      const endPrice = priceLookup[s.ticker]?.[lastDate];
      let periodReturn = 0;
      if (startPrice && endPrice && startPrice > 0) {
        periodReturn = ((endPrice - startPrice) / startPrice) * 100;
      }
      return {
        ticker: s.ticker,
        name: s.asset_name,
        score: s.computed_score,
        return_pct: Math.round(periodReturn * 100) / 100,
        contribution: Math.round((periodReturn / 10) * 100) / 100
      };
    });

    const outperformance = portfolioReturnPct - spyReturn;

    return new Response(JSON.stringify({
      portfolio_value: finalPortfolioValue,
      portfolio_return_pct: Math.round(portfolioReturnPct * 100) / 100,
      spy_return_pct: Math.round(spyReturn * 100) / 100,
      outperformance: Math.round(outperformance * 100) / 100,
      period_days: dates.length,
      start_date: firstDate,
      end_date: lastDate,
      chart_data: chartData,
      asset_breakdown: assetBreakdown,
      starting_investment: startingValue,
      last_updated_at: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
