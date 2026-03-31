import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to find nearest price within a window
function findNearestPrice(
  ticker: string,
  targetDate: string,
  pricesByTicker: Record<string, Array<{ date: string; close: number }>>,
  direction: 'before' | 'after' | 'any' = 'any',
  maxDays = 7
): { date: string; price: number } | null {
  const prices = pricesByTicker[ticker];
  if (!prices || prices.length === 0) return null;

  const target = new Date(targetDate).getTime();
  let best: { date: string; price: number; diff: number } | null = null;

  for (const p of prices) {
    const pDate = new Date(p.date).getTime();
    const diff = pDate - target;
    const absDiff = Math.abs(diff);
    const daysDiff = absDiff / (1000 * 60 * 60 * 24);

    if (daysDiff > maxDays) continue;

    // Direction filtering
    if (direction === 'before' && diff > 0) continue;
    if (direction === 'after' && diff < 0) continue;

    if (!best || absDiff < best.diff) {
      best = { date: p.date, price: p.close, diff: absDiff };
    }
  }

  return best ? { date: best.date, price: best.price } : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { period = 'ALL' } = await req.json().catch(() => ({}));

    // Get all predictions (top 10 per day)
    const { data: snapshots, error: snapError } = await supabase
      .from('asset_predictions')
      .select('snapshot_date, ticker, rank, confidence_score')
      .lte('rank', 10)
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
        asset_breakdown: [],
        data_quality: { assets_with_prices: 0, total_assets: 0, coverage_pct: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get unique dates and tickers
    const allDates = [...new Set(snapshots.map(s => s.snapshot_date))].sort();
    const tickers = [...new Set(snapshots.map(s => s.ticker))];

    // Filter dates by period - now using 30D instead of 1M
    let dates = allDates;
    if (period === '1W') {
      dates = allDates.slice(-7);
    } else if (period === '30D') {
      dates = allDates.slice(-30);
    }

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    // Calculate date range with buffer for nearest-price lookup
    const startDateWithBuffer = new Date(new Date(firstDate).getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const endDateWithBuffer = new Date(new Date(lastDate).getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // Query ALL prices for portfolio tickers in date range (with buffer)
    // Fetch in batches to avoid the 1000 row limit
    let portfolioPrices: { ticker: string; date: string; close: number }[] = [];
    const tickerBatches = [];
    const BATCH_SIZE = 20; // Fetch 20 tickers at a time
    
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      tickerBatches.push(tickers.slice(i, i + BATCH_SIZE));
    }
    
    for (const batch of tickerBatches) {
      const { data: batchPrices, error: batchError } = await supabase
        .from('prices')
        .select('ticker, date, close')
        .in('ticker', batch)
        .gte('date', startDateWithBuffer)
        .lte('date', endDateWithBuffer)
        .order('date', { ascending: true })
        .limit(5000);

      if (batchError) throw batchError;
      if (batchPrices) {
        portfolioPrices = portfolioPrices.concat(batchPrices);
      }
    }

    // Fetch SPY prices separately - guaranteed to get them
    const { data: spyPrices, error: spyError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .eq('ticker', 'SPY')
      .gte('date', startDateWithBuffer)
      .lte('date', endDateWithBuffer)
      .order('date', { ascending: true });

    if (spyError) throw spyError;

    // Merge both price sets
    const allPrices = [...(portfolioPrices || []), ...(spyPrices || [])];
    console.log(`Fetched ${portfolioPrices?.length || 0} portfolio prices, ${spyPrices?.length || 0} SPY prices`);

    // Build price lookup by ticker -> array of {date, close}
    const pricesByTicker: Record<string, Array<{ date: string; close: number }>> = {};
    for (const p of allPrices) {
      if (!pricesByTicker[p.ticker]) pricesByTicker[p.ticker] = [];
      pricesByTicker[p.ticker].push({ date: p.date, close: Number(p.close) });
    }

    // Sort prices by date for each ticker
    for (const ticker of Object.keys(pricesByTicker)) {
      pricesByTicker[ticker].sort((a, b) => a.date.localeCompare(b.date));
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
      .sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0))
      .slice(0, 10);

    const portfolioTickers = firstDaySnapshots.map(s => s.ticker);
    console.log('Portfolio tickers (first day):', portfolioTickers);

    // Calculate buy-and-hold returns using nearest-price logic
    const assetReturns: Record<string, { 
      startPrice: number; 
      endPrice: number; 
      returnPct: number;
      startDate: string;
      endDate: string;
      hasData: boolean;
    }> = {};
    let validAssets = 0;
    let totalReturn = 0;

    for (const ticker of portfolioTickers) {
      const startPriceData = findNearestPrice(ticker, firstDate, pricesByTicker, 'before');
      const endPriceData = findNearestPrice(ticker, lastDate, pricesByTicker, 'after');
      
      if (startPriceData && endPriceData && startPriceData.price > 0) {
        const returnPct = ((endPriceData.price - startPriceData.price) / startPriceData.price) * 100;
        assetReturns[ticker] = { 
          startPrice: startPriceData.price, 
          endPrice: endPriceData.price, 
          returnPct,
          startDate: startPriceData.date,
          endDate: endPriceData.date,
          hasData: true
        };
        totalReturn += returnPct;
        validAssets++;
        console.log(`${ticker}: ${startPriceData.price} (${startPriceData.date}) -> ${endPriceData.price} (${endPriceData.date}) = ${returnPct.toFixed(2)}%`);
      } else {
        assetReturns[ticker] = {
          startPrice: 0,
          endPrice: 0,
          returnPct: 0,
          startDate: '',
          endDate: '',
          hasData: false
        };
        console.log(`${ticker}: NO PRICE DATA`);
      }
    }

    // Portfolio return = average of individual asset returns (equal weight)
    const portfolioReturnPct = validAssets > 0 ? totalReturn / validAssets : 0;
    console.log(`Portfolio return: ${portfolioReturnPct.toFixed(2)}% (${validAssets} of ${portfolioTickers.length} assets with data)`);

    // Calculate SPY return using nearest-price logic
    const spyStartData = findNearestPrice('SPY', firstDate, pricesByTicker, 'before');
    const spyEndData = findNearestPrice('SPY', lastDate, pricesByTicker, 'after');
    const spyReturn = spyStartData && spyEndData && spyStartData.price > 0 
      ? ((spyEndData.price - spyStartData.price) / spyStartData.price) * 100 
      : 0;
    
    console.log(`SPY: ${spyStartData?.price} -> ${spyEndData?.price} = ${spyReturn.toFixed(2)}%`);

    // Build chart data - track daily portfolio value based on price changes
    const chartData: { date: string; portfolio: number; spy: number }[] = [];
    const startingValue = 10000;
    const perAssetAllocation = validAssets > 0 ? startingValue / validAssets : 0;

    // Track shares bought at start (equal dollar allocation) - only for assets with data
    const shares: Record<string, number> = {};
    for (const ticker of portfolioTickers) {
      const ar = assetReturns[ticker];
      if (ar.hasData && ar.startPrice > 0) {
        shares[ticker] = perAssetAllocation / ar.startPrice;
      }
    }

    // SPY shares
    const spyShares = spyStartData && spyStartData.price > 0 ? startingValue / spyStartData.price : 0;

    // Build running price state for each ticker (carry forward last known price)
    const lastKnownPrice: Record<string, number> = {};
    for (const ticker of portfolioTickers) {
      const ar = assetReturns[ticker];
      if (ar.hasData) {
        lastKnownPrice[ticker] = ar.startPrice;
      }
    }
    let lastKnownSpyPrice = spyStartData?.price || 0;

    for (const date of dates) {
      // Update last known prices from today's data
      for (const ticker of portfolioTickers) {
        const todayPrice = pricesByTicker[ticker]?.find(p => p.date === date);
        if (todayPrice) {
          lastKnownPrice[ticker] = todayPrice.close;
        }
      }
      const todaySpyPrice = pricesByTicker['SPY']?.find(p => p.date === date);
      if (todaySpyPrice) {
        lastKnownSpyPrice = todaySpyPrice.close;
      }

      // Calculate portfolio value on this date
      let portfolioValue = 0;
      for (const ticker of portfolioTickers) {
        if (shares[ticker] && lastKnownPrice[ticker]) {
          portfolioValue += shares[ticker] * lastKnownPrice[ticker];
        }
      }

      // SPY value
      const spyValue = spyShares * lastKnownSpyPrice;

      chartData.push({
        date,
        portfolio: Math.round(portfolioValue),
        spy: Math.round(spyValue)
      });
    }

    // Final portfolio value from chart
    const finalPortfolioValue = chartData.length > 0 ? chartData[chartData.length - 1].portfolio : startingValue;

    // Build asset breakdown with data quality info
    const assetBreakdown = firstDaySnapshots.map(s => {
      const ar = assetReturns[s.ticker] || { returnPct: 0, startPrice: null, endPrice: null, hasData: false };
      return {
        ticker: s.ticker,
        name: s.ticker,
        score: Math.round((s.confidence_score || 0) * 100),
        return_pct: Math.round(ar.returnPct * 100) / 100,
        contribution: Math.round((ar.returnPct / 10) * 100) / 100,
        first_price: ar.startPrice || null,
        last_price: ar.endPrice || null,
        has_data: ar.hasData
      };
    });

    const outperformance = portfolioReturnPct - spyReturn;

    // Data quality metrics
    const dataQuality = {
      assets_with_prices: validAssets,
      total_assets: portfolioTickers.length,
      coverage_pct: portfolioTickers.length > 0 ? Math.round((validAssets / portfolioTickers.length) * 100) : 0
    };

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
      data_quality: dataQuality,
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
