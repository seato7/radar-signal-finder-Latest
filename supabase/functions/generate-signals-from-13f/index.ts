import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    console.log('[SIGNAL-GEN-13F] Starting 13F holdings signal generation...');

    // Fetch recent holdings with tickers
    const { data: holdings, error: holdingsError } = await supabaseClient
      .from('holdings_13f')
      .select('*')
      .not('ticker', 'is', null)
      .gte('filing_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('filing_date', { ascending: false });

    if (holdingsError) throw holdingsError;

    console.log(`[SIGNAL-GEN-13F] Found ${holdings?.length || 0} 13F holdings with tickers`);

    if (!holdings || holdings.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-13f',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No 13F holdings to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get unique tickers and find matching assets
    const tickers = [...new Set(holdings.map(h => h.ticker).filter(Boolean))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Check existing signals to avoid duplicates
    const { data: existingSignals } = await supabaseClient
      .from('signals')
      .select('checksum')
      .eq('signal_type', 'institutional_13f');
    
    const existingChecksums = new Set(existingSignals?.map(s => s.checksum) || []);

    const signals = [];
    let skipped = 0;
    
    for (const holding of holdings) {
      if (!holding.ticker) continue;
      
      const assetId = tickerToAssetId.get(holding.ticker);
      if (!assetId) continue;

      // Use actual column names from holdings_13f
      const sharesChange = holding.change_shares || 0;
      const changeType = holding.change_type || 'unchanged';
      
      // Determine signal type based on change_type
      let signalType = 'bigmoney_hold';
      if (changeType === 'new') signalType = 'bigmoney_hold_new';
      else if (changeType === 'increase') signalType = 'bigmoney_hold_increase';
      else if (changeType === 'decrease') signalType = 'bigmoney_hold_decrease';
      else if (changeType === 'exit') signalType = 'bigmoney_hold_exit';
      
      const direction = sharesChange > 0 ? 'up' : sharesChange < 0 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(holding.value || 0) / 1000000000); // Normalize by $1B

      const checksum = `13f_${holding.manager_cik}_${holding.cusip}_${holding.period_of_report}`;
      
      // Skip if already exists
      if (existingChecksums.has(checksum)) {
        skipped++;
        continue;
      }

      const valueInMillions = (holding.value / 1000).toFixed(1);
      const sharesInThousands = (holding.shares / 1000).toFixed(0);
      
      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: new Date(holding.filing_date).toISOString(),
        value_text: `${holding.manager_name}: ${sharesInThousands}K shares ($${valueInMillions}M)`,
        checksum,
        citation: {
          source: `SEC 13F-HR: ${holding.manager_name}`,
          url: holding.source_url,
          timestamp: new Date().toISOString()
        },
        raw: {
          manager_name: holding.manager_name,
          manager_cik: holding.manager_cik,
          cusip: holding.cusip,
          company_name: holding.company_name,
          shares: holding.shares,
          value: holding.value,
          change_shares: sharesChange,
          change_pct: holding.change_pct,
          change_type: changeType,
          period_of_report: holding.period_of_report,
          filing_date: holding.filing_date
        }
      });
    }

    console.log(`[SIGNAL-GEN-13F] Prepared ${signals.length} signals, skipping ${skipped} duplicates`);

    if (signals.length > 0) {
      // Insert in batches to avoid timeout
      const batchSize = 500;
      let inserted = 0;
      
      for (let i = 0; i < signals.length; i += batchSize) {
        const batch = signals.slice(i, i + batchSize);
        const { error: insertError } = await supabaseClient
          .from('signals')
          .insert(batch);

        if (insertError) {
          console.error('[SIGNAL-GEN-13F] Insert error:', insertError);
          throw insertError;
        }
        inserted += batch.length;
        console.log(`[SIGNAL-GEN-13F] Inserted batch ${Math.floor(i/batchSize) + 1}: ${inserted}/${signals.length}`);
      }
    }

    console.log(`[SIGNAL-GEN-13F] ✅ Created ${signals.length} institutional 13F signals`);

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-13f',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: signals.length,
    });

    return new Response(JSON.stringify({ 
      success: true,
      holdings_processed: holdings.length,
      signals_created: signals.length,
      signals_skipped: skipped,
      assets_matched: tickerToAssetId.size
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-13F] ❌ Error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-13f',
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
