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
    console.log('Starting supply chain signals ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META'];
    const signalTypes = ['shipping', 'inventory', 'supplier', 'production', 'logistics'];
    const indicators = ['bullish', 'bearish', 'neutral'];
    
    const supplyChainSignals = [];

    for (const ticker of tickers) {
      // Generate 2-4 signals per ticker
      const count = Math.floor(Math.random() * 3) + 2;
      
      for (let i = 0; i < count; i++) {
        const signalType = signalTypes[Math.floor(Math.random() * signalTypes.length)];
        const changePercentage = Math.round((Math.random() * 60 - 30) * 10) / 10;
        const indicator = changePercentage > 10 ? 'bullish' : changePercentage < -10 ? 'bearish' : 'neutral';
        
        let metricName = '';
        let metricValue = 0;
        
        switch (signalType) {
          case 'shipping':
            metricName = 'container_volume';
            metricValue = Math.floor(Math.random() * 100000) + 10000;
            break;
          case 'inventory':
            metricName = 'days_of_inventory';
            metricValue = Math.floor(Math.random() * 90) + 30;
            break;
          case 'supplier':
            metricName = 'lead_time_days';
            metricValue = Math.floor(Math.random() * 60) + 14;
            break;
          case 'production':
            metricName = 'units_per_day';
            metricValue = Math.floor(Math.random() * 50000) + 5000;
            break;
          case 'logistics':
            metricName = 'delivery_rate_pct';
            metricValue = Math.round((Math.random() * 20 + 80) * 10) / 10;
            break;
        }
        
        supplyChainSignals.push({
          ticker,
          signal_type: signalType,
          metric_name: metricName,
          metric_value: metricValue,
          change_percentage: changePercentage,
          indicator,
          report_date: new Date().toISOString().split('T')[0],
          metadata: {
            data_source: 'supply_chain_monitor',
            confidence: Math.round(Math.random() * 30 + 70), // 70-100% confidence
          },
          created_at: new Date().toISOString(),
        });
      }
    }

    if (supplyChainSignals.length > 0) {
      const { error } = await supabase
        .from('supply_chain_signals')
        .insert(supplyChainSignals);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${supplyChainSignals.length} supply chain signal records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: supplyChainSignals.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-supply-chain:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
