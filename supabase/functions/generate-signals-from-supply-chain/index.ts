import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    console.log('[SIGNAL-GEN-SUPPLY] Starting supply chain signal generation...');
    const { data: supplyChain, error: supplyError } = await supabaseClient.from('supply_chain_signals').select('*').gte('report_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()).order('report_date', { ascending: false });
    if (supplyError) throw supplyError;
    console.log(`[SIGNAL-GEN-SUPPLY] Found ${supplyChain?.length || 0} supply chain records`);
    if (!supplyChain || supplyChain.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-supply-chain', status: 'success', rows_inserted: 0, duration_ms: duration, source_used: 'supply_chain_signals' });
      return new Response(JSON.stringify({ message: 'No supply chain data to process', signals_created: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const tickers = [...new Set(supplyChain.map(s => s.ticker))];
    const { data: assets } = await supabaseClient.from('assets').select('id, ticker').in('ticker', tickers);
    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const signals = [];
    for (const supply of supplyChain) {
      const assetId = tickerToAssetId.get(supply.ticker);
      if (!assetId) continue;
      const changePct = supply.change_percentage || 0;
      const direction = changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(changePct) / 100);
      const signalData = { ticker: supply.ticker, signal_type: 'supply_chain_indicator', report_date: supply.report_date, change_percentage: changePct };
      signals.push({ asset_id: assetId, signal_type: 'supply_chain_indicator', direction, magnitude, observed_at: new Date(supply.report_date).toISOString(), value_text: `${supply.signal_type}: ${supply.metric_name} ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%`, checksum: JSON.stringify(signalData), citation: { source: 'Supply Chain Intelligence', timestamp: new Date().toISOString() }, raw: { signal_type: supply.signal_type, metric_name: supply.metric_name, metric_value: supply.metric_value, change_percentage: changePct, indicator: supply.indicator } });
    }
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient.from('signals').upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true }).select('id');
      if (!insertError) insertedCount += data?.length || 0;
    }
    console.log(`[SIGNAL-GEN-SUPPLY] ✅ Upserted ${insertedCount} supply chain signals`);
    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-supply-chain', status: 'success', rows_inserted: insertedCount, rows_skipped: signals.length - insertedCount, duration_ms: duration, source_used: 'supply_chain_signals' });
    return new Response(JSON.stringify({ success: true, records_processed: supplyChain.length, signals_created: insertedCount, duplicates_skipped: signals.length - insertedCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[SIGNAL-GEN-SUPPLY] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-supply-chain', status: 'failure', duration_ms: duration, error_message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
