import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeResult {
  ticker: string;
  asset_id: string;
  entry_date: string;
  entry_price: number;
  exit_date: string | null;
  exit_price: number | null;
  result: 'triggered' | 'stopped' | 'expired' | 'open';
  pnl_pct: number;
  position_size_pct: number;
  ai_score: number;
  confidence: number;
  hybrid_score: number;
}

interface StrategyStats {
  strategy_name: string;
  total_trades: number;
  win_rate: number;
  avg_return: number;
  avg_winner: number;
  avg_loser: number;
  max_drawdown: number;
  sharpe_ratio: number;
  triggered_count: number;
  stopped_count: number;
  expired_count: number;
  open_count: number;
}

function computeStats(strategyName: string, trades: TradeResult[]): StrategyStats {
  if (trades.length === 0) {
    return {
      strategy_name: strategyName,
      total_trades: 0,
      win_rate: 0,
      avg_return: 0,
      avg_winner: 0,
      avg_loser: 0,
      max_drawdown: 0,
      sharpe_ratio: 0,
      triggered_count: 0,
      stopped_count: 0,
      expired_count: 0,
      open_count: 0,
    };
  }

  const pnls = trades.map((t) => t.pnl_pct);
  const winners = pnls.filter((p) => p > 0);
  const losers = pnls.filter((p) => p <= 0);

  const avgReturn = pnls.reduce((s, p) => s + p, 0) / pnls.length;
  const avgWinner = winners.length > 0 ? winners.reduce((s, p) => s + p, 0) / winners.length : 0;
  const avgLoser = losers.length > 0 ? losers.reduce((s, p) => s + p, 0) / losers.length : 0;
  const winRate = winners.length / pnls.length;

  // Stddev for Sharpe
  const variance = pnls.reduce((s, p) => s + Math.pow(p - avgReturn, 2), 0) / pnls.length;
  const stddev = Math.sqrt(variance);
  const sharpeRatio = stddev > 0 ? (avgReturn / stddev) * Math.sqrt(252) : 0;

  // Max drawdown: running peak-to-trough on cumulative returns
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  for (const pnl of pnls) {
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    strategy_name: strategyName,
    total_trades: trades.length,
    win_rate: round2(winRate * 100),
    avg_return: round2(avgReturn),
    avg_winner: round2(avgWinner),
    avg_loser: round2(avgLoser),
    max_drawdown: round2(maxDrawdown),
    sharpe_ratio: round2(sharpeRatio),
    triggered_count: trades.filter((t) => t.result === 'triggered').length,
    stopped_count: trades.filter((t) => t.result === 'stopped').length,
    expired_count: trades.filter((t) => t.result === 'expired').length,
    open_count: trades.filter((t) => t.result === 'open').length,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // Parse body params
    let startDate: string;
    let endDate: string;
    try {
      const body = await req.json();
      startDate = body?.start_date ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = body?.end_date ?? new Date().toISOString().split('T')[0];
    } catch {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = new Date().toISOString().split('T')[0];
    }

    console.log(`[BACKTEST] Running backtest from ${startDate} to ${endDate}`);

    // =========================================================================
    // 1. FETCH QUALIFYING AI SCORES IN DATE RANGE
    // =========================================================================
    const { data: aiScoreRows, error: aiError } = await supabase
      .from('ai_scores')
      .select('asset_id, ai_score, confidence, direction, scored_at')
      .gte('scored_at', `${startDate}T00:00:00.000Z`)
      .lte('scored_at', `${endDate}T23:59:59.999Z`)
      .gt('ai_score', 60)
      .eq('direction', 'up')
      .gte('confidence', 0.795)
      .order('scored_at', { ascending: true });

    if (aiError) throw aiError;

    console.log(`[BACKTEST] Found ${aiScoreRows?.length ?? 0} qualifying ai_score rows`);

    if (!aiScoreRows || aiScoreRows.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No qualifying ai_score rows in date range', week4: null, baseline: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Deduplicate: keep highest ai_score per asset per day
    const dedupeMap = new Map<string, typeof aiScoreRows[0]>();
    for (const row of aiScoreRows) {
      const day = row.scored_at.split('T')[0];
      const key = `${row.asset_id}::${day}`;
      const existing = dedupeMap.get(key);
      if (!existing || Number(row.ai_score) > Number(existing.ai_score)) {
        dedupeMap.set(key, row);
      }
    }
    const deduped = [...dedupeMap.values()].slice(0, 500);

    console.log(`[BACKTEST] After dedupe: ${deduped.length} candidate entries`);

    // =========================================================================
    // 2. FETCH ASSETS FOR hybrid_score FILTER
    // =========================================================================
    const assetIds = [...new Set(deduped.map((r) => r.asset_id))];
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker, hybrid_score, sector')
      .in('id', assetIds)
      .gt('hybrid_score', 65);

    if (assetsError) throw assetsError;

    const assetMap = new Map<string, { ticker: string; hybrid_score: number; sector: string | null }>();
    for (const a of assets || []) {
      assetMap.set(a.id, { ticker: a.ticker, hybrid_score: Number(a.hybrid_score), sector: a.sector ?? null });
    }

    // Filter entries to only those passing hybrid_score threshold
    const qualifying = deduped.filter((r) => assetMap.has(r.asset_id));
    console.log(`[BACKTEST] After hybrid_score filter: ${qualifying.length} qualifying entries`);

    // =========================================================================
    // 3. BULK FETCH PRICES FOR ALL RELEVANT TICKERS + WIDE DATE RANGE
    // =========================================================================
    const tickers = [...new Set(qualifying.map((r) => assetMap.get(r.asset_id)!.ticker))];

    // Fetch prices from startDate through endDate + 14 days (for forward walk)
    const priceEndDate = new Date(new Date(endDate).getTime() + 14 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const { data: priceRows, error: priceError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', tickers)
      .gte('date', startDate)
      .lte('date', priceEndDate)
      .order('ticker')
      .order('date', { ascending: true });

    if (priceError) throw priceError;

    // Build map: ticker -> sorted array of { date, close }
    const pricesByTicker = new Map<string, Array<{ date: string; close: number }>>();
    for (const row of priceRows || []) {
      if (!pricesByTicker.has(row.ticker)) pricesByTicker.set(row.ticker, []);
      pricesByTicker.get(row.ticker)!.push({ date: row.date, close: Number(row.close) });
    }

    // =========================================================================
    // 4. SIMULATE WEEK4 KELLY STRATEGY
    // =========================================================================
    const week4Trades: TradeResult[] = [];

    for (const entry of qualifying) {
      const asset = assetMap.get(entry.asset_id)!;
      const tickerPrices = pricesByTicker.get(asset.ticker);
      if (!tickerPrices || tickerPrices.length === 0) continue;

      const entryDay = entry.scored_at.split('T')[0];

      // Find entry price: closest date on or after scored_at
      const entryCandle = tickerPrices.find((p) => p.date >= entryDay);
      if (!entryCandle) continue;

      const entryPrice = entryCandle.close;
      const entryDate = entryCandle.date;
      const stopLoss = entryPrice * 0.90;
      const exitTarget = entryPrice * 1.15;

      // expires_date = entry_date + 7 calendar days
      const expiresDate = new Date(new Date(entryDate).getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      // Kelly position size (simplified — use confidence-tiered fallback, no live DB metrics)
      const confidence = Number(entry.confidence);
      const hybridScore = asset.hybrid_score;
      const baseSize = (hybridScore - 65) / 400 * confidence;
      const minSize = confidence >= 0.795 ? 0.05 : confidence >= 0.645 ? 0.03 : 0.01;
      const positionSizePct = Math.min(0.10, Math.max(minSize, baseSize));

      // Walk forward through prices (days after entry, up to expiresDate)
      const forwardPrices = tickerPrices.filter((p) => p.date > entryDate && p.date <= expiresDate);

      let result: TradeResult['result'] = 'open';
      let exitPrice: number | null = null;
      let exitDate: string | null = null;
      let peakPrice = entryPrice;

      for (const candle of forwardPrices) {
        const price = candle.close;
        if (price > peakPrice) peakPrice = price;

        // Hard stop
        if (price <= stopLoss) {
          result = 'stopped';
          exitPrice = price;
          exitDate = candle.date;
          break;
        }
        // Trailing stop (5% drawdown from peak)
        if (price < peakPrice * 0.95) {
          result = 'stopped';
          exitPrice = price;
          exitDate = candle.date;
          break;
        }
        // Target hit
        if (price >= exitTarget) {
          result = 'triggered';
          exitPrice = price;
          exitDate = candle.date;
          break;
        }
        // Time exit — last day, price at or below entry
        if (candle.date === expiresDate && price <= entryPrice) {
          result = 'expired';
          exitPrice = price;
          exitDate = candle.date;
          break;
        }
      }

      // If still open, use last available price
      if (result === 'open') {
        const lastCandle = forwardPrices[forwardPrices.length - 1];
        exitPrice = lastCandle?.close ?? entryPrice;
        exitDate = lastCandle?.date ?? entryDate;
      }

      const pnlPct = Math.round(((exitPrice! - entryPrice) / entryPrice) * 10000) / 100;

      week4Trades.push({
        ticker: asset.ticker,
        asset_id: entry.asset_id,
        entry_date: entryDate,
        entry_price: entryPrice,
        exit_date: exitDate,
        exit_price: exitPrice,
        result,
        pnl_pct: pnlPct,
        position_size_pct: Math.round(positionSizePct * 10000) / 10000,
        ai_score: Number(entry.ai_score),
        confidence,
        hybrid_score: hybridScore,
      });
    }

    console.log(`[BACKTEST] Week4 strategy: ${week4Trades.length} simulated trades`);

    // =========================================================================
    // 5. SIMULATE BUY-TOP-20 BASELINE
    // =========================================================================
    // Collect all unique dates in the range
    const allDates = [...new Set(
      (priceRows || []).map((r) => r.date).filter((d) => d >= startDate && d <= endDate),
    )].sort();

    // Fetch all assets ordered by hybrid_score for the baseline
    const { data: allAssets } = await supabase
      .from('assets')
      .select('id, ticker, hybrid_score')
      .order('hybrid_score', { ascending: false })
      .limit(200);

    const top20Tickers = (allAssets || []).slice(0, 20).map((a) => a.ticker);

    const baselineTrades: TradeResult[] = [];

    for (let i = 0; i < allDates.length - 1; i++) {
      const entryDay = allDates[i];
      const exitDay = allDates[i + 1];

      for (const ticker of top20Tickers) {
        const tickerPrices = pricesByTicker.get(ticker);
        if (!tickerPrices) continue;

        const entryCandle = tickerPrices.find((p) => p.date === entryDay);
        const exitCandle = tickerPrices.find((p) => p.date === exitDay);
        if (!entryCandle || !exitCandle) continue;

        const pnlPct = Math.round(
          ((exitCandle.close - entryCandle.close) / entryCandle.close) * 10000,
        ) / 100;

        baselineTrades.push({
          ticker,
          asset_id: '',
          entry_date: entryDay,
          entry_price: entryCandle.close,
          exit_date: exitDay,
          exit_price: exitCandle.close,
          result: pnlPct > 0 ? 'triggered' : 'stopped',
          pnl_pct: pnlPct,
          position_size_pct: 0.05, // equal weight across 20 = 5% each
          ai_score: 0,
          confidence: 0,
          hybrid_score: 0,
        });
      }
    }

    console.log(`[BACKTEST] Baseline strategy: ${baselineTrades.length} simulated trades`);

    // =========================================================================
    // 6. COMPUTE STATS
    // =========================================================================
    const week4Stats = computeStats('week4_kelly_stops', week4Trades);
    const baselineStats = computeStats('buy_top_20_baseline', baselineTrades);

    // =========================================================================
    // 7. INSERT INTO backtest_analyses
    // =========================================================================
    const runAt = new Date().toISOString();
    const { error: insertError } = await supabase
      .from('backtest_analyses')
      .insert([
        {
          strategy_name: week4Stats.strategy_name,
          generated_at: runAt,
          model: 'backtest-trade-signals-v1',
          insights: `Week 4 Kelly+Stops: ${week4Stats.total_trades} trades, win_rate=${(week4Stats.win_rate).toFixed(1)}%, avg_return=${(week4Stats.avg_return).toFixed(2)}%, sharpe=${week4Stats.sharpe_ratio.toFixed(2)}`,
          backtest_result_snapshot: {
            start_date: startDate,
            end_date: endDate,
            total_trades: week4Stats.total_trades,
            win_rate: week4Stats.win_rate,
            avg_return: week4Stats.avg_return,
            avg_winner: week4Stats.avg_winner,
            avg_loser: week4Stats.avg_loser,
            max_drawdown: week4Stats.max_drawdown,
            sharpe_ratio: week4Stats.sharpe_ratio,
            triggered_count: week4Stats.triggered_count,
            stopped_count: week4Stats.stopped_count,
            expired_count: week4Stats.expired_count,
            open_count: week4Stats.open_count,
          },
        },
        {
          strategy_name: baselineStats.strategy_name,
          generated_at: runAt,
          model: 'backtest-trade-signals-v1',
          insights: `Buy-Top-20 Baseline: ${baselineStats.total_trades} trades, win_rate=${(baselineStats.win_rate).toFixed(1)}%, avg_return=${(baselineStats.avg_return).toFixed(2)}%, sharpe=${baselineStats.sharpe_ratio.toFixed(2)}`,
          backtest_result_snapshot: {
            start_date: startDate,
            end_date: endDate,
            total_trades: baselineStats.total_trades,
            win_rate: baselineStats.win_rate,
            avg_return: baselineStats.avg_return,
            avg_winner: baselineStats.avg_winner,
            avg_loser: baselineStats.avg_loser,
            max_drawdown: baselineStats.max_drawdown,
            sharpe_ratio: baselineStats.sharpe_ratio,
            triggered_count: baselineStats.triggered_count,
            stopped_count: baselineStats.stopped_count,
            expired_count: baselineStats.expired_count,
            open_count: baselineStats.open_count,
          },
        },
      ]);

    if (insertError) {
      console.error('[BACKTEST] Insert error:', insertError.message);
      // Non-fatal — still return results
    }

    // Delta comparison
    const delta = {
      avg_return: Math.round((week4Stats.avg_return - baselineStats.avg_return) * 100) / 100,
      win_rate: Math.round((week4Stats.win_rate - baselineStats.win_rate) * 100) / 100,
      sharpe_ratio: Math.round((week4Stats.sharpe_ratio - baselineStats.sharpe_ratio) * 100) / 100,
      max_drawdown: Math.round((week4Stats.max_drawdown - baselineStats.max_drawdown) * 100) / 100,
    };

    console.log(`[BACKTEST] ✅ Complete. Week4 avg_return=${week4Stats.avg_return}% vs baseline ${baselineStats.avg_return}%`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabase, {
      function_name: 'backtest-trade-signals',
      status: 'success',
      rows_inserted: 2,
      duration_ms: duration,
      source_used: 'ai_scores',
    });

    return new Response(
      JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        week4: week4Stats,
        baseline: baselineStats,
        delta,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[BACKTEST] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    await logHeartbeat(supabase, {
      function_name: 'backtest-trade-signals',
      status: 'failure',
      duration_ms: duration,
      error_message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
