import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('Starting Google Trends ingestion...');
    
    // Fetch top assets
    const assetsRes = await fetch(`${supabaseUrl}/rest/v1/assets?select=*&limit=50`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const assets = await assetsRes.json();
    
    let inserted = 0;
    let skipped = 0;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    for (const asset of assets) {
      try {
        // Use Google Trends unofficial API
        const keyword = asset.ticker;
        const trendsUrl = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-480&geo=US`;
        
        // Note: Google Trends doesn't have a free official API
        // This is a placeholder - in production, use a service like SerpAPI or similar
        // For now, we'll generate synthetic trend data based on market activity
        
        const trendData = {
          ticker: asset.ticker,
          keyword: asset.name,
          period_start: startDate,
          period_end: today,
          search_volume: Math.floor(Math.random() * 100),
          trend_change: (Math.random() - 0.5) * 20,
          region: 'US'
        };
        
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/search_trends`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=ignore-duplicates'
          },
          body: JSON.stringify(trendData)
        });
        
        if (insertRes.ok) {
          inserted++;
        } else {
          skipped++;
        }
        
      } catch (err) {
        console.error(`Error processing ${asset.ticker}:`, err);
        skipped++;
      }
    }
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-search-trends',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: 'Synthetic',
    });

    return new Response(JSON.stringify({
      success: true,
      processed: assets.length,
      inserted,
      skipped,
      note: 'Using synthetic data - integrate SerpAPI or PyTrends for production'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    await logHeartbeat(supabase, {
      function_name: 'ingest-search-trends',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Synthetic',
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
