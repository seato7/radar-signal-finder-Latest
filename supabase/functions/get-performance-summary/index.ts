import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PriceRow = { ticker: string; date: string; close: number };

function findNearestPrice(
  ticker: string,
  targetDate: string,
  pricesByTicker: Record<string, PriceRow[]>,
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
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const days: 7 | 30 | 'all' = body.days ?? 'all';

    // ── 1. Query asset_predictions (service role bypasses 1000-row REST limit) ──
    let predictionsQuery = supabase
      .from('asset_predictions')
      .select('snapshot_date, ticker, rank, confidence_score')
      .lte('rank', 10)
      .order('snapshot_date', { ascending: true })
      .order('rank', { ascending: true });

    if (days === 7 || days === 30) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      predictionsQuery = predictionsQuery.gte('snapshot_date', cutoff);
    }

    const { data: predictions, error: predError } = await predictionsQuery;
    if (predError) throw predError;

    console.log(`Fetched ${predictions?.length ?? 0} predictions for days=${days}`);

    if (!predictions || predictions.length === 0) {
      return new Response(JSON.stringify({
        portfolio_value: 10000,
        portfolio_return_pct: 0,
        spy_return_pct: 0,
        outperformance: 0,
        period_days: 0,
        start_date: '',
        end_date: '',
        starting_investment: 10000,
        chart_data: [],
        asset_breakdown: [],
        daily_history: [],
        data_quality: { assets_with_prices: 0, total_assets: 0, coverage_pct: 0 },
        last_updated_at: new Date().toISOString(),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── 2. Derive date range and unique tickers ──
    const dates = [...new Set(predictions.map(p => p.snapshot_date as string))].sort();
    const tickers = [...new Set(predictions.map(p => p.ticker as string))];
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const MS_PER_DAY = 86400000;
    const startWithBuffer = new Date(new Date(firstDate).getTime() - 7 * MS_PER_DAY)
      .toISOString().slice(0, 10);
    const endWithBuffer = new Date(new Date(lastDate).getTime() + 7 * MS_PER_DAY)
      .toISOString().slice(0, 10);

    // ── 3. Fetch prices in batches of 20 + SPY ──
    const BATCH_SIZE = 20;
    const batches: string[][] = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      batches.push(tickers.slice(i, i + BATCH_SIZE));
    }

    const batchResults = await Promise.all(
      batches.map(batch =>
        supabase
          .from('prices')
          .select('ticker, date, close')
          .in('ticker', batch)
          .gte('date', startWithBuffer)
          .lte('date', endWithBuffer)
          .order('date', { ascending: true })
          .limit(5000)
      )
    );

    const { data: spyPrices } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .eq('ticker', 'SPY')
      .gte('date', startWithBuffer)
      .lte('date', endWithBuffer)
      .order('date', { ascending: true });

    const portfolioPrices = batchResults.flatMap(r => (r.data || []) as PriceRow[]);
    const allPrices = [...portfolioPrices, ...((spyPrices || []) as PriceRow[])];
    console.log(`Fetched ${portfolioPrices.length} portfolio prices, ${spyPrices?.length ?? 0} SPY prices`);

    // ── 4. Build pricesByTicker lookup ──
    const pricesByTicker: Record<string, PriceRow[]> = {};
    for (const p of allPrices) {
      if (!pricesByTicker[p.ticker]) pricesByTicker[p.ticker] = [];
      pricesByTicker[p.ticker].push({ ticker: p.ticker, date: p.date, close: Number(p.close) });
    }
    for (const ticker of Object.keys(pricesByTicker)) {
      pricesByTicker[ticker].sort((a, b) => a.date.localeCompare(b.date));
    }

    // ── 5. Group predictions by date ──
    const snapshotsByDate: Record<string, typeof predictions> = {};
    for (const p of predictions) {
      if (!snapshotsByDate[p.snapshot_date]) snapshotsByDate[p.snapshot_date] = [];
      snapshotsByDate[p.snapshot_date].push(p);
    }

    // ── 6a. Buy-and-hold asset breakdown from first day's top 10 ──
    const STARTING_VALUE = 10000;
    const firstDaySnapshots = (snapshotsByDate[firstDate] || [])
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .slice(0, 10);
    const portfolioTickers = firstDaySnapshots.map(s => s.ticker);

    const assetReturns: Record<string, {
      startPrice: number; endPrice: number; returnPct: number;
      startDate: string; endDate: string; hasData: boolean;
    }> = {};
    let validAssets = 0;
    let totalReturn = 0;

    for (const ticker of portfolioTickers) {
      const startPriceData = findNearestPrice(ticker, firstDate, pricesByTicker, 'before');
      const endPriceData = findNearestPrice(ticker, lastDate, pricesByTicker, 'after');
      if (startPriceData && endPriceData && startPriceData.price > 0) {
        const returnPct = ((endPriceData.price - startPriceData.price) / startPriceData.price) * 100;
        assetReturns[ticker] = {
          startPrice: startPriceData.price, endPrice: endPriceData.price,
          returnPct, startDate: startPriceData.date, endDate: endPriceData.date, hasData: true,
        };
        totalReturn += returnPct;
        validAssets++;
      } else {
        assetReturns[ticker] = {
          startPrice: 0, endPrice: 0, returnPct: 0,
          startDate: '', endDate: '', hasData: false,
        };
      }
    }

    const portfolioReturnPct = validAssets > 0 ? totalReturn / validAssets : 0;

    const spyStartData = findNearestPrice('SPY', firstDate, pricesByTicker, 'before');
    const spyEndData = findNearestPrice('SPY', lastDate, pricesByTicker, 'after');
    const spyReturn = spyStartData && spyEndData && spyStartData.price > 0
      ? ((spyEndData.price - spyStartData.price) / spyStartData.price) * 100
      : 0;

    // ── 6b. Chart data (daily buy-and-hold value) ──
    const perAssetAllocation = validAssets > 0 ? STARTING_VALUE / validAssets : 0;
    const shares: Record<string, number> = {};
    for (const ticker of portfolioTickers) {
      const ar = assetReturns[ticker];
      if (ar.hasData && ar.startPrice > 0) {
        shares[ticker] = perAssetAllocation / ar.startPrice;
      }
    }
    const spyShares = spyStartData && spyStartData.price > 0 ? STARTING_VALUE / spyStartData.price : 0;
    const lastKnownPrice: Record<string, number> = {};
    for (const ticker of portfolioTickers) {
      if (assetReturns[ticker].hasData) lastKnownPrice[ticker] = assetReturns[ticker].startPrice;
    }
    let lastKnownSpyPrice = spyStartData?.price || 0;

    const chartData: { date: string; portfolio: number; spy: number }[] = [];
    for (const date of dates) {
      for (const ticker of portfolioTickers) {
        const p = pricesByTicker[ticker]?.find(px => px.date === date);
        if (p) lastKnownPrice[ticker] = p.close;
      }
      const spyP = pricesByTicker['SPY']?.find(px => px.date === date);
      if (spyP) lastKnownSpyPrice = spyP.close;

      let portfolioValue = 0;
      for (const ticker of portfolioTickers) {
        if (shares[ticker] && lastKnownPrice[ticker]) {
          portfolioValue += shares[ticker] * lastKnownPrice[ticker];
        }
      }
      chartData.push({
        date,
        portfolio: Math.round(portfolioValue),
        spy: Math.round(spyShares * lastKnownSpyPrice),
      });
    }

    const finalPortfolioValue = chartData.length > 0 ? chartData[chartData.length - 1].portfolio : STARTING_VALUE;

    // ── 6c. Daily history (day-by-day returns for each day's top 10) ──
    let cumulativeValue = STARTING_VALUE;
    let spyCumulativeValue = STARTING_VALUE;

    const dailyHistory: Array<{
      date: string;
      daily_return_pct: number;
      spy_daily_return_pct: number;
      cumulative_value: number;
      spy_cumulative_value: number;
      is_negative_day: boolean;
      assets_with_data: number;
      top_assets: Array<{ ticker: string; name: string; score: number; daily_return_pct: number; rank: number }>;
    }> = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const daySnapshots = (snapshotsByDate[date] || []).slice(0, 10);
      const prevDate = i > 0 ? dates[i - 1] : null;

      const portfolioReturns: number[] = [];
      const topAssets: Array<{ ticker: string; name: string; score: number; daily_return_pct: number; rank: number }> = [];
      let assetsWithData = 0;

      for (const snapshot of daySnapshots) {
        const currentPriceData = findNearestPrice(snapshot.ticker, date, pricesByTicker, 'before');
        const prevPriceData = prevDate
          ? findNearestPrice(snapshot.ticker, prevDate, pricesByTicker, 'before')
          : currentPriceData;

        let dailyReturn = 0;
        if (prevPriceData && currentPriceData && prevPriceData.price > 0) {
          dailyReturn = ((currentPriceData.price - prevPriceData.price) / prevPriceData.price) * 100;
          assetsWithData++;
        }
        portfolioReturns.push(dailyReturn);
        topAssets.push({
          ticker: snapshot.ticker,
          name: snapshot.ticker,
          score: Math.round((snapshot.confidence_score || 0) * 100),
          daily_return_pct: Math.round(dailyReturn * 100) / 100,
          rank: snapshot.rank || 0,
        });
      }

      const coverageRatio = topAssets.length > 0 ? assetsWithData / topAssets.length : 0;
      const avgDailyReturn = portfolioReturns.length > 0 && assetsWithData > 0
        ? portfolioReturns.reduce((a, b) => a + b, 0) / assetsWithData
        : 0;

      const spyCurrentData = findNearestPrice('SPY', date, pricesByTicker, 'before');
      const spyPrevData = prevDate
        ? findNearestPrice('SPY', prevDate, pricesByTicker, 'before')
        : spyCurrentData;
      const spyDailyReturn = spyPrevData && spyCurrentData && spyPrevData.price > 0
        ? ((spyCurrentData.price - spyPrevData.price) / spyPrevData.price) * 100
        : 0;

      if (i > 0) {
        cumulativeValue = cumulativeValue * (1 + avgDailyReturn / 100);
        spyCumulativeValue = spyCumulativeValue * (1 + spyDailyReturn / 100);
      }

      if (coverageRatio >= 0.5 || i === 0) {
        dailyHistory.push({
          date,
          daily_return_pct: Math.round(avgDailyReturn * 100) / 100,
          spy_daily_return_pct: Math.round(spyDailyReturn * 100) / 100,
          cumulative_value: Math.round(cumulativeValue * 100) / 100,
          spy_cumulative_value: Math.round(spyCumulativeValue * 100) / 100,
          is_negative_day: avgDailyReturn < 0,
          assets_with_data: assetsWithData,
          top_assets: topAssets,
        });
      }
    }

    dailyHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
        has_data: ar.hasData,
      };
    });

    const duration = Date.now() - startTime;
    console.log(`get-performance-summary completed in ${duration}ms — days=${days}, predictions=${predictions.length}, dates=${dates.length}`);

    // ── 7. Log to function_status ──
    try {
      await supabase.from('function_status').upsert({
        function_name: 'get-performance-summary',
        last_run_at: new Date().toISOString(),
        last_run_status: 'success',
        last_run_duration_ms: duration,
        last_error: null,
      }, { onConflict: 'function_name' });
    } catch (_) {}

    return new Response(JSON.stringify({
      portfolio_value: finalPortfolioValue,
      portfolio_return_pct: Math.round(portfolioReturnPct * 100) / 100,
      spy_return_pct: Math.round(spyReturn * 100) / 100,
      outperformance: Math.round((portfolioReturnPct - spyReturn) * 100) / 100,
      period_days: dates.length,
      start_date: firstDate,
      end_date: lastDate,
      starting_investment: STARTING_VALUE,
      chart_data: chartData,
      asset_breakdown: assetBreakdown,
      daily_history: dailyHistory,
      data_quality: {
        assets_with_prices: validAssets,
        total_assets: portfolioTickers.length,
        coverage_pct: portfolioTickers.length > 0
          ? Math.round((validAssets / portfolioTickers.length) * 100)
          : 0,
      },
      last_updated_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('get-performance-summary error:', errMsg);

    try {
      await supabase.from('function_status').upsert({
        function_name: 'get-performance-summary',
        last_run_at: new Date().toISOString(),
        last_run_status: 'error',
        last_run_duration_ms: duration,
        last_error: errMsg,
      }, { onConflict: 'function_name' });
    } catch (_) {}

    return new Response(JSON.stringify({ error: errMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
