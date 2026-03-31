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

    console.log('[SIGNAL-GEN-EARNINGS] Starting earnings sentiment signal generation...');

    const { data: earnings, error: earningsError } = await supabaseClient
      .from('earnings_sentiment')
      .select('*')
      .gte('earnings_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('earnings_date', { ascending: false });

    if (earningsError) throw earningsError;

    console.log(`[SIGNAL-GEN-EARNINGS] Found ${earnings?.length || 0} earnings records`);

    if (!earnings || earnings.length === 0) {
      const duration = Date.now() - startTime;
      
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-earnings',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'earnings_sentiment',
      });
      
      return new Response(JSON.stringify({ message: 'No earnings data to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(earnings.map(e => e.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map(a => [a.id, a.ticker]) || []);

    const signals = [];
    for (const earning of earnings) {
      const assetId = tickerToAssetId.get(earning.ticker);
      if (!assetId) continue;

      const epsSurprise = earning.earnings_surprise || 0;
      const revSurprise = earning.revenue_surprise || 0;
      const sentimentScore = earning.sentiment_score || 0;

      // Positive surprise = bullish
      const avgSurprise = (epsSurprise + revSurprise) / 2;
      const direction = avgSurprise > 0 ? 'up' : avgSurprise < 0 ? 'down' : 'neutral';
      const magnitude = Math.min(5, (Math.abs(avgSurprise) / 20 + Math.abs(sentimentScore)) * 5); // Normalised to 0-5 scale

      const signalData = {
        ticker: earning.ticker,
        signal_type: 'earnings_surprise',
        earnings_date: earning.earnings_date,
        eps_surprise: epsSurprise
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'earnings_surprise',
        direction,
        magnitude,
        observed_at: new Date(earning.earnings_date).toISOString(),
        value_text: `${earning.quarter ?? 'Unknown Quarter'}: EPS ${epsSurprise > 0 ? '+' : ''}${epsSurprise.toFixed(1)}%, Rev ${revSurprise > 0 ? '+' : ''}${revSurprise.toFixed(1)}%`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'Earnings Reports',
          timestamp: new Date().toISOString()
        },
        raw: {
          quarter: earning.quarter,
          earnings_surprise: epsSurprise,
          revenue_surprise: revSurprise,
          sentiment_score: sentimentScore
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
        console.log('[SIGNAL-GEN-EARNINGS] Batch error (continuing):', insertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    console.log(`[SIGNAL-GEN-EARNINGS] ✅ Created ${insertedCount} earnings surprise signals`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;

    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-earnings',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'earnings_sentiment',
    });

    return new Response(JSON.stringify({ 
      success: true,
      earnings_processed: earnings.length,
      signals_created: insertedCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-EARNINGS] ❌ Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-earnings',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
