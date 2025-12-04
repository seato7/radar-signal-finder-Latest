import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

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

    console.log('[SIGNAL-GEN-SOCIAL] Starting social sentiment signal generation...');

    const [redditResult, stocktwitsResult] = await Promise.all([
      supabaseClient
        .from('reddit_sentiment')
        .select('*')
        .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false }),
      supabaseClient
        .from('stocktwits_sentiment')
        .select('*')
        .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false })
    ]);

    if (redditResult.error) throw redditResult.error;
    if (stocktwitsResult.error) throw stocktwitsResult.error;

    const reddit = redditResult.data || [];
    const stocktwits = stocktwitsResult.data || [];

    console.log(`[SIGNAL-GEN-SOCIAL] Found ${reddit.length} Reddit + ${stocktwits.length} StockTwits records`);

    if (reddit.length === 0 && stocktwits.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-social',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No social data to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const allTickers = [...new Set([...reddit.map(r => r.ticker), ...stocktwits.map(s => s.ticker)])];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', allTickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];

    for (const item of reddit) {
      const assetId = tickerToAssetId.get(item.ticker);
      if (!assetId) continue;

      const sentimentScore = item.sentiment_score || 0;
      const direction = sentimentScore > 0.2 ? 'up' : sentimentScore < -0.2 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(sentimentScore) + (item.mention_count || 0) / 100);

      const signalData = {
        ticker: item.ticker,
        signal_type: 'social_sentiment_reddit',
        timestamp: item.timestamp,
        sentiment_score: sentimentScore
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'social_sentiment_reddit',
        direction,
        magnitude,
        observed_at: new Date(item.timestamp).toISOString(),
        value_text: `Reddit: ${item.mention_count} mentions, ${sentimentScore > 0 ? 'bullish' : 'bearish'} (${(sentimentScore * 100).toFixed(0)}%)`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'Reddit (wallstreetbets)',
          timestamp: new Date().toISOString()
        },
        raw: {
          mention_count: item.mention_count,
          sentiment_score: sentimentScore,
          top_posts: item.top_posts
        }
      });
    }

    for (const item of stocktwits) {
      const assetId = tickerToAssetId.get(item.ticker);
      if (!assetId) continue;

      const sentimentScore = item.sentiment_score || 0;
      const direction = sentimentScore > 0.2 ? 'up' : sentimentScore < -0.2 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(sentimentScore) + (item.message_volume || 0) / 1000);

      const signalData = {
        ticker: item.ticker,
        signal_type: 'social_sentiment_stocktwits',
        timestamp: item.timestamp,
        sentiment_score: sentimentScore
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'social_sentiment_stocktwits',
        direction,
        magnitude,
        observed_at: new Date(item.timestamp).toISOString(),
        value_text: `StockTwits: ${item.message_volume} messages, ${sentimentScore > 0 ? 'bullish' : 'bearish'} (${(sentimentScore * 100).toFixed(0)}%)`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'StockTwits',
          timestamp: new Date().toISOString()
        },
        raw: {
          message_volume: item.message_volume,
          sentiment_score: sentimentScore,
          bullish_pct: item.bullish_pct,
          bearish_pct: item.bearish_pct
        }
      });
    }

    if (signals.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-social',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No signals created from social data', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-SOCIAL] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-SOCIAL] ✅ Created ${signals.length} social sentiment signals`);

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-social',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: signals.length,
    });

    return new Response(JSON.stringify({ 
      success: true,
      reddit_processed: reddit.length,
      stocktwits_processed: stocktwits.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-SOCIAL] ❌ Error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-social',
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
