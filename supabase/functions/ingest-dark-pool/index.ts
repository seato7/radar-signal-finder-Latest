import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Starting dark pool activity ingestion...');
    
    // Fetch stocks only
    const assetsRes = await fetch(
      `${supabaseUrl}/rest/v1/assets?select=*&asset_class=eq.stock&limit=100`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    const assets = await assetsRes.json();
    
    let inserted = 0;
    let skipped = 0;
    
    const today = new Date().toISOString().split('T')[0];
    
    for (const asset of assets) {
      try {
        // FINRA ATS data (free but requires scraping)
        // For now, generate synthetic data based on typical patterns
        // TODO: Integrate FINRA ATS scraper or paid API like Unusual Whales
        
        const totalVolume = Math.floor(Math.random() * 10000000) + 1000000;
        const darkPoolVolume = Math.floor(totalVolume * (0.2 + Math.random() * 0.3));
        const darkPoolPercentage = (darkPoolVolume / totalVolume) * 100;
        
        const dpData = {
          ticker: asset.ticker,
          asset_id: asset.id,
          trade_date: today,
          dark_pool_volume: darkPoolVolume,
          total_volume: totalVolume,
          dark_pool_percentage: darkPoolPercentage,
          dp_to_lit_ratio: darkPoolVolume / (totalVolume - darkPoolVolume),
          price_at_trade: 0, // Would come from prices table
          signal_type: darkPoolPercentage > 40 ? 'unusual_high' : darkPoolPercentage < 15 ? 'unusual_low' : 'normal',
          signal_strength: darkPoolPercentage > 50 ? 'strong' : darkPoolPercentage > 35 ? 'medium' : 'weak',
          source: 'synthetic',
          metadata: {
            note: 'Synthetic data - integrate FINRA ATS or Unusual Whales API'
          }
        };
        
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/dark_pool_activity`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(dpData)
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
    
    return new Response(JSON.stringify({
      success: true,
      processed: assets.length,
      inserted,
      skipped,
      note: 'Using synthetic data - integrate FINRA ATS scraper for production'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
