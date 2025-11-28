import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SP500_STOCKS } from "./sp500.ts";
import { CRYPTO_ASSETS } from "./crypto.ts";
import { FOREX_PAIRS } from "./forex.ts";
import { COMMODITIES } from "./commodities.ts";
import { RUSSELL_2000 } from "./russell2000.ts";
import { INTERNATIONAL_STOCKS } from "./international.ts";

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

    console.log('[POPULATE-ASSETS] Starting comprehensive asset population with 1,200+ assets...');

    // Combine all asset sources - Total: ~1,200+ assets
    const allAssets = [
      ...SP500_STOCKS.map(a => ({ ...a, asset_class: 'stock' })),        // ~500 stocks (complete S&P 500)
      ...RUSSELL_2000.map(a => ({ ...a, asset_class: 'stock' })),        // 185 stocks (small-cap growth)
      ...INTERNATIONAL_STOCKS.map(a => ({ ...a, asset_class: 'stock' })), // 202 stocks (global leaders)
      ...CRYPTO_ASSETS.map(a => ({ ...a, asset_class: 'crypto' })),      // 191 crypto pairs (majors + alts)
      ...FOREX_PAIRS.map(a => ({ ...a, asset_class: 'forex' })),         // 91 forex pairs (all majors + exotics)
      ...COMMODITIES.map(a => ({ ...a, asset_class: 'commodity' })),     // 72 commodities (metals + energy + ag)
    ];
    
    console.log(`[POPULATE-ASSETS] Total assets to process: ${allAssets.length} (${SP500_STOCKS.length} S&P500 + ${RUSSELL_2000.length} Russell2000 + ${INTERNATIONAL_STOCKS.length} International + ${CRYPTO_ASSETS.length} Crypto + ${FOREX_PAIRS.length} Forex + ${COMMODITIES.length} Commodities)`);
    
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    // Batch insert for efficiency
    const batchSize = 100;
    for (let i = 0; i < allAssets.length; i += batchSize) {
      const batch = allAssets.slice(i, i + batchSize);
      
      const { data: existing } = await supabaseClient
        .from('assets')
        .select('ticker')
        .in('ticker', batch.map(a => a.ticker));
      
      const existingTickers = new Set(existing?.map(e => e.ticker) || []);
      const newAssets = batch.filter(a => !existingTickers.has(a.ticker));
      
      if (newAssets.length > 0) {
        const { error } = await supabaseClient
          .from('assets')
          .insert(newAssets.map(a => ({
            ticker: a.ticker,
            name: a.name,
            exchange: a.exchange,
            asset_class: a.asset_class,
            metadata: {}
          })));

        if (error) {
          console.error(`Batch insert error:`, error);
          errors += newAssets.length;
        } else {
          inserted += newAssets.length;
        }
      }
      
      skipped += batch.length - newAssets.length;
      
      if ((i + batchSize) % 500 === 0) {
        console.log(`[POPULATE-ASSETS] Progress: ${i + batchSize}/${allAssets.length}`);
      }
    }

    console.log(`[POPULATE-ASSETS] Complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);

    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'populate-assets',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: duration,
      source_used: 'comprehensive_universe',
      metadata: { 
        total_assets: allAssets.length,
        stocks: SP500_STOCKS.length + RUSSELL_2000.length + INTERNATIONAL_STOCKS.length,
        crypto: CRYPTO_ASSETS.length,
        forex: FOREX_PAIRS.length,
        commodities: COMMODITIES.length,
        errors
      }
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Populated ${inserted} new assets from comprehensive universe`,
      inserted,
      skipped,
      errors,
      total: allAssets.length,
      breakdown: {
        sp500: SP500_STOCKS.length,
        russell2000: RUSSELL_2000.length,
        international: INTERNATIONAL_STOCKS.length,
        crypto: CRYPTO_ASSETS.length,
        forex: FOREX_PAIRS.length,
        commodities: COMMODITIES.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[POPULATE-ASSETS] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
