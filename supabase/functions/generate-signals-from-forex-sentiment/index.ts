// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { fireAiScoring } from '../_shared/fire-ai-scoring.ts';

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

    console.log('[SIGNAL-GEN-FOREX-SENT] Starting forex sentiment signal generation...');

    // Fetch forex sentiment
    const { data: sentiment, error: sentError } = await supabaseClient
      .from('forex_sentiment')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(2000);

    if (sentError) throw sentError;

    console.log(`[SIGNAL-GEN-FOREX-SENT] Found ${sentiment?.length || 0} forex sentiment records`);

    if (!sentiment || sentiment.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-forex-sentiment',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'forex_sentiment',
      });
      return new Response(JSON.stringify({ message: 'No forex sentiment to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(sentiment.map(s => s.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map(a => [a.id, a.ticker]) || []);

    const signals = [];
    for (const sent of sentiment) {
      const assetId = tickerToAssetId.get(sent.ticker);
      if (!assetId) continue;

      // Retail sentiment (contrarian indicator - when retail is long, often bearish)
      const retailSentiment = sent.retail_sentiment?.toLowerCase() || '';
      const retailLongPct = sent.retail_long_pct || 50;
      
      let direction = 'neutral';
      let magnitude = 0;

      // Contrarian approach: extreme retail positioning often precedes reversals
      if (retailLongPct > 70) {
        direction = 'down'; // Retail too long = contrarian bearish
        magnitude = Math.min(4, (retailLongPct - 50) / 10);
      } else if (retailLongPct < 30) {
        direction = 'up'; // Retail too short = contrarian bullish
        magnitude = Math.min(4, (50 - retailLongPct) / 10);
      }

      // News sentiment adds to signal
      const newsSentiment = sent.news_sentiment_score || 0;
      if (Math.abs(newsSentiment) > 0.3) {
        magnitude += Math.abs(newsSentiment) * 2;
      }

      // Social sentiment
      const socialSentiment = sent.social_sentiment_score || 0;
      if (Math.abs(socialSentiment) > 0.3) {
        magnitude += Math.abs(socialSentiment) * 1.5;
      }

      if (direction === 'neutral' || magnitude < 0.5) continue;
      
      // Use specific signal types that match scoring expectations
      const signalType = direction === 'up' ? 'forex_retail_extreme_short' : 'forex_retail_extreme_long';

      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude: Math.min(5, magnitude),
        observed_at: sent.timestamp || new Date().toISOString(),
        value_text: `Retail ${retailLongPct.toFixed(0)}% long (contrarian ${direction === 'up' ? 'bullish' : 'bearish'})`,
        checksum: JSON.stringify({ 
          ticker: sent.ticker, 
          signal_type: 'forex_sentiment', 
          timestamp: sent.timestamp,
          retailLongPct 
        }),
        citation: { source: sent.source || 'Forex Sentiment', timestamp: new Date().toISOString() },
        raw: {
          retail_sentiment: retailSentiment,
          retail_long_pct: retailLongPct,
          retail_short_pct: sent.retail_short_pct,
          news_sentiment_score: newsSentiment,
          social_sentiment_score: socialSentiment,
          social_mentions: sent.social_mentions,
          news_count: sent.news_count
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

    console.log(`[SIGNAL-GEN-FOREX-SENT] ✅ Created ${insertedCount} forex sentiment signals (${signals.length - insertedCount} duplicates)`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-forex-sentiment',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'forex_sentiment',
    });

    return new Response(JSON.stringify({ 
      success: true,
      records_processed: sentiment.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-FOREX-SENT] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-forex-sentiment',
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
