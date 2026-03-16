import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-SHORT] Starting short interest signal generation...');

    const { data: shortData, error: shortError } = await supabaseClient
      .from('short_interest')
      .select('*')
      .gte('report_date', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
      .order('report_date', { ascending: false });

    if (shortError) throw shortError;

    console.log(`[SIGNAL-GEN-SHORT] Found ${shortData?.length || 0} short interest records`);

    if (!shortData || shortData.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-short-interest', status: 'success', rows_inserted: 0, duration_ms: duration, source_used: 'short_interest' });
      return new Response(JSON.stringify({ message: 'No short interest data to process', signals_created: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const tickers = [...new Set(shortData.map(s => s.ticker))];
    const { data: assets } = await supabaseClient.from('assets').select('id, ticker').in('ticker', tickers);
    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const short of shortData) {
      const assetId = tickerToAssetId.get(short.ticker);
      if (!assetId) continue;
      const floatPct = short.float_percentage || 0;
      const daysToCover = short.days_to_cover || 0;
      const squeezePotential = floatPct > 20 && daysToCover > 5;
      // FIX: High short interest = bearish pressure (not up), unless squeeze potential triggers reversal
      // squeeze_potential → contrarian up signal (short squeeze); otherwise high short = 'down' pressure
      const direction = squeezePotential ? 'up' : floatPct > 30 ? 'down' : 'neutral';
      // FIX: Normalise to 0-5 scale (was 0-1)
      const magnitude = Math.min(5, (floatPct / 100 + daysToCover / 10) * 5); // Normalised to 0-5 scale
      const signalData = { ticker: short.ticker, signal_type: 'short_interest', report_date: short.report_date, float_percentage: floatPct };
      signals.push({ asset_id: assetId, signal_type: 'short_interest', direction, magnitude, observed_at: new Date(short.report_date).toISOString(), value_text: `Short interest: ${floatPct.toFixed(1)}% of float, ${daysToCover.toFixed(1)} days to cover${squeezePotential ? ' (SQUEEZE RISK)' : ''}`, checksum: JSON.stringify(signalData), citation: { source: 'Short Interest Data', timestamp: new Date().toISOString() }, raw: { short_volume: short.short_volume, float_percentage: floatPct, days_to_cover: daysToCover, squeeze_potential: squeezePotential } });
    }

    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient.from('signals').upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true }).select('id');
      if (!insertError) insertedCount += data?.length || 0;
    }

    console.log(`[SIGNAL-GEN-SHORT] ✅ Upserted ${insertedCount} short interest signals`);
    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-short-interest', status: 'success', rows_inserted: insertedCount, rows_skipped: signals.length - insertedCount, duration_ms: duration, source_used: 'short_interest' });

    return new Response(JSON.stringify({ success: true, records_processed: shortData.length, signals_created: insertedCount, duplicates_skipped: signals.length - insertedCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[SIGNAL-GEN-SHORT] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-short-interest', status: 'failure', duration_ms: duration, error_message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
