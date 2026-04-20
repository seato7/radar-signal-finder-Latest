import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// DB prices are the ONLY source of truth for exit decisions. The prior Tavily
// price-verification path was removed after extracting wrong prices from unrelated
// article context caused catastrophic false exits (ARYD closed at $1.55 vs $10.54
// entry, AGEN at $4.54 vs $29.86). News-article price scraping is not reliable
// enough to base exits on.

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

    const latestPriceMap = new Map<string, number>();
    for (const row of priceRows || []) {
      if (!latestPriceMap.has(row.ticker)) {
        latestPriceMap.set(row.ticker, Number(row.close));
      }
    }

    const now = new Date();
    const peakUpdates: { id: string; peak_price: number }[] = [];
    const exitUpdates: { id: string; status: string; exit_price: number; exit_date: string; pnl_pct: number; peak_price?: number }[] = [];

    let stopped = 0;
    let triggered = 0;
    let expired = 0;
    let skippedNoPrice = 0;

    for (const signal of activeSignals) {
      const currentPrice = latestPriceMap.get(signal.ticker);
      const entryPrice = Number(signal.entry_price);
      const exitTarget = Number(signal.exit_target);
      const stopLoss = Number(signal.stop_loss);
      const peakPrice = Number(signal.peak_price);
      const expiresAt = new Date(signal.expires_at);
      const pastExpiry = now >= expiresAt;

      if (currentPrice == null) {
        // No DB price. If the signal is past its 7-day expiry, force-close at entry
        // (pnl 0%) so nothing hangs forever. Otherwise skip and wait for price data.
        if (pastExpiry) {
          console.log(`[CHECK-TRADE-EXITS] ${signal.ticker}: force-expire — past expiry with no DB price`);
          exitUpdates.push({
            id: signal.id,
            status: 'expired',
            exit_price: entryPrice,
            exit_date: now.toISOString(),
            pnl_pct: 0,
            peak_price: peakPrice,
          });
          expired++;
        } else {
          console.warn(`[CHECK-TRADE-EXITS] ${signal.ticker}: no DB price — skipping until next run`);
          skippedNoPrice++;
        }
        continue;
      }

      const newPeak = currentPrice > peakPrice ? currentPrice : peakPrice;
      let newStatus: string | null = null;

      if (currentPrice <= stopLoss) {
        newStatus = 'stopped';
        stopped++;
      } else if (currentPrice < newPeak * 0.95) {
        newStatus = 'stopped';
        stopped++;
      } else if (currentPrice >= exitTarget) {
        newStatus = 'triggered';
        triggered++;
      } else if (pastExpiry) {
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
        peakUpdates.push({ id: signal.id, peak_price: newPeak });
      }
    }

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
    console.log(`[CHECK-TRADE-EXITS] ✅ Checked ${checked}: ${stopped} stopped, ${triggered} triggered, ${expired} expired, ${skippedNoPrice} skipped (no price)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabase, {
      function_name: 'check-trade-exits',
      status: 'success',
      rows_inserted: exitUpdates.length,
      rows_skipped: checked - exitUpdates.length,
      duration_ms: duration,
      source_used: 'trade_signals',
      metadata: {
        stopped,
        triggered,
        expired,
        skipped_no_price: skippedNoPrice,
      },
    });

    return new Response(
      JSON.stringify({ checked, stopped, triggered, expired, skipped_no_price: skippedNoPrice }),
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
