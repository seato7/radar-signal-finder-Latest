import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
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

    console.log('[POPULATE-ASSETS] Starting asset population...');

    // Common stocks to populate
    const popularAssets = [
      { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
      { ticker: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
      { ticker: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ' },
      { ticker: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
      { ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
      { ticker: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ' },
      { ticker: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ' },
      { ticker: 'BRK.B', name: 'Berkshire Hathaway Inc.', exchange: 'NYSE' },
      { ticker: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE' },
      { ticker: 'V', name: 'Visa Inc.', exchange: 'NYSE' },
      { ticker: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE' },
      { ticker: 'DIS', name: 'The Walt Disney Company', exchange: 'NYSE' },
      { ticker: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ' },
      { ticker: 'ADBE', name: 'Adobe Inc.', exchange: 'NASDAQ' },
      { ticker: 'CRM', name: 'Salesforce Inc.', exchange: 'NYSE' },
      { ticker: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE' },
      { ticker: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ' },
      { ticker: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ' },
      { ticker: 'BA', name: 'The Boeing Company', exchange: 'NYSE' },
      { ticker: 'GE', name: 'General Electric Company', exchange: 'NYSE' },
      { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE' },
      { ticker: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ' },
    ];

    let inserted = 0;
    let skipped = 0;

    for (const asset of popularAssets) {
      // Check if already exists
      const { data: existing } = await supabaseClient
        .from('assets')
        .select('ticker')
        .eq('ticker', asset.ticker)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Insert new asset
      const { error } = await supabaseClient
        .from('assets')
        .insert({
          ticker: asset.ticker,
          name: asset.name,
          exchange: asset.exchange,
          metadata: {}
        });

      if (error) {
        console.error(`Error inserting ${asset.ticker}:`, error);
      } else {
        inserted++;
      }
    }

    console.log(`[POPULATE-ASSETS] Complete. Inserted: ${inserted}, Skipped: ${skipped}`);

    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'populate-assets',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: duration,
      source_used: 'manual_list',
      metadata: { total_assets: popularAssets.length }
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Asset population complete`,
      inserted,
      skipped,
      total: popularAssets.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[POPULATE-ASSETS] Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'populate-assets',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : String(error),
      source_used: 'error'
    });
    
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
