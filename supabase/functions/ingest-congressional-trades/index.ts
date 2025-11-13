import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

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

    console.log(`Starting congressional trades ingestion for user ${user.id}...`);
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');

    if (!perplexityKey) {
      console.log('Perplexity API key not configured');
      return new Response(
        JSON.stringify({ error: 'Perplexity API key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching recent congressional trades via Perplexity...');
    
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
          content: 'You are a congressional trading data provider. Return only the requested data in the exact format specified.'
        }, {
          role: 'user',
          content: `Get 10 most recent congressional stock trades from Senate/House disclosures. For each trade provide: REPRESENTATIVE: (full name), TICKER: (stock symbol), TYPE: (buy or sell), DATE: (transaction date YYYY-MM-DD), AMOUNT_MIN: (minimum dollar amount), AMOUNT_MAX: (maximum dollar amount), PARTY: (Democrat or Republican). Use real current data from congressional disclosure reports.`
        }],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    const records = [];

    if (response.ok) {
      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || '';
      
      console.log('Perplexity response:', content);
      
      const lines = content.split('\n');
      let currentTrade: any = {};
      
      for (const line of lines) {
        const repMatch = line.match(/REPRESENTATIVE:\s*(.+)/i);
        const tickerMatch = line.match(/TICKER:\s*([A-Z]+)/i);
        const typeMatch = line.match(/TYPE:\s*(buy|sell)/i);
        const dateMatch = line.match(/DATE:\s*(\d{4}-\d{2}-\d{2})/i);
        const minMatch = line.match(/AMOUNT_MIN:\s*\$?([\d,]+)/i);
        const maxMatch = line.match(/AMOUNT_MAX:\s*\$?([\d,]+)/i);
        const partyMatch = line.match(/PARTY:\s*(Democrat|Republican)/i);
        
        if (repMatch) {
          if (currentTrade.representative && currentTrade.ticker) {
            records.push({
              ticker: currentTrade.ticker,
              representative: currentTrade.representative,
              party: currentTrade.party || 'Unknown',
              transaction_type: currentTrade.transaction_type || 'buy',
              transaction_date: currentTrade.transaction_date || new Date().toISOString().split('T')[0],
              filed_date: currentTrade.transaction_date || new Date().toISOString().split('T')[0],
              amount_min: currentTrade.amount_min || null,
              amount_max: currentTrade.amount_max || null,
              metadata: {
                data_source: 'perplexity_congressional',
              },
              created_at: new Date().toISOString(),
            });
          }
          currentTrade = { representative: repMatch[1].trim() };
        }
        if (tickerMatch) currentTrade.ticker = tickerMatch[1];
        if (typeMatch) currentTrade.transaction_type = typeMatch[1].toLowerCase();
        if (dateMatch) currentTrade.transaction_date = dateMatch[1];
        if (minMatch) currentTrade.amount_min = parseInt(minMatch[1].replace(/,/g, ''));
        if (maxMatch) currentTrade.amount_max = parseInt(maxMatch[1].replace(/,/g, ''));
        if (partyMatch) currentTrade.party = partyMatch[1];
      }
      
      // Add last trade
      if (currentTrade.representative && currentTrade.ticker) {
        records.push({
          ticker: currentTrade.ticker,
          representative: currentTrade.representative,
          party: currentTrade.party || 'Unknown',
          transaction_type: currentTrade.transaction_type || 'buy',
          transaction_date: currentTrade.transaction_date || new Date().toISOString().split('T')[0],
          filed_date: currentTrade.transaction_date || new Date().toISOString().split('T')[0],
          amount_min: currentTrade.amount_min || null,
          amount_max: currentTrade.amount_max || null,
          metadata: {
            data_source: 'perplexity_congressional',
          },
          created_at: new Date().toISOString(),
        });
      }
    }

    if (records.length > 0) {
      const { error } = await supabase
        .from('congressional_trades')
        .insert(records);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${records.length} congressional trade records`);
    }

    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'success',
      rows_inserted: records.length,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity AI',
    });

    return new Response(
      JSON.stringify({ success: true, count: records.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-congressional-trades:', error);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity AI',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
