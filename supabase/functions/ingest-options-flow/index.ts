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
    console.log('Starting options flow ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate realistic mock options flow data
    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
    const optionsFlow = [];
    
    const flowTypes = ['sweep', 'block', 'split'];
    const optionTypes = ['call', 'put'];

    for (const ticker of tickers) {
      // Generate 2-5 flow signals per ticker
      const count = Math.floor(Math.random() * 4) + 2;
      
      for (let i = 0; i < count; i++) {
        const isCall = Math.random() > 0.4; // 60% calls, 40% puts
        const flowType = flowTypes[Math.floor(Math.random() * flowTypes.length)];
        
        // Generate expiration date (1-90 days out)
        const daysOut = Math.floor(Math.random() * 90) + 1;
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + daysOut);
        
        // Generate strike price around current "price"
        const basePrice = 100 + Math.random() * 400;
        const strikePrice = Math.round((basePrice + (Math.random() - 0.5) * 50) * 100) / 100;
        
        // Generate premium (larger for longer dated and OTM options)
        const premium = Math.floor(Math.random() * 5000000) + 100000;
        
        optionsFlow.push({
          ticker,
          option_type: isCall ? 'call' : 'put',
          strike_price: strikePrice,
          expiration_date: expirationDate.toISOString().split('T')[0],
          premium,
          volume: Math.floor(Math.random() * 5000) + 100,
          open_interest: Math.floor(Math.random() * 10000) + 500,
          implied_volatility: Math.round((Math.random() * 0.5 + 0.2) * 100) / 100,
          flow_type: flowType,
          sentiment: isCall ? 'bullish' : 'bearish',
          trade_date: new Date().toISOString(),
          metadata: {
            unusual_activity: flowType === 'sweep' || premium > 1000000,
            data_source: 'mock_generator',
          },
          created_at: new Date().toISOString(),
        });
      }
    }

    if (optionsFlow.length > 0) {
      const { error } = await supabase
        .from('options_flow')
        .insert(optionsFlow);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${optionsFlow.length} options flow records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: optionsFlow.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-options-flow:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
