// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
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
  const slackAlerter = new SlackAlerter();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-CONGRESSIONAL] Starting congressional trades signal generation...');

    const { data: trades, error: tradesError } = await supabaseClient
      .from('congressional_trades')
      .select('*')
      .gte('transaction_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('transaction_date', { ascending: false });

    if (tradesError) throw tradesError;

    console.log(`[SIGNAL-GEN-CONGRESSIONAL] Found ${trades?.length || 0} congressional trades`);

    if (!trades || trades.length === 0) {
      const duration = Date.now() - startTime;
      
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-congressional',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'congressional_trades',
      });
      
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-congressional',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No trades to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(trades.map(t => t.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const trade of trades) {
      const assetId = tickerToAssetId.get(trade.ticker);
      if (!assetId) continue;

      const isBuy = trade.transaction_type?.toLowerCase().includes('purchase') || 
                    trade.transaction_type?.toLowerCase().includes('buy');
      const signalType = isBuy ? 'politician_buy' : 'politician_sell';
      const direction = isBuy ? 'up' : 'down';

      const avgAmount = ((trade.amount_min || 0) + (trade.amount_max || 0)) / 2;

      // Skip trivial trades under $1,000 — noise not signal
      if (avgAmount < 1000) continue;

      const magnitude = Math.min(5, (avgAmount / 100000) * 5); // Normalised to 0-5 scale

      const signalData = {
        ticker: trade.ticker,
        signal_type: signalType,
        transaction_date: trade.transaction_date,
        representative: trade.representative
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: new Date(trade.transaction_date).toISOString(),
        value_text: `${trade.representative} (${trade.party}) - $${avgAmount.toLocaleString()}`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'Congressional Trading Tracker',
          timestamp: new Date().toISOString()
        },
        raw: {
          representative: trade.representative,
          party: trade.party,
          chamber: trade.chamber,
          amount_range: `$${trade.amount_min}-$${trade.amount_max}`,
          filed_date: trade.filed_date
        }
      });
    }

    // Use upsert to avoid duplicate key errors
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (insertError) {
        console.log('[SIGNAL-GEN-CONGRESSIONAL] Batch error (continuing):', insertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    console.log(`[SIGNAL-GEN-CONGRESSIONAL] ✅ Upserted ${insertedCount} politician trading signals (${signals.length - insertedCount} duplicates skipped)`);

    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-congressional',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'congressional_trades',
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-congressional',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: insertedCount,
      rowsSkipped: signals.length - insertedCount,
    });

    return new Response(JSON.stringify({ 
      success: true,
      trades_processed: trades.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-CONGRESSIONAL] ❌ Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-congressional',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-congressional',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
