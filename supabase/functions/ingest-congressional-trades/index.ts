import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting congressional trades ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch from House Stock Watcher API (free public API)
    const response = await fetch('https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch congressional trades: ${response.status}`);
    }

    const trades = await response.json();
    console.log(`Fetched ${trades.length} congressional trades`);

    // Parse and transform the data
    const records = trades.slice(0, 1000).map((trade: any) => ({
      representative: trade.representative || 'Unknown',
      ticker: trade.ticker || 'N/A',
      transaction_date: trade.transaction_date || new Date().toISOString().split('T')[0],
      filed_date: trade.disclosure_date || new Date().toISOString().split('T')[0],
      transaction_type: trade.type || 'unknown',
      amount_min: trade.amount ? parseFloat(trade.amount.split('-')[0].replace(/[^0-9.]/g, '')) : null,
      amount_max: trade.amount ? parseFloat(trade.amount.split('-')[1]?.replace(/[^0-9.]/g, '') || trade.amount.replace(/[^0-9.]/g, '')) : null,
      party: trade.party || null,
      chamber: trade.chamber || null,
      metadata: {
        asset_description: trade.asset_description,
        ptr_link: trade.ptr_link,
      },
      created_at: new Date().toISOString(),
    })).filter((r: any) => r.ticker && r.ticker !== 'N/A' && r.ticker !== '--');

    // Insert into database
    if (records.length > 0) {
      const { error } = await supabase
        .from('congressional_trades')
        .upsert(records, { 
          onConflict: 'representative,ticker,transaction_date',
          ignoreDuplicates: true 
        });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${records.length} congressional trade records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: records.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-congressional-trades:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
