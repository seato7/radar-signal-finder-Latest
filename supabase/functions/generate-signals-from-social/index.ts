import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    console.log('[SIGNAL-GEN-SOCIAL] Starting social/news sentiment signal generation...');
    const { data: sentimentData, error: sentimentError } = await supabaseClient.from('news_sentiment_aggregate').select('*').gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('date', { ascending: false });
    if (sentimentError) throw sentimentError;
    console.log(`[SIGNAL-GEN-SOCIAL] Found ${sentimentData?.length || 0} news sentiment records`);
    if (!sentimentData || sentimentData.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-social', status: 'success', rows_inserted: 0, duration_ms: duration, source_used: 'news_sentiment_aggregate' });
      return new Response(JSON.stringify({ message: 'No sentiment data to process', signals_created: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const tickers = [...new Set(sentimentData.map(s => s.ticker))];
    const { data: assets } = await supabaseClient.from('assets').select('id, ticker').in('ticker', tickers);
    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const signals = [];
    for (const item of sentimentData) {
      const assetId = tickerToAssetId.get(item.ticker);
      if (!assetId) continue;
      const sentimentScore = item.sentiment_score || 0;
      const buzzScore = item.buzz_score || 0;
      const direction = sentimentScore > 0.2 ? 'up' : sentimentScore < -0.2 ? 'down' : 'neutral';
      const magnitude = Math.max(0, Math.min(1.0, Math.abs(sentimentScore) + buzzScore / 100));
      const signalData = { ticker: item.ticker, signal_type: 'news_sentiment', date: item.date, sentiment_score: sentimentScore };
      signals.push({ asset_id: assetId, signal_type: 'news_sentiment', direction, magnitude, observed_at: new Date(item.date).toISOString(), value_text: `News sentiment: ${item.sentiment_label || 'neutral'} (${item.total_articles || 0} articles)`, checksum: JSON.stringify(signalData), citation: { source: 'News Sentiment Aggregate', timestamp: new Date().toISOString() }, raw: { sentiment_score: sentimentScore, sentiment_label: item.sentiment_label, buzz_score: buzzScore, total_articles: item.total_articles, positive_articles: item.positive_articles, negative_articles: item.negative_articles } });
    }
    if (signals.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-social', status: 'success', rows_inserted: 0, duration_ms: duration, source_used: 'news_sentiment_aggregate' });
      return new Response(JSON.stringify({ message: 'No signals created from sentiment data', signals_created: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient.from('signals').upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true }).select('id');
      if (!insertError) insertedCount += data?.length || 0;
    }
    console.log(`[SIGNAL-GEN-SOCIAL] ✅ Upserted ${insertedCount} news sentiment signals`);
    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-social', status: 'success', rows_inserted: insertedCount, rows_skipped: signals.length - insertedCount, duration_ms: duration, source_used: 'news_sentiment_aggregate' });
    return new Response(JSON.stringify({ success: true, records_processed: sentimentData.length, signals_created: insertedCount, duplicates_skipped: signals.length - insertedCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[SIGNAL-GEN-SOCIAL] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    await logHeartbeat(supabaseClient, { function_name: 'generate-signals-from-social', status: 'failure', duration_ms: duration, error_message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
