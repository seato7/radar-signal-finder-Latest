import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TAVILY_DAILY_CAP = 200;

function extractPriceFromText(text: string): number | null {
  const patterns = [
    /\$\s*([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/g,
    /trading at\s+\$?([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/gi,
    /price of\s+\$?([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/gi,
    /priced at\s+\$?([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/gi,
  ];

  const candidates: number[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (val >= 0.50 && val <= 100000) candidates.push(val);
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  candidates.sort((a, b) => a - b);
  return candidates[Math.floor(candidates.length / 2)];
}

async function fetchTavilyPrice(ticker: string): Promise<number | null> {
  const apiKey = Deno.env.get('TAVILY_API_KEY');
  if (!apiKey) return null;

  try {
    const year = new Date().getFullYear();
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${ticker} stock price today ${year}`,
        max_results: 3,
      }),
    });

    if (!response.ok) {
      console.warn(`[CHECK-TRADE-EXITS] Tavily ${ticker}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const results: Array<{ title: string; content: string }> = data.results ?? [];

    for (const result of results) {
      const price = extractPriceFromText(`${result.title} ${result.content}`);
      if (price != null) {
        console.log(`[CHECK-TRADE-EXITS] Tavily ${ticker}: $${price}`);
        return price;
      }
    }
    return null;
  } catch (err) {
    console.warn(`[CHECK-TRADE-EXITS] Tavily ${ticker} fetch failed:`, err);
    return null;
  }
}

// Pull the running Tavily call count from the last 24h of heartbeats so the cap resets
// on a rolling basis regardless of which invocation made the calls.
async function getTavilyCallsUsedToday(supabase: any): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('function_status')
    .select('metadata')
    .eq('function_name', 'check-trade-exits')
    .gte('executed_at', oneDayAgo);

  let total = 0;
  for (const row of data || []) {
    const n = Number(row?.metadata?.tavily_calls_used ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

// Would any of the exit conditions plausibly trigger given the DB price?
// Signals near a boundary or past expiry get priority for Tavily verification.
function needsTavilyVerification(
  dbPrice: number | null,
  signal: { entry_price: number; exit_target: number; stop_loss: number; peak_price: number; expires_at: string },
  now: Date,
): boolean {
  if (new Date(signal.expires_at) <= now) return true;
  if (dbPrice == null) return true;

  const stopLoss = Number(signal.stop_loss);
  const exitTarget = Number(signal.exit_target);
  const peak = Number(signal.peak_price);
  const trail = peak * 0.95;

  // Within 3% of any boundary
  if (dbPrice <= stopLoss * 1.03) return true;
  if (dbPrice >= exitTarget * 0.97) return true;
  if (dbPrice <= trail * 1.03) return true;
  return false;
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

    // Bulk fetch DB prices
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

    // Rolling 24h Tavily call count — cap remaining budget so we don't blow past 200/day.
    const tavilyUsedToday = await getTavilyCallsUsedToday(supabase);
    let tavilyRemaining = Math.max(0, TAVILY_DAILY_CAP - tavilyUsedToday);
    let tavilyCallsUsed = 0;
    console.log(`[CHECK-TRADE-EXITS] Tavily budget: ${tavilyUsedToday}/${TAVILY_DAILY_CAP} used in last 24h, ${tavilyRemaining} remaining`);

    const now = new Date();
    const peakUpdates: { id: string; peak_price: number }[] = [];
    const exitUpdates: { id: string; status: string; exit_price: number; exit_date: string; pnl_pct: number; peak_price?: number }[] = [];

    let stopped = 0;
    let triggered = 0;
    let expired = 0;
    let skippedNoPrice = 0;

    for (const signal of activeSignals) {
      const dbPrice = latestPriceMap.get(signal.ticker) ?? null;
      const entryPrice = Number(signal.entry_price);
      const exitTarget = Number(signal.exit_target);
      const stopLoss = Number(signal.stop_loss);
      const peakPrice = Number(signal.peak_price);
      const expiresAt = new Date(signal.expires_at);
      const pastExpiry = now >= expiresAt;

      // Pull a Tavily price when we're near a boundary, past expiry, or DB is missing,
      // subject to the daily cap.
      let tavilyPrice: number | null = null;
      if (tavilyRemaining > 0 && needsTavilyVerification(dbPrice, signal, now)) {
        tavilyPrice = await fetchTavilyPrice(signal.ticker);
        tavilyCallsUsed++;
        tavilyRemaining--;
      }

      // Resolve the price to use for exit evaluation:
      //  - Both present and agree within 5% → trust DB (stable, batched)
      //  - Both present but diverge > 5% → use the more conservative for the direction:
      //    for a long signal, lower price is more conservative re: stops
      //  - Only one present → use it
      //  - Neither present → null (handled below for force-expire)
      let currentPrice: number | null = null;
      let priceSource = 'none';
      if (dbPrice != null && tavilyPrice != null) {
        const diffPct = Math.abs(tavilyPrice - dbPrice) / dbPrice;
        if (diffPct <= 0.05) {
          currentPrice = dbPrice;
          priceSource = 'db_agree';
        } else {
          currentPrice = Math.min(dbPrice, tavilyPrice);
          priceSource = 'divergent_conservative';
          console.log(`[CHECK-TRADE-EXITS] ${signal.ticker}: DB $${dbPrice} vs Tavily $${tavilyPrice} diverge ${(diffPct * 100).toFixed(1)}% — using $${currentPrice}`);
        }
      } else if (dbPrice != null) {
        currentPrice = dbPrice;
        priceSource = 'db_only';
      } else if (tavilyPrice != null) {
        currentPrice = tavilyPrice;
        priceSource = 'tavily_only';
      }

      if (currentPrice == null) {
        // No price anywhere. If the signal is past its 7-day expiry, force-close at
        // entry_price (pnl = 0) rather than let it accumulate forever. If still within
        // expiry window, skip and wait for price data.
        if (pastExpiry) {
          console.log(`[CHECK-TRADE-EXITS] ${signal.ticker}: force-expire — past expiry with no price available`);
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
          console.warn(`[CHECK-TRADE-EXITS] ${signal.ticker}: no price (DB or Tavily) — skipping until next run`);
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
        // Past expiry: close regardless of direction. Winners realize their gain; losers
        // crystallize. The prior "only expire if underwater" rule let winners balloon
        // indefinitely with no exit ever firing, which is the bug we're fixing.
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
        console.log(`[CHECK-TRADE-EXITS] ${signal.ticker}: ${newStatus} @ ${currentPrice} (${priceSource}, pnl ${pnlPct > 0 ? '+' : ''}${pnlPct}%)`);
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
    console.log(`[CHECK-TRADE-EXITS] ✅ Checked ${checked}: ${stopped} stopped, ${triggered} triggered, ${expired} expired, ${skippedNoPrice} skipped (no price), ${tavilyCallsUsed} Tavily calls`);

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
        tavily_calls_used: tavilyCallsUsed,
        tavily_budget_remaining: tavilyRemaining,
      },
    });

    return new Response(
      JSON.stringify({ checked, stopped, triggered, expired, skipped_no_price: skippedNoPrice, tavily_calls_used: tavilyCallsUsed }),
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
