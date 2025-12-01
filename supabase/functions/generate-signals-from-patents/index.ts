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

    console.log('[SIGNAL-GEN-PATENTS] Starting patent filing signal generation...');

    const { data: patents, error: patentsError } = await supabaseClient
      .from('patent_filings')
      .select('*')
      .gte('filing_date', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
      .order('filing_date', { ascending: false });

    if (patentsError) throw patentsError;

    console.log(`[SIGNAL-GEN-PATENTS] Found ${patents?.length || 0} patent filings`);

    if (!patents || patents.length === 0) {
      return new Response(JSON.stringify({ message: 'No patent filings to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(patents.map(p => p.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Aggregate patents by ticker to detect innovation momentum
    const patentsByTicker = new Map<string, any[]>();
    for (const patent of patents) {
      if (!patentsByTicker.has(patent.ticker)) {
        patentsByTicker.set(patent.ticker, []);
      }
      patentsByTicker.get(patent.ticker)!.push(patent);
    }

    const signals = [];
    for (const [ticker, tickerPatents] of patentsByTicker.entries()) {
      const assetId = tickerToAssetId.get(ticker);
      if (!assetId) continue;

      // Recent filings indicate innovation momentum
      const recentPatents = tickerPatents.filter(p => 
        new Date(p.filing_date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      );

      if (recentPatents.length === 0) continue;

      const magnitude = Math.min(1.0, recentPatents.length / 10); // Normalize to 10 patents
      const direction = 'up'; // Patent activity is generally bullish

      const categories = [...new Set(recentPatents.map(p => p.technology_category).filter(Boolean))];

      const signalData = {
        ticker,
        signal_type: 'innovation_patent',
        patent_count: recentPatents.length,
        filing_date: recentPatents[0].filing_date
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'innovation_patent',
        direction,
        magnitude,
        observed_at: new Date(recentPatents[0].filing_date).toISOString(),
        value_text: `${recentPatents.length} patent${recentPatents.length > 1 ? 's' : ''} filed (${categories.slice(0, 3).join(', ')})`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'USPTO Patent Database',
          timestamp: new Date().toISOString()
        },
        raw: {
          patent_count: recentPatents.length,
          categories,
          latest_patent: recentPatents[0].patent_title
        }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-PATENTS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-PATENTS] ✅ Created ${signals.length} innovation patent signals`);

    return new Response(JSON.stringify({ 
      success: true,
      patents_processed: patents.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-PATENTS] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
