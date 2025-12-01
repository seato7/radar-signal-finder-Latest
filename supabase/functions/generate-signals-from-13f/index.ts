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

    console.log('[SIGNAL-GEN-13F] Starting 13F holdings signal generation...');

    const { data: holdings, error: holdingsError } = await supabaseClient
      .from('holdings_13f')
      .select('*')
      .gte('filing_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('filing_date', { ascending: false });

    if (holdingsError) throw holdingsError;

    console.log(`[SIGNAL-GEN-13F] Found ${holdings?.length || 0} 13F holdings`);

    if (!holdings || holdings.length === 0) {
      return new Response(JSON.stringify({ message: 'No 13F holdings to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(holdings.map(h => h.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const holding of holdings) {
      const assetId = tickerToAssetId.get(holding.ticker);
      if (!assetId) continue;

      const sharesChange = holding.shares_change || 0;
      const direction = sharesChange > 0 ? 'up' : sharesChange < 0 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(sharesChange) / 10000000); // Normalize to 10M shares

      const signalData = {
        ticker: holding.ticker,
        signal_type: 'institutional_13f',
        filing_date: holding.filing_date,
        shares_change: sharesChange
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'institutional_13f',
        direction,
        magnitude,
        observed_at: new Date(holding.filing_date).toISOString(),
        value_text: `${holding.institution}: ${sharesChange > 0 ? '+' : ''}${(sharesChange / 1000).toFixed(0)}K shares`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'SEC 13F Filings',
          timestamp: new Date().toISOString()
        },
        raw: {
          institution: holding.institution,
          shares: holding.shares,
          shares_change: sharesChange,
          market_value: holding.market_value
        }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-13F] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-13F] ✅ Created ${signals.length} institutional 13F signals`);

    return new Response(JSON.stringify({ 
      success: true,
      holdings_processed: holdings.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-13F] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
