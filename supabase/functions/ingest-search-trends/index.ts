import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callPerplexity } from "../_shared/perplexity-client.ts";

const slackAlerter = new SlackAlerter();

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
    console.log('Starting Search Trends ingestion via Perplexity...');
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY not configured - required for real search trend data');
    }
    
    // Fetch top assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, asset_class')
      .in('asset_class', ['stock', 'crypto', 'forex'])
      .limit(50);
    
    if (assetsError) throw assetsError;
    
    let inserted = 0;
    let skipped = 0;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    for (const asset of assets || []) {
      try {
        console.log(`Fetching search trends for ${asset.ticker}...`);
        
        const prompt = `What is the current Google search interest for "${asset.ticker}" (${asset.name}) over the past 7 days?
Provide real data based on Google Trends:
- SEARCH_VOLUME: relative search interest score (0-100)
- TREND_CHANGE: percentage change from previous week (-100 to +100)
- BREAKOUT: is this a breakout search term? (true/false)

Format your response EXACTLY as:
SEARCH_VOLUME: X
TREND_CHANGE: Y
BREAKOUT: Z`;

        const content = await callPerplexity(
          [{ role: 'user', content: prompt }],
          { apiKey: perplexityKey, model: 'sonar', temperature: 0.2, maxTokens: 200 }
        );

        // Parse response
        const volumeMatch = content.match(/SEARCH_VOLUME:\s*(\d+)/);
        const changeMatch = content.match(/TREND_CHANGE:\s*(-?[\d.]+)/);
        const breakoutMatch = content.match(/BREAKOUT:\s*(true|false)/i);

        const searchVolume = volumeMatch ? parseInt(volumeMatch[1]) : 50;
        const trendChange = changeMatch ? parseFloat(changeMatch[1]) : 0;
        const isBreakout = breakoutMatch ? breakoutMatch[1].toLowerCase() === 'true' : false;
        
        const trendData = {
          ticker: asset.ticker,
          keyword: asset.name,
          period_start: startDate,
          period_end: today,
          search_volume: searchVolume,
          trend_change: trendChange,
          region: 'US',
          metadata: { breakout: isBreakout, source: 'Perplexity AI' }
        };
        
        const { error: insertError } = await supabase
          .from('search_trends')
          .insert(trendData);
        
        if (!insertError) {
          inserted++;
          
          // Create signal for breakout trends
          if (isBreakout || trendChange > 50) {
            const { data: assetData } = await supabase
              .from('assets')
              .select('id')
              .eq('ticker', asset.ticker)
              .single();
              
            await supabase.from('signals').insert({
              signal_type: 'search_trend_breakout',
              asset_id: assetData?.id,
              direction: 'up',
              magnitude: Math.min(trendChange / 100, 1.0),
              value_text: `Search interest breakout: +${trendChange.toFixed(1)}% (volume: ${searchVolume})`,
              observed_at: new Date().toISOString(),
              citation: {
                source: 'Perplexity AI - Google Trends',
                url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(asset.ticker)}`,
                timestamp: new Date().toISOString()
              },
              checksum: `${asset.ticker}-trends-${today}`,
            });
          }
        } else {
          skipped++;
        }
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1500));
        
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
      source_used: 'Perplexity AI',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-search-trends',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Perplexity AI',
      duration: Date.now() - startTime,
    });

    return new Response(JSON.stringify({
      success: true,
      processed: assets?.length || 0,
      inserted,
      skipped,
      source: 'Perplexity AI'
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
      source_used: 'Perplexity AI',
      error_message: error instanceof Error ? error.message : String(error),
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-search-trends',
      message: `Search trends ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
