import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
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
      { series: 'GDP',      name: 'US GDP',                       country: 'US', type: 'gdp',           impact: 'high'   },
      { series: 'UNRATE',   name: 'Unemployment Rate',            country: 'US', type: 'unemployment',  impact: 'high'   },
      { series: 'CPIAUCSL', name: 'Consumer Price Index',         country: 'US', type: 'inflation',     impact: 'high'   },
      { series: 'FEDFUNDS', name: 'Federal Funds Rate',           country: 'US', type: 'interest_rate', impact: 'high'   },
      { series: 'DFF',      name: 'Effective Federal Funds Rate', country: 'US', type: 'interest_rate', impact: 'high'   },
      { series: 'T10Y2Y',   name: 'Treasury Yield Spread',        country: 'US', type: 'yield_curve',   impact: 'medium' },
      { series: 'PAYEMS',   name: 'Nonfarm Payrolls',             country: 'US', type: 'employment',    impact: 'high'   },
      { series: 'PCEPI',    name: 'PCE Price Index',              country: 'US', type: 'inflation',     impact: 'high'   },
      { series: 'RSXFS',    name: 'Retail Sales',                 country: 'US', type: 'retail',        impact: 'medium' },
      { series: 'INDPRO',   name: 'Industrial Production',        country: 'US', type: 'production',    impact: 'medium' },
    ];

    let attempted = 0;
    let upserted = 0;
    let failed = 0;

    for (const indicator of indicators) {
      try {
        const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${indicator.series}&api_key=${fredApiKey}&file_type=json&limit=12&sort_order=desc`;
        const redactedUrl = fredUrl.replace(fredApiKey, '[REDACTED]');

        console.log(`Fetching ${indicator.series}: ${redactedUrl}`);

        const response = await fetch(fredUrl);

        if (!response.ok) {
          console.log(`FRED API returned ${response.status} for ${indicator.series}`);
          failed++;
          continue;
        }

        const data = await response.json();
        const observations = data.observations || [];

        // Build all records for this series, skipping missing values
        const records = [];
        for (const obs of observations) {
          if (obs.value === '.') continue; // FRED uses '.' for missing data points

          attempted++;
          records.push({
            series_id: indicator.series,
            indicator_type: indicator.type,
            country: indicator.country,
            value: parseFloat(obs.value),
            release_date: new Date(obs.date).toISOString(),
            impact: indicator.impact,
            source: 'FRED',
            metadata: {
              series_name: indicator.name,
              realtime_start: obs.realtime_start,
              realtime_end: obs.realtime_end,
            },
          });
        }

        if (records.length > 0) {
          const { error } = await supabase
            .from('economic_indicators')
            .upsert(records, { onConflict: 'series_id,release_date' });

          if (error) {
            console.error(`Upsert error for ${indicator.series}:`, error.message);
            failed += records.length;
          } else {
            upserted += records.length;
            console.log(`✓ ${indicator.series}: upserted ${records.length} observations`);
          }
        }

        // Rate limiting — FRED allows 120 req/min; 500ms keeps us well under
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        console.error(`Error processing ${indicator.series}:`, err);
        failed++;
      }
    }

    await logHeartbeat(supabase, {
      function_name: 'ingest-fred-economics',
      status: 'success',
      rows_inserted: upserted,
      rows_skipped: failed,
      duration_ms: Date.now() - startTime,
      source_used: 'FRED',
      metadata: { attempted, upserted, failed },
    });

    // Only alert Slack when something actually failed
    if (failed > 0) {
      await slackAlerter.sendLiveAlert({
        etlName: 'ingest-fred-economics',
        status: 'partial',
        rowsInserted: upserted,
        rowsSkipped: failed,
        sourceUsed: 'FRED',
        duration: Date.now() - startTime,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      source: 'FRED (St. Louis Fed)',
      indicators: indicators.length,
      attempted,
      upserted,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
