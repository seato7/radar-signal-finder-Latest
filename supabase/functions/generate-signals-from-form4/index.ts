import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-FORM4] Starting Form 4 insider signal generation...');

    const { data: filings, error: filingsError } = await supabaseClient
      .from('form4_insider_trades')
      .select('*')
      .gte('transaction_date', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
      .order('transaction_date', { ascending: false });

    if (filingsError) throw filingsError;

    console.log(`[SIGNAL-GEN-FORM4] Found ${filings?.length || 0} Form 4 filings`);

    if (!filings || filings.length === 0) {
      const duration = Date.now() - startTime;
      
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-form4',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'form4_insider_trades',
      });
      
      return new Response(JSON.stringify({ message: 'No Form 4 filings to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(filings.map(f => f.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const filing of filings) {
      const assetId = tickerToAssetId.get(filing.ticker);
      if (!assetId) continue;

      const transactionValue = (filing.transaction_shares || 0) * (filing.price_per_share || 0);
      const isBuy = filing.transaction_type?.toLowerCase().includes('purchase') || 
                    filing.transaction_type?.toLowerCase().includes('acquisition');
      
      const direction = isBuy ? 'up' : 'down';
      const magnitude = Math.min(1.0, transactionValue / 10000000); // Normalize to $10M
      
      // Use specific signal types that match scoring expectations
      const signalType = isBuy ? 'insider_buy' : 'insider_sell';

      const signalData = {
        ticker: filing.ticker,
        signal_type: signalType,
        transaction_date: filing.transaction_date,
        transaction_value: transactionValue
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: new Date(filing.transaction_date).toISOString(),
        value_text: `${filing.insider_name} (${filing.insider_title}): ${isBuy ? 'Buy' : 'Sell'} $${(transactionValue / 1000).toFixed(0)}K`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'SEC Form 4',
          timestamp: new Date().toISOString()
        },
        raw: {
          insider_name: filing.insider_name,
          insider_title: filing.insider_title,
          transaction_shares: filing.transaction_shares,
          price_per_share: filing.price_per_share,
          shares_owned_after: filing.shares_owned_after
        }
      });
    }

    // Use upsert to avoid duplicate key errors
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (insertError) {
        console.log('[SIGNAL-GEN-FORM4] Batch error (continuing):', insertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    console.log(`[SIGNAL-GEN-FORM4] ✅ Upserted ${insertedCount} insider trading signals (${signals.length - insertedCount} duplicates skipped)`);

    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-form4',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'form4_insider_trades',
    });

    return new Response(JSON.stringify({ 
      success: true,
      filings_processed: filings.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-FORM4] ❌ Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-form4',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
