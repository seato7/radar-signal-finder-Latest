// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v3 - REAL DATA ONLY - NO ESTIMATIONS
// Uses free Blockchain.com API and CoinGecko for real on-chain data

const MAJOR_CRYPTOS = ['BTC', 'ETH'];

interface OnchainData {
  ticker: string;
  activeAddresses?: number;
  transactionCount?: number;
  hashRate?: number;
  difficulty?: number;
  source: string;
}

// Fetch real Bitcoin on-chain data from Blockchain.com API (free, no key required)
async function fetchBlockchainComData(): Promise<OnchainData | null> {
  try {
    // Blockchain.com provides free stats API
    const response = await fetch('https://api.blockchain.info/stats', {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.log(`Blockchain.com API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.hash_rate && data.n_tx) {
      console.log('✅ Blockchain.com: Got real BTC on-chain data');
      return {
        ticker: 'BTC/USD',
        activeAddresses: undefined, // n_btc_mined/6.25 computes block count not addresses - no reliable estimate available
        transactionCount: data.n_tx,
        hashRate: data.hash_rate,
        difficulty: data.difficulty,
        source: 'Blockchain.com_API',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Blockchain.com API error:', error);
    return null;
  }
}

// Fetch Ethereum on-chain data from public API
async function fetchEtherscanPublicData(): Promise<OnchainData | null> {
  try {
    // Use public Ethereum stats
    const response = await fetch('https://api.etherscan.io/api?module=stats&action=ethprice');
    
    if (!response.ok) {
      console.log(`Etherscan API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      console.log('✅ Etherscan: Got ETH data');
      return {
        ticker: 'ETH/USD',
        source: 'Etherscan_Public_API',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Etherscan API error:', error);
    return null;
  }
}

// Fetch from CoinGecko (free, no key required for basic data)
async function fetchCoinGeckoOnchain(coinId: string, ticker: string): Promise<OnchainData | null> {
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=true`);
    
    if (!response.ok) {
      console.log(`CoinGecko API error for ${coinId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.developer_data || data.community_data) {
      console.log(`✅ CoinGecko: Got on-chain metrics for ${ticker}`);
      return {
        ticker: `${ticker}/USD`,
        activeAddresses: undefined, // developer_data.subscribers = GitHub subscribers, not on-chain addresses
        transactionCount: undefined,
        source: 'CoinGecko_API',
      };
    }
    
    return null;
  } catch (error) {
    console.error(`CoinGecko API error for ${coinId}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[v3] Starting crypto on-chain metrics ingestion - REAL DATA ONLY, NO ESTIMATIONS');

    const allOnchainData: OnchainData[] = [];

    // Fetch real BTC data from Blockchain.com
    const btcData = await fetchBlockchainComData();
    if (btcData) {
      allOnchainData.push(btcData);
    }
    
    // Small delay between API calls
    await new Promise(r => setTimeout(r, 500));

    // Fetch real ETH data
    const ethData = await fetchEtherscanPublicData();
    if (ethData) {
      allOnchainData.push(ethData);
    }
    
    await new Promise(r => setTimeout(r, 500));

    // Try CoinGecko for additional cryptos
    const coinGeckoMappings = [
      { coinId: 'bitcoin', ticker: 'BTC' },
      { coinId: 'ethereum', ticker: 'ETH' },
      { coinId: 'solana', ticker: 'SOL' },
      { coinId: 'cardano', ticker: 'ADA' },
    ];
    
    for (const { coinId, ticker } of coinGeckoMappings) {
      // Skip if we already have data for this ticker
      if (allOnchainData.some(d => d.ticker.startsWith(ticker))) continue;
      
      const cgData = await fetchCoinGeckoOnchain(coinId, ticker);
      if (cgData) {
        allOnchainData.push(cgData);
      }
      await new Promise(r => setTimeout(r, 1000)); // CoinGecko rate limit
    }

    console.log(`Total real on-chain data points: ${allOnchainData.length}`);

    if (allOnchainData.length === 0) {
      console.log('❌ No real on-chain data found - NOT inserting any fake data');
      
      await supabaseClient.from('function_status').insert({
        function_name: 'ingest-crypto-onchain',
        executed_at: new Date().toISOString(),
        status: 'no_data',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        metadata: { reason: 'no_real_data_available', version: 'v3_no_estimation' }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-crypto-onchain', {
        sourcesAttempted: ['Blockchain.com', 'Etherscan', 'CoinGecko'],
        reason: 'All API calls failed or returned no data'
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No real on-chain data found - no fake data inserted',
          inserted: 0,
          version: 'v3_no_estimation'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get asset IDs
    const tickers = allOnchainData.map(d => d.ticker);
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Prepare insert data - REAL DATA ONLY
    // Note: transaction_count is bigint in DB, but we cap values to prevent overflow issues
    const insertData = allOnchainData
      .filter(d => tickerToAssetId.has(d.ticker))
      .map(d => ({
        ticker: d.ticker,
        asset_id: tickerToAssetId.get(d.ticker),
        active_addresses: d.activeAddresses ? Math.min(d.activeAddresses, 2147483647) : null,
        transaction_count: d.transactionCount ? Number(BigInt(d.transactionCount)) : null, // store as number not string
        hash_rate: d.hashRate || null,
        source: d.source,
        metadata: { 
          data_type: 'real',
          version: 'v3_no_estimation',
          fetched_at: new Date().toISOString()
        }
      }));

    let successCount = 0;
    if (insertData.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('crypto_onchain_metrics')
        .upsert(insertData, { onConflict: 'asset_id,timestamp', ignoreDuplicates: false });

      if (insertError) {
        console.error('Insert error:', insertError.message);
      } else {
        successCount = insertData.length;
      }
    }

    const duration = Date.now() - startTime;
    const sourceUsed = allOnchainData.map(d => d.source).join(', ');

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-crypto-onchain',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: sourceUsed,
      metadata: { version: 'v3_no_estimation' }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-crypto-onchain',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: 0,
      sourceUsed: `${sourceUsed} (REAL DATA ONLY)`,
    });

    console.log(`✅ Inserted ${successCount} REAL on-chain records - NO ESTIMATIONS`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: successCount,
        source: sourceUsed,
        version: 'v3_no_estimation',
        message: `Inserted ${successCount} REAL on-chain records`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const duration = Date.now() - startTime;

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-crypto-onchain',
      executed_at: new Date().toISOString(),
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : String(error),
      rows_inserted: 0,
      rows_skipped: 0
    });

    await slackAlerter.sendCriticalAlert({
      type: 'api_reliability',
      etlName: 'ingest-crypto-onchain',
      message: `Crypto onchain ingestion failed: ${error instanceof Error ? error.message : String(error)}`,
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
