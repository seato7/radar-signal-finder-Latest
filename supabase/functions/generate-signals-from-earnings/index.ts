import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      const magnitude = Math.min(1.0, Math.abs(avgSurprise) / 20 + Math.abs(sentimentScore));

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
        value_text: `${earning.quarter}: EPS ${epsSurprise > 0 ? '+' : ''}${epsSurprise.toFixed(1)}%, Rev ${revSurprise > 0 ? '+' : ''}${revSurprise.toFixed(1)}%`,
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

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-EARNINGS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-EARNINGS] ✅ Created ${signals.length} earnings surprise signals`);

    return new Response(JSON.stringify({ 
      success: true,
      earnings_processed: earnings.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-EARNINGS] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
