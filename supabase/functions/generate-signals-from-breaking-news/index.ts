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

    console.log('[SIGNAL-GEN-BREAKING] Starting breaking news signal generation...');

    // Fetch breaking news
    const { data: news, error: newsError } = await supabaseClient
      .from('breaking_news')
      .select('*')
      .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .neq('sentiment_score', 0)
      .order('published_at', { ascending: false })
      .limit(5000);

    if (newsError) throw newsError;

    console.log(`[SIGNAL-GEN-BREAKING] Found ${news?.length || 0} breaking news records`);

    if (!news || news.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-breaking-news',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'breaking_news',
      });
      return new Response(JSON.stringify({ message: 'No breaking news to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(news.map(n => n.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map(a => [a.id, a.ticker]) || []);

    const signals = [];
    for (const item of news) {
      const assetId = tickerToAssetId.get(item.ticker);
      if (!assetId) continue;

      const sentimentScore = item.sentiment_score ?? 0;
      const relevanceScore = item.relevance_score || 0.5;

      // Skip neutral news with low relevance
      if (Math.abs(sentimentScore) < 0.15 && relevanceScore < 0.3) continue;

      let direction = 'neutral';
      if (sentimentScore > 0.2) direction = 'up';
      else if (sentimentScore < -0.2) direction = 'down';

      // Magnitude based on sentiment strength and relevance
      const magnitude = Math.min(5, Math.abs(sentimentScore) * 5 * relevanceScore);

      // Skip very weak signals
      if (magnitude < 0.5) continue;
      
      // Use specific signal types that match scoring expectations
      const signalType = direction === 'up' ? 'breaking_news_bullish' : 
                         direction === 'down' ? 'breaking_news_bearish' : 'breaking_news';

      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: item.published_at || new Date().toISOString(),
        value_text: item.headline?.substring(0, 200) || 'Breaking news',
        checksum: JSON.stringify({ 
          ticker: item.ticker, 
          signal_type: 'breaking_news', 
          headline: item.headline?.substring(0, 50),
          published_at: item.published_at 
        }),
        citation: { 
          source: item.source || 'Breaking News', 
          url: item.url,
          timestamp: new Date().toISOString() 
        },
        raw: {
          headline: item.headline,
          summary: item.summary,
          sentiment_score: sentimentScore,
          relevance_score: relevanceScore,
          source: item.source
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

    console.log(`[SIGNAL-GEN-BREAKING] ✅ Created ${insertedCount} breaking news signals (${signals.length - insertedCount} duplicates)`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-breaking-news',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'breaking_news',
    });

    return new Response(JSON.stringify({ 
      success: true,
      news_processed: news.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-BREAKING] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-breaking-news',
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
