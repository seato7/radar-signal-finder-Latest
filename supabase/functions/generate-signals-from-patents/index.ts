import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v2 - REAL DATA ONLY - NO ESTIMATIONS
// Only generates signals from REAL patent data that has been ingested

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[v2] Starting patent signal generation - REAL DATA ONLY');

    // Only get patents that are from REAL sources (not estimation)
    const { data: patents, error: patentsError } = await supabaseClient
      .from('patent_filings')
      .select('*')
      .gte('filing_date', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
      .not('metadata->source', 'eq', 'patent_estimation_engine')
      .not('metadata->estimated', 'eq', true)
      .order('filing_date', { ascending: false });

    if (patentsError) throw patentsError;

    console.log(`[v2] Found ${patents?.length || 0} REAL patent filings (excluding estimations)`);

    if (!patents || patents.length === 0) {
      console.log('[v2] No real patent data available - NOT generating any fake signals');
      
      return new Response(JSON.stringify({ 
        message: 'No real patent data to process - no fake signals generated', 
        signals_created: 0,
        version: 'v2_no_estimation'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(patents.map(p => p.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Aggregate patents by ticker
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

      // Recent filings (last 90 days)
      const recentPatents = tickerPatents.filter(p => 
        new Date(p.filing_date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      );

      if (recentPatents.length === 0) continue;

      const magnitude = Math.min(1.0, recentPatents.length / 10);
      const direction = 'up';

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
          timestamp: new Date().toISOString(),
          data_type: 'real'
        },
        raw: {
          patent_count: recentPatents.length,
          categories,
          latest_patent: recentPatents[0].patent_title,
          version: 'v2_no_estimation'
        }
      });
    }

    if (signals.length === 0) {
      console.log('[v2] No signals generated from real patent data');
      return new Response(JSON.stringify({ 
        message: 'No signals generated - patent data did not meet signal criteria', 
        signals_created: 0,
        version: 'v2_no_estimation'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        console.log('[v2] Batch error (continuing):', insertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    console.log(`[v2] ✅ Upserted ${insertedCount} REAL innovation patent signals - NO ESTIMATIONS (${signals.length - insertedCount} duplicates)`);

    return new Response(JSON.stringify({ 
      success: true,
      patents_processed: patents.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount,
      version: 'v2_no_estimation',
      message: `Created ${insertedCount} REAL innovation patent signals`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[v2] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
