import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { getTwelveDataPrice } from "../_shared/twelvedata.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exit decisions use the TwelveData /price real-time quote where available, falling
// back to the latest DB daily close only if TwelveData returns null. DB closes alone
// miss intraday stop/target breaches — a stock can blow through a stop at 10am and
// we wouldn't know until the next day's close lands in the prices table.
//
// NOTE: price extraction from Tavily article text was removed permanently after it
// produced catastrophic false exits (ARYD $1.55 vs $10.54 entry, AGEN $4.54 vs
// $29.86). Tavily is never used for price decisions.
//
// Rate: TwelveData plan is 55 credits/minute (per ingest-prices-twelvedata comment).
// Max 5 active signals per run × every 5min = ~1 call/min average — well under the
// limit, so we call for every active signal unconditionally.

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

    // Fetch real-time prices in parallel for all active tickers. With max 5 signals
    // this is at most 5 concurrent requests and well under the 55/min TwelveData cap.
    const livePriceEntries = await Promise.all(
      activeTickers.map(async (t) => [t, await getTwelveDataPrice(t)] as const)
    );
    const livePriceMap = new Map<string, number | null>(livePriceEntries);
    const tdSucceeded = livePriceEntries.filter(([, p]) => p != null).length;
    console.log(`[CHECK-TRADE-EXITS] TwelveData live: ${tdSucceeded}/${activeTickers.length} tickers resolved`);

    const now = new Date();
    const nowIso = now.toISOString();
    type PriceStamp = { last_live_price: number | null; last_live_price_at: string; last_live_price_source: 'live' | 'db' | 'none' };
    const peakUpdates: { id: string; peak_price: number; stamp: PriceStamp }[] = [];
    const exitUpdates: { id: string; status: string; exit_price: number; exit_date: string; pnl_pct: number; peak_price?: number; stamp: PriceStamp }[] = [];
    const priceUpdates: { id: string; stamp: PriceStamp }[] = [];

    let stopped = 0;
    let triggered = 0;
    let expired = 0;
    let skippedNoPrice = 0;
    let usedLive = 0;
    let usedDb = 0;

    for (const signal of activeSignals) {
      const livePrice = livePriceMap.get(signal.ticker) ?? null;
      const dbPrice = latestPriceMap.get(signal.ticker);
      // Prefer live (intraday). Fall back to DB close only when TwelveData returned
      // null (rate limit / network / delisted / unsupported symbol).
      let currentPrice: number | null;
      let priceSource: 'live' | 'db' | 'none';
      if (livePrice != null) {
        currentPrice = livePrice;
        priceSource = 'live';
        usedLive++;
      } else if (dbPrice != null) {
        currentPrice = dbPrice;
        priceSource = 'db';
        usedDb++;
      } else {
        currentPrice = null;
        priceSource = 'none';
      }

      // Price stamp written to the row every run (even when no exit fires) so the
      // frontend's "Live P&L" column can use a fresh price.
      const stamp: PriceStamp = {
        last_live_price: currentPrice,
        last_live_price_at: nowIso,
        last_live_price_source: priceSource,
      };

      const entryPrice = Number(signal.entry_price);
      const exitTarget = Number(signal.exit_target);
      const stopLoss = Number(signal.stop_loss);
      const peakPrice = Number(signal.peak_price);
      const expiresAt = new Date(signal.expires_at);
      const pastExpiry = now >= expiresAt;

      if (currentPrice == null) {
        // No live and no DB price. If the signal is past its 7-day expiry, force-close
        // at entry (pnl 0%) so nothing hangs forever. Otherwise skip until next run.
        if (pastExpiry) {
          console.log(`[CHECK-TRADE-EXITS] ${signal.ticker}: force-expire — past expiry with no live or DB price`);
          exitUpdates.push({
            id: signal.id,
            status: 'expired',
            exit_price: entryPrice,
            exit_date: nowIso,
            pnl_pct: 0,
            peak_price: peakPrice,
            stamp,
          });
          expired++;
        } else {
          console.warn(`[CHECK-TRADE-EXITS] ${signal.ticker}: no price (live or DB) — stamping 'none' and skipping exit checks`);
          priceUpdates.push({ id: signal.id, stamp });
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
          exit_date: nowIso,
          pnl_pct: pnlPct,
          peak_price: newPeak,
          stamp,
        });
        console.log(`[CHECK-TRADE-EXITS] ${signal.ticker}: ${newStatus} @ ${currentPrice} [${priceSource}] (pnl ${pnlPct > 0 ? '+' : ''}${pnlPct}%)`);
      } else if (newPeak > peakPrice) {
        peakUpdates.push({ id: signal.id, peak_price: newPeak, stamp });
      } else {
        // Still active, no peak move — just refresh the live-price stamp.
        priceUpdates.push({ id: signal.id, stamp });
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
              ...u.stamp,
            })
            .eq('id', u.id)
        ),
      );
    }

    if (priceUpdates.length > 0) {
      await Promise.allSettled(
        priceUpdates.map((u) =>
          supabase
            .from('trade_signals')
            .update({ ...u.stamp })
            .eq('id', u.id)
        ),
      );
    }

    if (peakUpdates.length > 0) {
      await Promise.allSettled(
        peakUpdates.map((u) =>
          supabase
            .from('trade_signals')
            .update({ peak_price: u.peak_price, ...u.stamp })
            .eq('id', u.id)
        ),
      );
    }

    const checked = activeSignals.length;
    console.log(`[CHECK-TRADE-EXITS] ✅ Checked ${checked}: ${stopped} stopped, ${triggered} triggered, ${expired} expired, ${skippedNoPrice} skipped | price source: ${usedLive} live / ${usedDb} db`);

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
        price_source_live: usedLive,
        price_source_db: usedDb,
        twelvedata_calls: activeTickers.length,
      },
    });

    return new Response(
      JSON.stringify({ checked, stopped, triggered, expired, skipped_no_price: skippedNoPrice, price_source_live: usedLive, price_source_db: usedDb }),
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
