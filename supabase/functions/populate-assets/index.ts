import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
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

    console.log('[POPULATE-ASSETS] Starting comprehensive asset population...');

    // S&P 500 Top Holdings + Growth Leaders (100 stocks)
    const sp500Stocks = [
      // Top 20 by market cap
      { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'GOOGL', name: 'Alphabet Inc. Class A', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'LLY', name: 'Eli Lilly and Company', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'V', name: 'Visa Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'UNH', name: 'UnitedHealth Group Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'MA', name: 'Mastercard Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'PG', name: 'Procter & Gamble Co.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'AVGO', name: 'Broadcom Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'HD', name: 'The Home Depot Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'CVX', name: 'Chevron Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'MRK', name: 'Merck & Co. Inc.', exchange: 'NYSE', asset_class: 'stock' },
      
      // Tech giants & semiconductors
      { ticker: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'ADBE', name: 'Adobe Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'CRM', name: 'Salesforce Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'QCOM', name: 'QUALCOMM Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'TXN', name: 'Texas Instruments Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'AMAT', name: 'Applied Materials Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'MU', name: 'Micron Technology Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'LRCX', name: 'Lam Research Corporation', exchange: 'NASDAQ', asset_class: 'stock' },
      
      // AI & Cloud
      { ticker: 'PLTR', name: 'Palantir Technologies Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'SNOW', name: 'Snowflake Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'NOW', name: 'ServiceNow Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'PANW', name: 'Palo Alto Networks Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'CRWD', name: 'CrowdStrike Holdings Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'ZS', name: 'Zscaler Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      
      // Streaming & Entertainment
      { ticker: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'DIS', name: 'The Walt Disney Company', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'CMCSA', name: 'Comcast Corporation', exchange: 'NASDAQ', asset_class: 'stock' },
      
      // E-commerce & Retail
      { ticker: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'COST', name: 'Costco Wholesale Corporation', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'TGT', name: 'Target Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'SHOP', name: 'Shopify Inc.', exchange: 'NYSE', asset_class: 'stock' },
      
      // Financial services
      { ticker: 'BAC', name: 'Bank of America Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'WFC', name: 'Wells Fargo & Company', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'C', name: 'Citigroup Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'GS', name: 'The Goldman Sachs Group Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'MS', name: 'Morgan Stanley', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'BLK', name: 'BlackRock Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'SCHW', name: 'The Charles Schwab Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'AXP', name: 'American Express Company', exchange: 'NYSE', asset_class: 'stock' },
      
      // Healthcare & Pharma
      { ticker: 'ABBV', name: 'AbbVie Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'PFE', name: 'Pfizer Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'TMO', name: 'Thermo Fisher Scientific Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'ABT', name: 'Abbott Laboratories', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'DHR', name: 'Danaher Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'BMY', name: 'Bristol-Myers Squibb Company', exchange: 'NYSE', asset_class: 'stock' },
      
      // Industrial & Manufacturing
      { ticker: 'BA', name: 'The Boeing Company', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'CAT', name: 'Caterpillar Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'GE', name: 'General Electric Company', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'HON', name: 'Honeywell International Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'RTX', name: 'RTX Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'LMT', name: 'Lockheed Martin Corporation', exchange: 'NYSE', asset_class: 'stock' },
      
      // Energy
      { ticker: 'COP', name: 'ConocoPhillips', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'SLB', name: 'Schlumberger Limited', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'EOG', name: 'EOG Resources Inc.', exchange: 'NYSE', asset_class: 'stock' },
      
      // Consumer goods
      { ticker: 'PEP', name: 'PepsiCo Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'KO', name: 'The Coca-Cola Company', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'NKE', name: 'NIKE Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'MCD', name: 'McDonald\'s Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'SBUX', name: 'Starbucks Corporation', exchange: 'NASDAQ', asset_class: 'stock' },
      
      // Telecom
      { ticker: 'T', name: 'AT&T Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'VZ', name: 'Verizon Communications Inc.', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'TMUS', name: 'T-Mobile US Inc.', exchange: 'NASDAQ', asset_class: 'stock' },
      
      // Real Estate & Utilities
      { ticker: 'AMT', name: 'American Tower Corporation', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'NEE', name: 'NextEra Energy Inc.', exchange: 'NYSE', asset_class: 'stock' },
      
      // ETFs
      { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', asset_class: 'stock' },
      { ticker: 'IWM', name: 'iShares Russell 2000 ETF', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLK', name: 'Technology Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLF', name: 'Financial Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLE', name: 'Energy Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLV', name: 'Health Care Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLI', name: 'Industrial Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLC', name: 'Communication Services Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLU', name: 'Utilities Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
      { ticker: 'XLB', name: 'Materials Select Sector SPDR Fund', exchange: 'NYSE', asset_class: 'stock' },
    ];

    // Top 50 Cryptocurrencies by market cap
    const cryptoAssets = [
      { ticker: 'BTC/USD', name: 'Bitcoin / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ETH/USD', name: 'Ethereum / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'BNB/USD', name: 'Binance Coin / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'XRP/USD', name: 'Ripple / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'SOL/USD', name: 'Solana / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ADA/USD', name: 'Cardano / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'DOGE/USD', name: 'Dogecoin / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'TRX/USD', name: 'TRON / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'AVAX/USD', name: 'Avalanche / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'DOT/USD', name: 'Polkadot / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'MATIC/USD', name: 'Polygon / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'LTC/USD', name: 'Litecoin / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'LINK/USD', name: 'Chainlink / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'UNI/USD', name: 'Uniswap / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ATOM/USD', name: 'Cosmos / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'XLM/USD', name: 'Stellar / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ALGO/USD', name: 'Algorand / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'VET/USD', name: 'VeChain / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'FIL/USD', name: 'Filecoin / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'NEAR/USD', name: 'NEAR Protocol / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'APT/USD', name: 'Aptos / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'OP/USD', name: 'Optimism / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ARB/USD', name: 'Arbitrum / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'IMX/USD', name: 'Immutable X / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'SAND/USD', name: 'The Sandbox / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'MANA/USD', name: 'Decentraland / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'AXS/USD', name: 'Axie Infinity / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'GALA/USD', name: 'Gala / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'APE/USD', name: 'ApeCoin / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'LDO/USD', name: 'Lido DAO / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'CRV/USD', name: 'Curve DAO Token / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'MKR/USD', name: 'Maker / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'AAVE/USD', name: 'Aave / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'SNX/USD', name: 'Synthetix / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'COMP/USD', name: 'Compound / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'SUSHI/USD', name: 'SushiSwap / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'YFI/USD', name: 'yearn.finance / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: '1INCH/USD', name: '1inch / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ENJ/USD', name: 'Enjin Coin / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'BAT/USD', name: 'Basic Attention Token / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ZRX/USD', name: '0x / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'RUNE/USD', name: 'THORChain / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'FTM/USD', name: 'Fantom / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ONE/USD', name: 'Harmony / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ZIL/USD', name: 'Zilliqa / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ICX/USD', name: 'ICON / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'WAVES/USD', name: 'Waves / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'KAVA/USD', name: 'Kava / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'CELO/USD', name: 'Celo / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'SHIB/USD', name: 'Shiba Inu / US Dollar', exchange: 'CRYPTO', asset_class: 'crypto' },
      // Euro pairs for European market
      { ticker: 'BTC/EUR', name: 'Bitcoin / Euro', exchange: 'CRYPTO', asset_class: 'crypto' },
      { ticker: 'ETH/EUR', name: 'Ethereum / Euro', exchange: 'CRYPTO', asset_class: 'crypto' },
    ];

    // Major Forex Pairs
    const forexPairs = [
      { ticker: 'EUR/USD', name: 'Euro / US Dollar', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'GBP/USD', name: 'British Pound / US Dollar', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'USD/JPY', name: 'US Dollar / Japanese Yen', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'USD/CHF', name: 'US Dollar / Swiss Franc', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'USD/CAD', name: 'US Dollar / Canadian Dollar', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'AUD/USD', name: 'Australian Dollar / US Dollar', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'NZD/USD', name: 'New Zealand Dollar / US Dollar', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'EUR/GBP', name: 'Euro / British Pound', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'EUR/JPY', name: 'Euro / Japanese Yen', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'GBP/JPY', name: 'British Pound / Japanese Yen', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'EUR/CHF', name: 'Euro / Swiss Franc', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'EUR/AUD', name: 'Euro / Australian Dollar', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'GBP/CHF', name: 'British Pound / Swiss Franc', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'AUD/JPY', name: 'Australian Dollar / Japanese Yen', exchange: 'FOREX', asset_class: 'forex' },
      { ticker: 'NZD/JPY', name: 'New Zealand Dollar / Japanese Yen', exchange: 'FOREX', asset_class: 'forex' },
    ];

    // Major Commodities
    const commodities = [
      { ticker: 'XAUUSD', name: 'Gold Spot / US Dollar', exchange: 'COMMODITY', asset_class: 'commodity' },
      { ticker: 'XAGUSD', name: 'Silver Spot / US Dollar', exchange: 'COMMODITY', asset_class: 'commodity' },
      { ticker: 'CRUDE', name: 'Crude Oil WTI', exchange: 'COMMODITY', asset_class: 'commodity' },
      { ticker: 'BRENT', name: 'Brent Crude Oil', exchange: 'COMMODITY', asset_class: 'commodity' },
      { ticker: 'NATGAS', name: 'Natural Gas', exchange: 'COMMODITY', asset_class: 'commodity' },
      { ticker: 'COPPER', name: 'Copper Futures', exchange: 'COMMODITY', asset_class: 'commodity' },
      { ticker: 'PLATINUM', name: 'Platinum Futures', exchange: 'COMMODITY', asset_class: 'commodity' },
      { ticker: 'PALLADIUM', name: 'Palladium Futures', exchange: 'COMMODITY', asset_class: 'commodity' },
    ];

    const allAssets = [...sp500Stocks, ...cryptoAssets, ...forexPairs, ...commodities];
    
    let inserted = 0;
    let skipped = 0;

    for (const asset of allAssets) {
      // Check if already exists
      const { data: existing } = await supabaseClient
        .from('assets')
        .select('ticker')
        .eq('ticker', asset.ticker)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Insert new asset
      const { error } = await supabaseClient
        .from('assets')
        .insert({
          ticker: asset.ticker,
          name: asset.name,
          exchange: asset.exchange,
          asset_class: asset.asset_class,
          metadata: {}
        });

      if (error) {
        console.error(`Error inserting ${asset.ticker}:`, error);
      } else {
        inserted++;
      }
    }

    console.log(`[POPULATE-ASSETS] Complete. Inserted: ${inserted}, Skipped: ${skipped}`);

    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'populate-assets',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: duration,
      source_used: 'comprehensive_list',
      metadata: { 
        total_assets: allAssets.length,
        stocks: sp500Stocks.length,
        crypto: cryptoAssets.length,
        forex: forexPairs.length,
        commodities: commodities.length
      }
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Asset population complete`,
      inserted,
      skipped,
      total: allAssets.length,
      breakdown: {
        stocks: sp500Stocks.length,
        crypto: cryptoAssets.length,
        forex: forexPairs.length,
        commodities: commodities.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[POPULATE-ASSETS] Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'populate-assets',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : String(error),
      source_used: 'error'
    });
    
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
