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

    console.log('[SIGNAL-GEN-SOCIAL-AGG] Starting aggregated social signals generation...');

    // Fetch social signals
    const { data: socialSignals, error: socialError } = await supabaseClient
      .from('social_signals')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(5000);

    if (socialError) throw socialError;

    console.log(`[SIGNAL-GEN-SOCIAL-AGG] Found ${socialSignals?.length || 0} social signal records`);

    if (!socialSignals || socialSignals.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-social-aggregated',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'social_signals',
      });
      return new Response(JSON.stringify({ message: 'No social signals to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Aggregate by ticker
    const tickerAggregates = new Map<string, { bullish: number; bearish: number; sentimentSum: number; count: number; latestTimestamp: string }>();
    
    for (const signal of socialSignals) {
      const ticker = signal.ticker;
      const existing = tickerAggregates.get(ticker) || { bullish: 0, bearish: 0, sentimentSum: 0, count: 0, latestTimestamp: '' };
      
      tickerAggregates.set(ticker, {
        bullish: existing.bullish + (signal.bullish_count || 0),
        bearish: existing.bearish + (signal.bearish_count || 0),
        sentimentSum: existing.sentimentSum + (signal.sentiment_score || 0),
        count: existing.count + 1,
        latestTimestamp: signal.timestamp > existing.latestTimestamp ? signal.timestamp : existing.latestTimestamp
      });
    }

    // Get asset mappings
    const tickers = Array.from(tickerAggregates.keys());
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const [ticker, agg] of tickerAggregates) {
      const assetId = tickerToAssetId.get(ticker);
      if (!assetId) continue;

      const netSentiment = agg.bullish - agg.bearish;
      const avgSentiment = agg.count > 0 ? agg.sentimentSum / agg.count : 0;
      const totalMentions = agg.bullish + agg.bearish;

      // Skip low activity tickers
      if (totalMentions < 5) continue;

      let direction = 'neutral';
      let magnitude = 0;
      let signalType = 'social_sentiment';

      // Strong bullish sentiment
      if (agg.bullish > agg.bearish * 1.5 && agg.bullish > 10) {
        direction = 'up';
        signalType = 'social_bullish';
        magnitude = Math.min(5, 2 + Math.log10(netSentiment + 1));
      }
      // Strong bearish sentiment
      else if (agg.bearish > agg.bullish * 1.5 && agg.bearish > 10) {
        direction = 'down';
        signalType = 'social_bearish';
        magnitude = Math.min(4, 1.5 + Math.log10(Math.abs(netSentiment) + 1));
      }
      // Use average sentiment score
      else if (Math.abs(avgSentiment) > 0.3) {
        direction = avgSentiment > 0 ? 'up' : 'down';
        magnitude = Math.min(4, Math.abs(avgSentiment) * 4);
      }

      if (direction === 'neutral' || magnitude < 0.5) continue;

      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: agg.latestTimestamp || new Date().toISOString(),
        value_text: `Social: ${agg.bullish} bullish, ${agg.bearish} bearish (net: ${netSentiment > 0 ? '+' : ''}${netSentiment})`,
        checksum: JSON.stringify({ 
          ticker, 
          signal_type: signalType, 
          date: agg.latestTimestamp?.split('T')[0],
          bullish: agg.bullish,
          bearish: agg.bearish
        }),
        citation: { source: 'Social Aggregated', timestamp: new Date().toISOString() },
        raw: {
          bullish_count: agg.bullish,
          bearish_count: agg.bearish,
          net_sentiment: netSentiment,
          avg_sentiment: avgSentiment,
          total_mentions: totalMentions
        }
      });
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

    console.log(`[SIGNAL-GEN-SOCIAL-AGG] ✅ Created ${insertedCount} aggregated social signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-social-aggregated',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'social_signals',
    });

    return new Response(JSON.stringify({ 
      success: true,
      tickers_processed: tickerAggregates.size,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-SOCIAL-AGG] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-social-aggregated',
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
