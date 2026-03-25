import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOMENTUM_SIGNAL_TYPES = ['momentum_breakout', 'momentum_acceleration', 'momentum_continuation'];

async function computeKellySize(supabase: any, sector: string | null, hybridScore: number, confidence: number): Promise<number> {
  // 1. Query model_daily_metrics for the last 30 days
  const { data: metrics } = await supabase
    .from('model_daily_metrics')
    .select('hit_rate, mean_return')
    .order('snapshot_date', { ascending: false })
    .limit(30);

  let kellyFraction: number;

  // 2. Fall back to conservative sizing if insufficient history
  if (!metrics || metrics.length < 10) {
    const baseSize = (hybridScore - 65) / 400 * confidence;
    const minSize = confidence >= 0.80 ? 0.05 : confidence >= 0.65 ? 0.03 : 0.01;
    kellyFraction = Math.min(0.10, Math.max(minSize, baseSize));
  } else {
    const n = metrics.length;
    const rawWinRate = metrics.reduce((s: number, r: any) => s + Number(r.hit_rate), 0) / n;
    const avgReturn = metrics.reduce((s: number, r: any) => s + Number(r.mean_return), 0) / n;

    // Blend win rate with AI confidence score
    const blendedWinRate = (rawWinRate * 0.4) + (confidence * 0.6);

    // Simplified Kelly using edge/odds ratio approach:
    // We know avg return across all trades and win rate.
    // Estimate: avgWin = avgReturn / winRate, avgLoss = avgReturn / (1 - winRate)
    // This gives us a reasonable win/loss split from what we have.
    const estimatedAvgWin = Math.abs(avgReturn) / Math.max(blendedWinRate, 0.01);
    const estimatedAvgLoss = Math.abs(avgReturn) / Math.max(1 - blendedWinRate, 0.01);

    // Kelly: f = (p*b - q*a) / b  where b=avgWin, p=winRate, q=1-winRate, a=avgLoss
    const f = (blendedWinRate * estimatedAvgWin - (1 - blendedWinRate) * estimatedAvgLoss) / estimatedAvgWin;

    // Apply confidence multiplier
    const confidenceMultiplier = Math.max(0.1, confidence);
    kellyFraction = f * confidenceMultiplier;

    if (kellyFraction <= 0) {
      // Floor based on confidence tier rather than flat 1%
      if (confidence >= 0.80) kellyFraction = 0.05;
      else if (confidence >= 0.65) kellyFraction = 0.03;
      else kellyFraction = 0.01;
    } else if (kellyFraction > 0.20) {
      kellyFraction = 0.20;
    } else {
      kellyFraction = kellyFraction * 0.5; // half-Kelly for safety
    }
  }

  // 5. Sector concentration check — reduce by 50% if sector already >= 35% allocated
  if (sector) {
    const { data: sectorAssets } = await supabase
      .from('assets')
      .select('ticker')
      .eq('sector', sector);

    const sectorTickers = (sectorAssets || []).map((a: any) => a.ticker);

    if (sectorTickers.length > 0) {
      const { data: sectorSignals } = await supabase
        .from('trade_signals')
        .select('position_size_pct')
        .eq('status', 'active')
        .in('ticker', sectorTickers);

      const totalSectorExposure = (sectorSignals || []).reduce(
        (sum: number, s: any) => sum + Number(s.position_size_pct ?? 0),
        0,
      );

      if (totalSectorExposure >= 0.35) {
        console.log(`[GENERATE-TRADE-SIGNALS] Sector "${sector}" exposure ${totalSectorExposure.toFixed(3)} >= 0.35 — halving Kelly size`);
        kellyFraction *= 0.5;
      }
    }
  }

  return Math.round(kellyFraction * 10000) / 10000;
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
    console.log('[GENERATE-TRADE-SIGNALS] Starting...');

    // 1. Fetch top 50 candidates by hybrid_score
    const { data: candidates, error: candidatesError } = await supabase
      .from('assets')
      .select('id, ticker, hybrid_score, sector')
      .gt('hybrid_score', 65)
      .order('hybrid_score', { ascending: false })
      .limit(50);

    if (candidatesError) throw candidatesError;
    if (!candidates || candidates.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'generate-trade-signals',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'assets',
      });
      return new Response(
        JSON.stringify({ inserted: 0, skipped_active: 0, skipped_no_condition: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[GENERATE-TRADE-SIGNALS] ${candidates.length} candidates with hybrid_score > 65`);

    const candidateTickers = candidates.map((c) => c.ticker);
    const candidateAssetIds = candidates.map((c) => c.id);

    // 2. Bulk fetch active trade signals — skip tickers already active
    const { data: activeSignals } = await supabase
      .from('trade_signals')
      .select('ticker')
      .eq('status', 'active')
      .in('ticker', candidateTickers);

    const activeTickers = new Set((activeSignals || []).map((s) => s.ticker));
    const eligible = candidates.filter((c) => !activeTickers.has(c.ticker));
    const skippedActive = candidates.length - eligible.length;

    console.log(`[GENERATE-TRADE-SIGNALS] ${skippedActive} skipped (active signal exists), ${eligible.length} eligible`);

    if (eligible.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'generate-trade-signals',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'assets',
      });
      return new Response(
        JSON.stringify({ inserted: 0, skipped_active: skippedActive, skipped_no_condition: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const eligibleIds = eligible.map((c) => c.id);
    const eligibleTickers = eligible.map((c) => c.ticker);

    // 3. Bulk fetch most recent ai_scores for eligible assets
    const { data: aiScoreRows } = await supabase
      .from('ai_scores')
      .select('asset_id, ai_score, confidence, direction, scored_at')
      .in('asset_id', eligibleIds)
      .order('scored_at', { ascending: false });

    // Keep only most recent per asset_id
    const aiScoreMap = new Map<string, { ai_score: number; confidence: number; direction: string }>();
    for (const row of aiScoreRows || []) {
      if (!aiScoreMap.has(row.asset_id)) {
        aiScoreMap.set(row.asset_id, {
          ai_score: Number(row.ai_score),
          confidence: Number(row.confidence),
          direction: String(row.direction),
        });
      }
    }

    // 4. Bulk fetch momentum signals in last 7 days for eligible assets
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: momentumSignals } = await supabase
      .from('signals')
      .select('asset_id')
      .in('asset_id', eligibleIds)
      .in('signal_type', MOMENTUM_SIGNAL_TYPES)
      .eq('direction', 'up')
      .gte('observed_at', sevenDaysAgo);

    const momentumAssetIds = new Set((momentumSignals || []).map((s) => s.asset_id));

    // 5. Bulk fetch latest prices for eligible tickers
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: priceRows } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', eligibleTickers)
      .gte('date', thirtyDaysAgo)
      .order('ticker')
      .order('date', { ascending: false });

    // Keep most recent close per ticker
    const latestPriceMap = new Map<string, number>();
    for (const row of priceRows || []) {
      if (!latestPriceMap.has(row.ticker)) {
        latestPriceMap.set(row.ticker, Number(row.close));
      }
    }

    // 6. Evaluate entry conditions and build insert rows
    const toInsert: any[] = [];
    let skippedNoCondition = 0;

    for (const asset of eligible) {
      const aiScore = aiScoreMap.get(asset.id);
      const hasMomentum = momentumAssetIds.has(asset.id);
      const entryPrice = latestPriceMap.get(asset.ticker);

      // Entry condition
      if (
        !aiScore ||
        aiScore.ai_score <= 60 ||
        aiScore.direction !== 'up' ||
        !hasMomentum ||
        entryPrice == null
      ) {
        skippedNoCondition++;
        continue;
      }

      const positionSizePct = await computeKellySize(supabase, (asset as any).sector ?? null, Number(asset.hybrid_score), aiScore.confidence);
      console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: confidence=${aiScore.confidence}, kelly=${positionSizePct}`);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      toInsert.push({
        ticker: asset.ticker,
        asset_id: asset.id,
        signal_type: 'entry',
        status: 'active',
        entry_price: entryPrice,
        exit_target: Math.round(entryPrice * 1.15 * 100) / 100,
        stop_loss: Math.round(entryPrice * 0.90 * 100) / 100,
        peak_price: entryPrice,
        position_size_pct: positionSizePct,
        expires_at: expiresAt,
      });
    }

    console.log(`[GENERATE-TRADE-SIGNALS] ${toInsert.length} signals to insert, ${skippedNoCondition} skipped (no condition met)`);

    // 7. Insert new trade signals
    let inserted = 0;
    if (toInsert.length > 0) {
      const { data: insertedRows, error: insertError } = await supabase
        .from('trade_signals')
        .insert(toInsert)
        .select('id');

      if (insertError) {
        console.error('[GENERATE-TRADE-SIGNALS] Insert error:', insertError.message);
        throw insertError;
      }
      inserted = insertedRows?.length ?? 0;
    }

    console.log(`[GENERATE-TRADE-SIGNALS] ✅ Inserted ${inserted} trade signals`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabase, {
      function_name: 'generate-trade-signals',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skippedActive + skippedNoCondition,
      duration_ms: duration,
      source_used: 'assets',
    });

    return new Response(
      JSON.stringify({ inserted, skipped_active: skippedActive, skipped_no_condition: skippedNoCondition }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[GENERATE-TRADE-SIGNALS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    await logHeartbeat(supabase, {
      function_name: 'generate-trade-signals',
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
