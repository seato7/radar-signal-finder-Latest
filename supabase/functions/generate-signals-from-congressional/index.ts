import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-CONGRESSIONAL] Starting congressional trades signal generation...');

    const { data: trades, error: tradesError } = await supabaseClient
      .from('congressional_trades')
      .select('*')
      .gte('transaction_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('transaction_date', { ascending: false });

    if (tradesError) throw tradesError;

    console.log(`[SIGNAL-GEN-CONGRESSIONAL] Found ${trades?.length || 0} congressional trades`);

    if (!trades || trades.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-congressional',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No trades to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(trades.map(t => t.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const trade of trades) {
      const assetId = tickerToAssetId.get(trade.ticker);
      if (!assetId) continue;

      const isBuy = trade.transaction_type?.toLowerCase().includes('purchase') || 
                    trade.transaction_type?.toLowerCase().includes('buy');
      const signalType = isBuy ? 'politician_buy' : 'politician_sell';
      const direction = isBuy ? 'up' : 'down';

      const avgAmount = ((trade.amount_min || 0) + (trade.amount_max || 0)) / 2;
      const magnitude = Math.min(1.0, avgAmount / 100000);

      const signalData = {
        ticker: trade.ticker,
        signal_type: signalType,
        transaction_date: trade.transaction_date,
        representative: trade.representative
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: new Date(trade.transaction_date).toISOString(),
        value_text: `${trade.representative} (${trade.party}) - $${avgAmount.toLocaleString()}`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'Congressional Trading Tracker',
          timestamp: new Date().toISOString()
        },
        raw: {
          representative: trade.representative,
          party: trade.party,
          chamber: trade.chamber,
          amount_range: `$${trade.amount_min}-$${trade.amount_max}`,
          filed_date: trade.filed_date
        }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-CONGRESSIONAL] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-CONGRESSIONAL] ✅ Created ${signals.length} politician trading signals`);

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-congressional',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: signals.length,
    });

    return new Response(JSON.stringify({ 
      success: true,
      trades_processed: trades.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-CONGRESSIONAL] ❌ Error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-congressional',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
