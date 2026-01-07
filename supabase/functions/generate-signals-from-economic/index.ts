import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map indicator types to affected asset classes
const INDICATOR_IMPACT: Record<string, { assets: string[], multiplier: number }> = {
  'GDP': { assets: ['SPY', 'QQQ', 'DIA', 'IWM'], multiplier: 1.5 },
  'CPI': { assets: ['TLT', 'GLD', 'SPY', 'TIPS'], multiplier: 1.3 },
  'Unemployment': { assets: ['SPY', 'XLF', 'XLY'], multiplier: 1.2 },
  'Interest Rate': { assets: ['TLT', 'XLF', 'REIT'], multiplier: 1.8 },
  'Retail Sales': { assets: ['XLY', 'XRT', 'AMZN'], multiplier: 1.0 },
  'Manufacturing PMI': { assets: ['XLI', 'CAT', 'DE'], multiplier: 1.1 },
  'Housing Starts': { assets: ['XHB', 'HD', 'LOW'], multiplier: 1.0 },
  'Consumer Confidence': { assets: ['XLY', 'SPY'], multiplier: 0.9 },
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

    console.log('[SIGNAL-GEN-ECONOMIC] Starting economic indicator signal generation...');

    // Fetch economic indicators
    const { data: indicators, error: indError } = await supabaseClient
      .from('economic_indicators')
      .select('*')
      .gte('release_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('release_date', { ascending: false })
      .limit(500);

    if (indError) throw indError;

    console.log(`[SIGNAL-GEN-ECONOMIC] Found ${indicators?.length || 0} economic indicators`);

    if (!indicators || indicators.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-economic',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'economic_indicators',
      });
      return new Response(JSON.stringify({ message: 'No economic indicators to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get all relevant tickers
    const allTickers = new Set<string>();
    Object.values(INDICATOR_IMPACT).forEach(impact => impact.assets.forEach(t => allTickers.add(t)));

    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', Array.from(allTickers));

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const ind of indicators) {
      const indicatorType = ind.indicator_type || '';
      const actual = ind.value;
      const forecast = ind.forecast_value;
      const previous = ind.previous_value;
      const impact = ind.impact?.toLowerCase() || '';

      // Calculate surprise
      let surprise = 0;
      if (forecast !== null && forecast !== undefined && actual !== null) {
        surprise = actual - forecast;
      } else if (previous !== null && previous !== undefined && actual !== null) {
        surprise = actual - previous;
      }

      // Determine direction based on impact and surprise
      let direction = 'neutral';
      let baseMultiplier = 1;

      if (impact === 'positive' || surprise > 0) {
        direction = 'up';
      } else if (impact === 'negative' || surprise < 0) {
        direction = 'down';
      }

      // Find matching indicator type
      const matchingType = Object.keys(INDICATOR_IMPACT).find(t => 
        indicatorType.toLowerCase().includes(t.toLowerCase())
      );

      const impactConfig = matchingType ? INDICATOR_IMPACT[matchingType] : null;
      const affectedTickers = impactConfig?.assets || ['SPY'];
      const multiplier = impactConfig?.multiplier || 1.0;

      // Calculate magnitude based on surprise size
      let magnitude = Math.min(4, Math.abs(surprise) * multiplier / 100 * 5);
      if (magnitude < 0.5) magnitude = 1; // Minimum magnitude for significant events

      // Create signals for affected assets
      for (const ticker of affectedTickers) {
        const assetId = tickerToAssetId.get(ticker);
        if (!assetId) continue;

        signals.push({
          asset_id: assetId,
          signal_type: 'economic_indicator',
          direction,
          magnitude,
          observed_at: ind.release_date || new Date().toISOString(),
          value_text: `${indicatorType} (${ind.country || 'US'}): ${actual} vs ${forecast || previous || 'N/A'} expected`,
          checksum: JSON.stringify({ 
            ticker,
            signal_type: 'economic_indicator', 
            indicator_type: indicatorType,
            release_date: ind.release_date 
          }),
          citation: { 
            source: ind.source || 'Economic Calendar', 
            timestamp: new Date().toISOString() 
          },
          raw: {
            indicator_type: indicatorType,
            country: ind.country,
            actual: actual,
            forecast: forecast,
            previous: previous,
            impact: impact,
            surprise: surprise
          }
        });
      }
    }

    // Batch upsert
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (!insertError) insertedCount += data?.length || 0;
    }

    console.log(`[SIGNAL-GEN-ECONOMIC] ✅ Created ${insertedCount} economic signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-economic',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'economic_indicators',
    });

    return new Response(JSON.stringify({ 
      success: true,
      indicators_processed: indicators.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-ECONOMIC] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-economic',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
