import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting short interest ingestion for user ${user.id}...`);
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');

    // Track high short interest stocks
    const tickers = ['AAPL', 'TSLA', 'NVDA'];
    
    if (!perplexityKey) {
      console.log('Perplexity API key not configured');
      return new Response(
        JSON.stringify({ error: 'Perplexity API key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Perplexity to get real-time short interest data from FINRA and other sources
    const shortData = [];
    
    for (const ticker of tickers) {
      console.log(`Analyzing short interest for ${ticker}...`);
      
      try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{
              role: 'system',
              content: 'You are a financial data provider. Return only the requested data in the exact format specified.'
            }, {
              role: 'user',
              content: `Get the latest FINRA short interest data for ${ticker}. Provide: SHORT_FLOAT: X% (percentage of float), SHORT_VOLUME: Y (number of shares), DAYS_TO_COVER: Z (days to cover). Use real current data from FINRA reports.`
            }],
            temperature: 0.1,
            max_tokens: 500,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices?.[0]?.message?.content || '';
          
          console.log(`Perplexity response for ${ticker}:`, content);
          
          const floatMatch = content.match(/SHORT_FLOAT:\s*(\d+\.?\d*)/i);
          const volumeMatch = content.match(/SHORT_VOLUME:\s*(\d+[,\d]*)/i);
          const daysMatch = content.match(/DAYS_TO_COVER:\s*(\d+\.?\d*)/i);
          
          const shortVolume = volumeMatch ? parseInt(volumeMatch[1].replace(/,/g, '')) : null;
          const floatPercentage = floatMatch ? parseFloat(floatMatch[1]) : null;
          const daysToCover = daysMatch ? parseFloat(daysMatch[1]) : null;
          
          shortData.push({
            ticker,
            report_date: new Date().toISOString().split('T')[0],
            short_volume: shortVolume,
            float_percentage: floatPercentage,
            days_to_cover: daysToCover,
            metadata: {
              source: 'perplexity_finra',
              raw_response: content,
              data_quality: 'real',
            },
            created_at: new Date().toISOString(),
          });
        } else {
          console.log(`Failed to fetch short interest for ${ticker}: ${response.status}`);
        }

        // Reduced rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Error fetching short interest for ${ticker}:`, err);
      }
    }

    if (shortData.length > 0) {
      const { error } = await supabase
        .from('short_interest')
        .insert(shortData);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      console.log(`Inserted ${shortData.length} real short interest records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: shortData.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-short-interest:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});