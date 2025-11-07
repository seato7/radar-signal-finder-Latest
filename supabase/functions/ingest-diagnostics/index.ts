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
    
    const tables = [
      'prices',
      'advanced_technicals',
      'pattern_recognition',
      'forex_technicals',
      'signals',
      'news_sentiment_aggregate',
      'social_signals',
      'search_trends',
      'economic_indicators',
      'cot_reports',
      'forex_sentiment',
      'options_flow',
      'dark_pool_activity',
      'ai_research_reports',
      'crypto_onchain_metrics',
      'smart_money_flow',
      'breaking_news',
      'congressional_trades',
      'earnings_sentiment',
      'job_postings',
      'patent_filings',
      'short_interest'
    ];
    
    const diagnostics: any[] = [];
    
    for (const table of tables) {
      try {
        // Count total rows
        const countRes = await fetch(
          `${supabaseUrl}/rest/v1/${table}?select=count`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'count=exact'
            }
          }
        );
        const countHeader = countRes.headers.get('content-range');
        const totalRows = countHeader ? parseInt(countHeader.split('/')[1]) : 0;
        
        // Get most recent row
        const recentRes = await fetch(
          `${supabaseUrl}/rest/v1/${table}?select=created_at&order=created_at.desc&limit=1`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const recentData = await recentRes.json();
        const lastUpdate = recentData[0]?.created_at || null;
        
        // Calculate freshness
        const hoursOld = lastUpdate 
          ? (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
          : null;
        
        const status = !totalRows ? 'empty' 
          : hoursOld === null ? 'unknown'
          : hoursOld < 2 ? 'fresh'
          : hoursOld < 24 ? 'stale'
          : 'very_stale';
        
        diagnostics.push({
          table,
          total_rows: totalRows,
          last_update: lastUpdate,
          hours_old: hoursOld ? Math.round(hoursOld * 10) / 10 : null,
          status
        });
        
      } catch (err) {
        diagnostics.push({
          table,
          error: err instanceof Error ? err.message : String(err),
          status: 'error'
        });
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      tables: diagnostics,
      summary: {
        total: diagnostics.length,
        empty: diagnostics.filter(d => d.status === 'empty').length,
        fresh: diagnostics.filter(d => d.status === 'fresh').length,
        stale: diagnostics.filter(d => d.status === 'stale').length,
        very_stale: diagnostics.filter(d => d.status === 'very_stale').length,
        errors: diagnostics.filter(d => d.status === 'error').length
      }
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
