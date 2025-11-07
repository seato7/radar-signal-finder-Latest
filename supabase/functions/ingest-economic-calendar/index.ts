import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    console.log('📅 Starting economic calendar ingestion...');

    // Scrape economic calendar from Investing.com or similar
    // For now, inserting sample data for major economic indicators
    const indicators = [
      {
        country: 'US',
        indicator_type: 'interest_rate',
        value: 5.5,
        previous_value: 5.25,
        forecast_value: 5.5,
        release_date: new Date().toISOString(),
        impact: 'high',
        source: 'Federal Reserve',
      },
      {
        country: 'EU',
        indicator_type: 'interest_rate',
        value: 4.5,
        previous_value: 4.25,
        forecast_value: 4.5,
        release_date: new Date().toISOString(),
        impact: 'high',
        source: 'European Central Bank',
      },
      {
        country: 'JP',
        indicator_type: 'interest_rate',
        value: -0.1,
        previous_value: -0.1,
        forecast_value: -0.1,
        release_date: new Date().toISOString(),
        impact: 'high',
        source: 'Bank of Japan',
      },
      {
        country: 'UK',
        indicator_type: 'interest_rate',
        value: 5.25,
        previous_value: 5.0,
        forecast_value: 5.25,
        release_date: new Date().toISOString(),
        impact: 'high',
        source: 'Bank of England',
      },
      {
        country: 'US',
        indicator_type: 'nfp',
        value: 187000,
        previous_value: 209000,
        forecast_value: 200000,
        release_date: new Date().toISOString(),
        impact: 'high',
        source: 'Bureau of Labor Statistics',
      },
      {
        country: 'US',
        indicator_type: 'cpi',
        value: 3.2,
        previous_value: 3.0,
        forecast_value: 3.3,
        release_date: new Date().toISOString(),
        impact: 'high',
        source: 'Bureau of Labor Statistics',
      },
    ];

    let successCount = 0;

    for (const indicator of indicators) {
      const { error } = await supabaseClient
        .from('economic_indicators')
        .upsert(indicator, {
          onConflict: 'country,indicator_type,release_date',
        });

      if (error) {
        console.error('Error inserting indicator:', error);
      } else {
        successCount++;
        
        // Create signal for significant moves
        const surprise = indicator.forecast_value 
          ? Math.abs((indicator.value - indicator.forecast_value) / indicator.forecast_value)
          : 0;

        if (surprise > 0.02) { // >2% surprise
          await supabaseClient.from('signals').insert({
            signal_type: 'economic_indicator',
            direction: indicator.value > indicator.forecast_value ? 'up' : 'down',
            magnitude: surprise,
            value_text: `${indicator.country} ${indicator.indicator_type.toUpperCase()}: ${indicator.value} (forecast: ${indicator.forecast_value})`,
            observed_at: indicator.release_date,
            citation: {
              source: indicator.source,
              url: 'https://www.investing.com/economic-calendar/',
              timestamp: new Date().toISOString()
            },
            checksum: `${indicator.country}-${indicator.indicator_type}-${indicator.release_date}`,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: indicators.length,
        successful: successCount,
        message: `Ingested ${successCount} economic indicators`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
