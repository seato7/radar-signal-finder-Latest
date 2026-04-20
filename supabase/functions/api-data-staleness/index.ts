// redeployed 2026-03-17
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * API Data Staleness Monitor
 * 
 * SLA: All tickers must have data ≤5 seconds old
 * 
 * Endpoints:
 * - GET / → All stale tickers across all asset classes
 * - GET /?asset_class=crypto → Stale tickers for specific asset class
 * - GET /?ticker=BTC/USD → Staleness status for specific ticker
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const url = new URL(req.url);
    const assetClass = url.searchParams.get('asset_class');
    const ticker = url.searchParams.get('ticker');

    // Query specific ticker
    if (ticker) {
      const staleness = await checkTickerStaleness(supabaseClient, ticker);
      return new Response(JSON.stringify(staleness), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Query all stale tickers (optionally filtered by asset class)
    const { data: staleTickers, error } = await supabaseClient
      .rpc('get_stale_tickers', { 
        p_asset_class: assetClass 
      });

    if (error) {
      throw error;
    }

    // Group by asset class
    const byAssetClass: Record<string, any[]> = {};
    (staleTickers || []).forEach((row: any) => {
      if (!byAssetClass[row.asset_class]) {
        byAssetClass[row.asset_class] = [];
      }
      byAssetClass[row.asset_class].push({
        ticker: row.ticker,
        table: row.table_name,
        last_updated_at: row.last_updated_at,
        seconds_stale: parseFloat(row.seconds_stale.toFixed(2)),
        sla_violated: row.seconds_stale > 5
      });
    });

    // Calculate metrics
    const totalStale = staleTickers?.length || 0;
    const slaViolations = (staleTickers || []).filter((t: any) => t.seconds_stale > 5).length;
    const maxStaleness = staleTickers?.length ? Math.max(...staleTickers.map((t: any) => t.seconds_stale || 0)) : 0;

    const summary = {
      timestamp: new Date().toISOString(),
      sla_status: totalStale === 0 ? 'healthy' : 'degraded',
      total_stale_tickers: totalStale,
      sla_violations: slaViolations,
      max_staleness_seconds: parseFloat(maxStaleness.toFixed(2)),
      by_asset_class: Object.keys(byAssetClass).map(ac => ({
        asset_class: ac,
        stale_count: byAssetClass[ac].length,
        tickers: byAssetClass[ac]
      }))
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: totalStale > 0 ? 503 : 200
    });

  } catch (error) {
    console.error('Error checking data staleness:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

/**
 * Check staleness for a specific ticker across all tables
 */
async function checkTickerStaleness(supabaseClient: any, ticker: string) {
  const tables = [
    'prices',
    'forex_sentiment', 
    'crypto_onchain_metrics',
    'news_sentiment_aggregate',
    'advanced_technicals',
    'economic_indicators'
  ];

  const results = await Promise.all(
    tables.map(async (table) => {
      const { data, error } = await supabaseClient
        .from(table)
        .select('ticker, last_updated_at')
        .eq('ticker', ticker)
        .order('last_updated_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        return null;
      }

      const row = data[0];
      const ageSeconds = (Date.now() - new Date(row.last_updated_at).getTime()) / 1000;

      return {
        table,
        last_updated_at: row.last_updated_at,
        age_seconds: parseFloat(ageSeconds.toFixed(2)),
        is_stale: ageSeconds > 5,
        sla_violated: ageSeconds > 5
      };
    })
  );

  const validResults = results.filter(r => r !== null);

  return {
    ticker,
    timestamp: new Date().toISOString(),
    tables_checked: validResults.length,
    sla_status: validResults.every(r => !r?.sla_violated) ? 'healthy' : 'degraded',
    data: validResults
  };
}
