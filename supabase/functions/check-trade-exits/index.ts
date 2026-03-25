import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    console.log('[CHECK-TRADE-EXITS] Starting...');

    // 1. Fetch all active trade signals
    const { data: activeSignals, error: signalsError } = await supabase
      .from('trade_signals')
      .select('id, ticker, entry_price, exit_target, stop_loss, peak_price, expires_at')
      .eq('status', 'active');

    if (signalsError) throw signalsError;
    if (!activeSignals || activeSignals.length === 0) {
      console.log('[CHECK-TRADE-EXITS] No active trade signals');
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'check-trade-exits',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'trade_signals',
      });
      return new Response(
        JSON.stringify({ checked: 0, stopped: 0, triggered: 0, expired: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[CHECK-TRADE-EXITS] Checking ${activeSignals.length} active signals`);

    const activeTickers = [...new Set(activeSignals.map((s) => s.ticker))];

    // 2. Bulk fetch latest prices for all active tickers
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: priceRows, error: priceError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', activeTickers)
      .gte('date', thirtyDaysAgo)
      .order('ticker')
      .order('date', { ascending: false });

    if (priceError) {
      console.error('[CHECK-TRADE-EXITS] Price fetch error:', priceError.message);
      throw priceError;
    }

    // Keep most recent close per ticker
    const latestPriceMap = new Map<string, number>();
    for (const row of priceRows || []) {
      if (!latestPriceMap.has(row.ticker)) {
        latestPriceMap.set(row.ticker, Number(row.close));
      }
    }

    // 3. Evaluate each signal
    const now = new Date();
    const peakUpdates: { id: string; peak_price: number }[] = [];
    const exitUpdates: { id: string; status: string; exit_price: number; exit_date: string; pnl_pct: number; peak_price?: number }[] = [];

    let stopped = 0;
    let triggered = 0;
    let expired = 0;

    for (const signal of activeSignals) {
      const currentPrice = latestPriceMap.get(signal.ticker);
      if (currentPrice == null) {
        console.warn(`[CHECK-TRADE-EXITS] No price found for ${signal.ticker} — skipping`);
        continue;
      }

      const entryPrice = Number(signal.entry_price);
      const exitTarget = Number(signal.exit_target);
      const stopLoss = Number(signal.stop_loss);
      const peakPrice = Number(signal.peak_price);
      const expiresAt = new Date(signal.expires_at);

      // Track updated peak — may apply even if also exiting
      const newPeak = currentPrice > peakPrice ? currentPrice : peakPrice;

      // Check exit conditions in priority order
      let newStatus: string | null = null;

      if (currentPrice <= stopLoss) {
        // a. Hard stop
        newStatus = 'stopped';
        stopped++;
      } else if (currentPrice < newPeak * 0.95) {
        // b. Trailing stop (5% drawdown from peak)
        newStatus = 'stopped';
        stopped++;
      } else if (currentPrice >= exitTarget) {
        // c. Target hit
        newStatus = 'triggered';
        triggered++;
      } else if (now >= expiresAt && currentPrice <= entryPrice) {
        // d. Time exit — only if price hasn't risen above entry
        newStatus = 'expired';
        expired++;
      }

      if (newStatus) {
        const pnlPct = Math.round(((currentPrice - entryPrice) / entryPrice) * 10000) / 100;
        exitUpdates.push({
          id: signal.id,
          status: newStatus,
          exit_price: currentPrice,
          exit_date: now.toISOString(),
          pnl_pct: pnlPct,
          peak_price: newPeak,
        });
        console.log(`[CHECK-TRADE-EXITS] ${signal.ticker}: ${newStatus} @ ${currentPrice} (pnl ${pnlPct > 0 ? '+' : ''}${pnlPct}%)`);
      } else if (newPeak > peakPrice) {
        // Peak moved up but no exit — record updated peak only
        peakUpdates.push({ id: signal.id, peak_price: newPeak });
      }
    }

    // 4. Apply exit updates (status changes)
    if (exitUpdates.length > 0) {
      await Promise.allSettled(
        exitUpdates.map((u) =>
          supabase
            .from('trade_signals')
            .update({
              status: u.status,
              exit_price: u.exit_price,
              exit_date: u.exit_date,
              pnl_pct: u.pnl_pct,
              peak_price: u.peak_price,
            })
            .eq('id', u.id)
        ),
      );
    }

    // 5. Apply peak-only updates (no status change)
    if (peakUpdates.length > 0) {
      await Promise.allSettled(
        peakUpdates.map((u) =>
          supabase
            .from('trade_signals')
            .update({ peak_price: u.peak_price })
            .eq('id', u.id)
        ),
      );
    }

    const checked = activeSignals.length;
    console.log(`[CHECK-TRADE-EXITS] ✅ Checked ${checked}: ${stopped} stopped, ${triggered} triggered, ${expired} expired`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabase, {
      function_name: 'check-trade-exits',
      status: 'success',
      rows_inserted: exitUpdates.length,
      rows_skipped: checked - exitUpdates.length,
      duration_ms: duration,
      source_used: 'trade_signals',
    });

    return new Response(
      JSON.stringify({ checked, stopped, triggered, expired }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[CHECK-TRADE-EXITS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    await logHeartbeat(supabase, {
      function_name: 'check-trade-exits',
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
