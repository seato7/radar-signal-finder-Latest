import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

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
  const slackAlerter = new SlackAlerter();

  try {
    console.log('Starting FRED economic indicators ingestion...');
    
    const fredApiKey = Deno.env.get('FRED_API_KEY');
    if (!fredApiKey) {
      throw new Error('FRED_API_KEY not configured');
    }
    
    const indicators = [
      { series: 'GDP', name: 'US GDP', country: 'US', type: 'gdp', impact: 'high' },
      { series: 'UNRATE', name: 'Unemployment Rate', country: 'US', type: 'unemployment', impact: 'high' },
      { series: 'CPIAUCSL', name: 'Consumer Price Index', country: 'US', type: 'inflation', impact: 'high' },
      { series: 'FEDFUNDS', name: 'Federal Funds Rate', country: 'US', type: 'interest_rate', impact: 'high' },
      { series: 'DFF', name: 'Effective Federal Funds Rate', country: 'US', type: 'interest_rate', impact: 'high' },
      { series: 'T10Y2Y', name: 'Treasury Yield Spread', country: 'US', type: 'yield_curve', impact: 'medium' },
      { series: 'PAYEMS', name: 'Nonfarm Payrolls', country: 'US', type: 'employment', impact: 'high' },
      { series: 'PCEPI', name: 'PCE Price Index', country: 'US', type: 'inflation', impact: 'high' },
      { series: 'RSXFS', name: 'Retail Sales', country: 'US', type: 'retail', impact: 'medium' },
      { series: 'INDPRO', name: 'Industrial Production', country: 'US', type: 'production', impact: 'medium' }
    ];
    
    let inserted = 0;
    let skipped = 0;
    
    for (const indicator of indicators) {
      try {
        // FRED JSON endpoint with API key
        const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${indicator.series}&api_key=${fredApiKey}&file_type=json&limit=12&sort_order=desc`;
        
        const response = await fetch(fredUrl);
        
        if (!response.ok) {
          console.log(`FRED API returned ${response.status} for ${indicator.series}`);
          skipped++;
          continue;
        }
        
        const data = await response.json();
        const observations = data.observations || [];
        
        for (const obs of observations) {
          if (obs.value === '.') continue; // Skip missing values
          
          const value = parseFloat(obs.value);
          const release_date = new Date(obs.date).toISOString();
          
          const indicatorRecord = {
            indicator_type: indicator.type,
            country: indicator.country,
            value,
            release_date,
            impact: indicator.impact,
            source: 'FRED',
            metadata: {
              series_id: indicator.series,
              series_name: indicator.name,
              realtime_start: obs.realtime_start,
              realtime_end: obs.realtime_end
            }
          };
          
          const upsertRes = await fetch(`${supabaseUrl}/rest/v1/economic_indicators`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(indicatorRecord)
          });
          
          if (upsertRes.ok) {
            inserted++;
          } else {
            skipped++;
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`Error processing ${indicator.series}:`, err);
        skipped++;
      }
    }
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-fred-economics',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: 'FRED',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-fred-economics',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'FRED',
      duration: Date.now() - startTime,
    });

    return new Response(JSON.stringify({
      success: true,
      source: 'FRED (St. Louis Fed)',
      indicators: indicators.length,
      inserted,
      skipped,
      note: 'Register at fred.stlouisfed.org for API key to increase rate limits'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    await logHeartbeat(supabase, {
      function_name: 'ingest-fred-economics',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'FRED',
      error_message: error instanceof Error ? error.message : String(error),
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-fred-economics',
      message: `FRED economics ingestion failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
