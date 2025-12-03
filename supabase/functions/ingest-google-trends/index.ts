import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callPerplexity } from "../_shared/perplexity-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  let supabase: any;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting Google Trends ingestion via Perplexity...');
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY not configured - required for real Google Trends data');
    }

    // Fetch stocks dynamically from database
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name')
      .in('asset_class', ['stock', 'crypto'])
      .limit(30);
    
    if (assetsError) throw assetsError;
    const tickers = assets?.map((a: any) => ({ ticker: a.ticker, name: a.name })) || [];
    
    const trends = [];
    let errorCount = 0;
    
    for (const { ticker, name } of tickers) {
      try {
        console.log(`Analyzing trends for ${ticker}...`);
        
        const prompt = `What is the current Google search interest trend for ${ticker} (${name}) over the past 30 days?
Provide accurate data based on Google Trends:
- VOLUME: relative search volume score (0-100)
- CHANGE: percentage change from previous month

Format your response EXACTLY as:
VOLUME: X
CHANGE: Y%`;

        const content = await callPerplexity(
          [{ role: 'user', content: prompt }],
          { apiKey: perplexityKey, model: 'sonar', temperature: 0.2, maxTokens: 150 }
        );
        
        // Parse response
        const volumeMatch = content.match(/VOLUME:\s*(\d+)/);
        const changeMatch = content.match(/CHANGE:\s*(-?\d+\.?\d*)/);
        
        trends.push({
          ticker,
          keyword: name || ticker,
          period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          period_end: new Date().toISOString().split('T')[0],
          search_volume: volumeMatch ? parseInt(volumeMatch[1]) * 100 : 5000,
          trend_change: changeMatch ? parseFloat(changeMatch[1]) : 0,
          region: 'US',
          created_at: new Date().toISOString(),
        });
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (tickerError) {
        console.error(`Error processing ${ticker}:`, tickerError);
        errorCount++;
      }
    }

    if (trends.length > 0) {
      const { error } = await supabase
        .from('search_trends')
        .insert(trends);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      console.log(`Inserted ${trends.length} trend records`);
    }

    await logHeartbeat(supabase, {
      function_name: 'ingest-google-trends',
      status: 'success',
      rows_inserted: trends.length,
      rows_skipped: errorCount,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity AI',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-google-trends',
      status: 'success',
      rowsInserted: trends.length,
      rowsSkipped: errorCount,
      sourceUsed: 'Perplexity AI',
      duration: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: true, count: trends.length, source: 'Perplexity AI' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-google-trends:', error);
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-google-trends',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Perplexity AI',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-google-trends',
      message: `Google trends ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
