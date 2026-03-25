import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { fireAiScoring } from "../_shared/fire-ai-scoring.ts";

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
    console.log('[SIGNAL-GEN-FUNDAMENTALS] Starting fundamentals signal generation...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: fundamentals, error: fundError } = await supabase
      .from('company_fundamentals')
      .select('*')
      .gte('fetched_at', thirtyDaysAgo);

    if (fundError) throw fundError;

    console.log(`[SIGNAL-GEN-FUNDAMENTALS] Found ${fundamentals?.length || 0} fundamental records`);

    if (!fundamentals || fundamentals.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'generate-signals-from-fundamentals',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'company_fundamentals',
      });
      return new Response(
        JSON.stringify({ message: 'No fundamentals data to process', signals_created: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tickers = [...new Set(fundamentals.map((f) => f.ticker))];
    const { data: assets } = await supabase
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map((a) => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map((a) => [a.id, a.ticker]) || []);

    const signals: any[] = [];
    // Use fetched_at date as checksum bucket so signals refresh daily but don't spam
    const today = new Date().toISOString().split('T')[0];

    for (const fund of fundamentals) {
      const assetId = fund.asset_id ?? tickerToAssetId.get(fund.ticker);
      if (!assetId) {
        console.warn(`[SIGNAL-GEN-FUNDAMENTALS] No asset_id for ${fund.ticker} — skipping`);
        continue;
      }

      const netMargin = fund.net_margin != null ? Number(fund.net_margin) : null;
      const roe = fund.roe != null ? Number(fund.roe) : null;
      const revenueGrowthYoy = fund.revenue_growth_yoy != null ? Number(fund.revenue_growth_yoy) : null;
      const epsGrowth5Y = fund.eps_growth_5y != null ? Number(fund.eps_growth_5y) : null;
      const observedAt = fund.fetched_at;

      // --- High profitability: netMargin > 15% AND roe > 15% ---
      if (netMargin != null && roe != null && netMargin > 15 && roe > 15) {
        const magnitude = Math.min(1, (netMargin / 100 + roe / 100) / 2);
        signals.push({
          asset_id: assetId,
          signal_type: 'profitability_strong',
          direction: 'up',
          magnitude,
          observed_at: observedAt,
          value_text: `Strong profitability: net margin ${netMargin.toFixed(1)}%, ROE ${roe.toFixed(1)}%`,
          checksum: JSON.stringify({ ticker: fund.ticker, signal_type: 'profitability_strong', date: today }),
          citation: { source: 'Finnhub Fundamentals', timestamp: new Date().toISOString() },
          raw: { net_margin: netMargin, roe, ticker: fund.ticker },
        });
      }

      // --- Poor fundamentals: netMargin < 0 AND roe < 0 ---
      if (netMargin != null && roe != null && netMargin < 0 && roe < 0) {
        signals.push({
          asset_id: assetId,
          signal_type: 'profitability_weak',
          direction: 'down',
          magnitude: 0.5,
          observed_at: observedAt,
          value_text: `Weak profitability: net margin ${netMargin.toFixed(1)}%, ROE ${roe.toFixed(1)}%`,
          checksum: JSON.stringify({ ticker: fund.ticker, signal_type: 'profitability_weak', date: today }),
          citation: { source: 'Finnhub Fundamentals', timestamp: new Date().toISOString() },
          raw: { net_margin: netMargin, roe, ticker: fund.ticker },
        });
      }

      // --- Revenue growth: revenueGrowthTTMYoy > 10% ---
      if (revenueGrowthYoy != null && revenueGrowthYoy > 10) {
        const magnitude = Math.min(1, revenueGrowthYoy / 50);
        signals.push({
          asset_id: assetId,
          signal_type: 'revenue_growth',
          direction: 'up',
          magnitude,
          observed_at: observedAt,
          value_text: `Revenue growth YoY: +${revenueGrowthYoy.toFixed(1)}%`,
          checksum: JSON.stringify({ ticker: fund.ticker, signal_type: 'revenue_growth', date: today }),
          citation: { source: 'Finnhub Fundamentals', timestamp: new Date().toISOString() },
          raw: { revenue_growth_yoy: revenueGrowthYoy, ticker: fund.ticker },
        });
      }

      // --- Earnings growth: epsGrowth5Y > 10% ---
      if (epsGrowth5Y != null && epsGrowth5Y > 10) {
        const magnitude = Math.min(1, epsGrowth5Y / 50);
        signals.push({
          asset_id: assetId,
          signal_type: 'eps_growth',
          direction: 'up',
          magnitude,
          observed_at: observedAt,
          value_text: `EPS 5-year growth: +${epsGrowth5Y.toFixed(1)}%`,
          checksum: JSON.stringify({ ticker: fund.ticker, signal_type: 'eps_growth', date: today }),
          citation: { source: 'Finnhub Fundamentals', timestamp: new Date().toISOString() },
          raw: { eps_growth_5y: epsGrowth5Y, ticker: fund.ticker },
        });
      }
    }

    let insertedCount = 0;
    const batchSize = 100;

    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: upsertError } = await supabase
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');

      if (upsertError) {
        console.error('[SIGNAL-GEN-FUNDAMENTALS] Batch upsert error:', upsertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    console.log(`[SIGNAL-GEN-FUNDAMENTALS] ✅ Upserted ${insertedCount} signals from ${fundamentals.length} fundamental records`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t)),
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'generate-signals-from-fundamentals',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'company_fundamentals',
    });

    return new Response(
      JSON.stringify({
        success: true,
        fundamentals_processed: fundamentals.length,
        signals_generated: signals.length,
        signals_inserted: insertedCount,
        duplicates_skipped: signals.length - insertedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[SIGNAL-GEN-FUNDAMENTALS] ❌ Error:', error);
    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'generate-signals-from-fundamentals',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
