import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwelveDataStock {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  country: string;
  type: string;
}

interface TwelveDataForex {
  symbol: string;
  currency_group: string;
  currency_base: string;
  currency_quote: string;
}

interface TwelveDataCrypto {
  symbol: string;
  available_exchanges: string[];
  currency_base: string;
  currency_quote: string;
}

interface TwelveDataCommodity {
  symbol: string;
  name: string;
  category: string;
}

interface TwelveDataETF {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('🚀 Starting Twelve Data asset sync...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const twelveDataApiKey = Deno.env.get('TWELVEDATA_API_KEY');
    if (!twelveDataApiKey) {
      throw new Error('TWELVEDATA_API_KEY not configured');
    }

    const stats = {
      stocks: { fetched: 0, inserted: 0 },
      crypto: { fetched: 0, inserted: 0 },
      forex: { fetched: 0, inserted: 0 },
      commodities: { fetched: 0, inserted: 0 },
      etfs: { fetched: 0, inserted: 0 },
    };

    // ========== FETCH STOCKS ==========
    console.log('📈 Fetching stocks from Twelve Data...');
    const stocksResponse = await fetch(
      `https://api.twelvedata.com/stocks?country=United States&type=Common Stock`
    );
    const stocksData = await stocksResponse.json();
    
    if (stocksData.data && Array.isArray(stocksData.data)) {
      const stocks: TwelveDataStock[] = stocksData.data;
      stats.stocks.fetched = stocks.length;
      console.log(`📊 Found ${stocks.length} US stocks`);

      // Include ALL USD stocks (not just NYSE/NASDAQ) for comprehensive coverage
      const usdStocks = stocks.filter(s => s.currency === 'USD');
      console.log(`📊 Filtered to ${usdStocks.length} USD stocks`);
      
      // Log exchange distribution for debugging
      const stockExchanges = new Map<string, number>();
      usdStocks.forEach(s => stockExchanges.set(s.exchange, (stockExchanges.get(s.exchange) || 0) + 1));
      console.log('📊 Stock exchanges:', Object.fromEntries(stockExchanges));

      // Filter out malformed tickers (containing special prefixes like !otc/)
      const cleanStocks = usdStocks.filter(s => {
        const ticker = s.symbol;
        // Skip tickers with special prefixes or invalid characters
        if (ticker.startsWith('!') || ticker.includes('!') || ticker.includes(':')) {
          console.log(`⚠️ Skipping malformed ticker: ${ticker}`);
          return false;
        }
        return true;
      });
      console.log(`📊 Filtered out malformed tickers: ${usdStocks.length - cleanStocks.length}`);

      // Deduplicate by symbol - same stock can appear on multiple exchanges
      const seenStockSymbols = new Set<string>();
      const uniqueStocks = cleanStocks.filter(s => {
        if (seenStockSymbols.has(s.symbol)) {
          return false;
        }
        seenStockSymbols.add(s.symbol);
        return true;
      });
      console.log(`📊 Deduplicated to ${uniqueStocks.length} unique stocks`);

      // Batch insert stocks
      const stockAssets = uniqueStocks.map(s => ({
        ticker: s.symbol,
        name: s.name,
        exchange: s.exchange,
        asset_class: 'stock',
        metadata: { 
          source: 'twelvedata', 
          type: s.type,
          country: s.country,
          currency: s.currency
        }
      }));

      if (stockAssets.length > 0) {
        // Insert in batches of 500
        for (let i = 0; i < stockAssets.length; i += 500) {
          const batch = stockAssets.slice(i, i + 500);
          const { error } = await supabase
            .from('assets')
            .upsert(batch, { onConflict: 'ticker', ignoreDuplicates: false });
          
          if (error) {
            console.error(`Error inserting stocks batch ${i / 500 + 1}:`, error.message);
          } else {
            stats.stocks.inserted += batch.length;
          }
        }
        console.log(`✅ Inserted ${stats.stocks.inserted} stocks`);
      }
    }

    // ========== FETCH FOREX ==========
    console.log('💱 Fetching forex pairs from Twelve Data...');
    const forexResponse = await fetch('https://api.twelvedata.com/forex_pairs');
    const forexData = await forexResponse.json();
    
    if (forexData.data && Array.isArray(forexData.data)) {
      const forexPairs: TwelveDataForex[] = forexData.data;
      stats.forex.fetched = forexPairs.length;
      console.log(`📊 Found ${forexPairs.length} forex pairs`);

      // Define major currencies to include all majors and crosses
      const majorCurrencies = [
        'US Dollar', 'Euro', 'British Pound', 'Japanese Yen', 'Swiss Franc',
        'Australian Dollar', 'Canadian Dollar', 'New Zealand Dollar'
      ];
      
      // Filter for pairs involving major currencies (not just USD)
      const majorPairs = forexPairs.filter(f => 
        majorCurrencies.includes(f.currency_quote) || majorCurrencies.includes(f.currency_base)
      );
      console.log(`📊 Filtered to ${majorPairs.length} major forex pairs`);

      // Deduplicate by symbol
      const seenForexSymbols = new Set<string>();
      const uniqueForex = majorPairs.filter(f => {
        if (seenForexSymbols.has(f.symbol)) {
          return false;
        }
        seenForexSymbols.add(f.symbol);
        return true;
      });
      console.log(`📊 Deduplicated to ${uniqueForex.length} unique forex pairs`);

      const forexAssets = uniqueForex.map(f => ({
        ticker: f.symbol,
        name: `${f.currency_base}/${f.currency_quote}`,
        exchange: 'Forex',
        asset_class: 'forex',
        base_currency: f.currency_base,
        quote_currency: f.currency_quote,
        metadata: { 
          source: 'twelvedata',
          currency_group: f.currency_group
        }
      }));

      if (forexAssets.length > 0) {
        const { error } = await supabase
          .from('assets')
          .upsert(forexAssets, { onConflict: 'ticker', ignoreDuplicates: false });
        
        if (error) {
          console.error('Error inserting forex:', error.message);
        } else {
          stats.forex.inserted = forexAssets.length;
          console.log(`✅ Inserted ${stats.forex.inserted} forex pairs`);
        }
      }
    }

    // ========== FETCH CRYPTO ==========
    console.log('🪙 Fetching cryptocurrencies from Twelve Data...');
    const cryptoResponse = await fetch('https://api.twelvedata.com/cryptocurrencies');
    const cryptoData = await cryptoResponse.json();
    
    if (cryptoData.data && Array.isArray(cryptoData.data)) {
      const cryptoPairs: TwelveDataCrypto[] = cryptoData.data;
      stats.crypto.fetched = cryptoPairs.length;
      console.log(`📊 Found ${cryptoPairs.length} crypto pairs`);

      // Filter for USD-quoted pairs only (handle both "US Dollar" and "USD" formats)
      const usdCrypto = cryptoPairs.filter(c => 
        c.currency_quote === 'US Dollar' || 
        c.currency_quote === 'USD' ||
        c.symbol.endsWith('/USD') ||
        c.symbol.endsWith('/USDT')
      );
      console.log(`📊 Filtered to ${usdCrypto.length} USD crypto pairs`);
      
      // Log if major pairs are present for debugging
      const hasBTC = usdCrypto.some(c => c.symbol === 'BTC/USD');
      const hasETH = usdCrypto.some(c => c.symbol === 'ETH/USD');
      console.log(`🔍 Major pairs check - BTC/USD: ${hasBTC}, ETH/USD: ${hasETH}`);

      // Deduplicate by symbol - keep the first occurrence (preferring major exchanges)
      const seenSymbols = new Set<string>();
      const uniqueCrypto = usdCrypto.filter(c => {
        if (seenSymbols.has(c.symbol)) {
          return false;
        }
        seenSymbols.add(c.symbol);
        return true;
      });
      console.log(`📊 Deduplicated to ${uniqueCrypto.length} unique crypto pairs`);

      const cryptoAssets = uniqueCrypto.map(c => ({
        ticker: c.symbol,
        name: `${c.currency_base}`,
        exchange: c.available_exchanges?.[0] || 'Crypto',
        asset_class: 'crypto',
        base_currency: c.currency_base,
        quote_currency: 'USD',
        metadata: { 
          source: 'twelvedata',
          available_exchanges: c.available_exchanges
        }
      }));

      if (cryptoAssets.length > 0) {
        // Insert in batches
        for (let i = 0; i < cryptoAssets.length; i += 500) {
          const batch = cryptoAssets.slice(i, i + 500);
          const { error } = await supabase
            .from('assets')
            .upsert(batch, { onConflict: 'ticker', ignoreDuplicates: false });
          
          if (error) {
            console.error(`Error inserting crypto batch ${i / 500 + 1}:`, error.message);
          } else {
            stats.crypto.inserted += batch.length;
          }
        }
        console.log(`✅ Inserted ${stats.crypto.inserted} crypto pairs`);
      }
    }

    // ========== FETCH COMMODITIES ==========
    console.log('🛢️ Fetching commodities from Twelve Data...');
    const commoditiesResponse = await fetch('https://api.twelvedata.com/commodities');
    const commoditiesData = await commoditiesResponse.json();
    
    if (commoditiesData.data && Array.isArray(commoditiesData.data)) {
      const commodities: TwelveDataCommodity[] = commoditiesData.data;
      stats.commodities.fetched = commodities.length;
      console.log(`📊 Found ${commodities.length} commodities`);

      const commodityAssets = commodities.map(c => ({
        ticker: c.symbol,
        name: c.name,
        exchange: 'Commodities',
        asset_class: 'commodity',
        metadata: { 
          source: 'twelvedata',
          category: c.category
        }
      }));

      if (commodityAssets.length > 0) {
        const { error } = await supabase
          .from('assets')
          .upsert(commodityAssets, { onConflict: 'ticker', ignoreDuplicates: false });
        
        if (error) {
          console.error('Error inserting commodities:', error.message);
        } else {
          stats.commodities.inserted = commodityAssets.length;
          console.log(`✅ Inserted ${stats.commodities.inserted} commodities`);
        }
      }
    }

    // ========== FETCH ETFs ==========
    console.log('📊 Fetching ETFs from Twelve Data...');
    const etfResponse = await fetch('https://api.twelvedata.com/etf?country=United States');
    const etfData = await etfResponse.json();
    
    if (etfData.data && Array.isArray(etfData.data)) {
      const etfs: TwelveDataETF[] = etfData.data;
      stats.etfs.fetched = etfs.length;
      console.log(`📊 Found ${etfs.length} US ETFs`);

      // Filter for USD ETFs on major exchanges (case-insensitive, handle variations)
      const majorEtfs = etfs.filter(e => {
        if (e.currency !== 'USD') return false;
        const ex = e.exchange?.toLowerCase() || '';
        return ex.includes('nyse') || ex.includes('nasdaq') || ex.includes('arca') || ex.includes('bats');
      });
      console.log(`📊 Filtered to ${majorEtfs.length} ETFs on major exchanges`);
      
      // Log exchange distribution for debugging
      const etfExchanges = new Map<string, number>();
      majorEtfs.forEach(e => etfExchanges.set(e.exchange, (etfExchanges.get(e.exchange) || 0) + 1));
      console.log('📊 ETF exchanges:', Object.fromEntries(etfExchanges));

      // Deduplicate by symbol - TwelveData returns same ETF from multiple exchanges
      const seenEtfSymbols = new Set<string>();
      const uniqueEtfs = majorEtfs.filter(e => {
        if (seenEtfSymbols.has(e.symbol)) {
          return false;
        }
        seenEtfSymbols.add(e.symbol);
        return true;
      });
      console.log(`📊 Deduplicated to ${uniqueEtfs.length} unique ETFs`);

      const etfAssets = uniqueEtfs.map(e => ({
        ticker: e.symbol,
        name: e.name,
        exchange: e.exchange,
        asset_class: 'etf',
        metadata: { 
          source: 'twelvedata',
          currency: e.currency
        }
      }));

      if (etfAssets.length > 0) {
        // Insert in batches
        for (let i = 0; i < etfAssets.length; i += 500) {
          const batch = etfAssets.slice(i, i + 500);
          const { error } = await supabase
            .from('assets')
            .upsert(batch, { onConflict: 'ticker', ignoreDuplicates: false });
          
          if (error) {
            console.error(`Error inserting ETF batch ${i / 500 + 1}:`, error.message);
          } else {
            stats.etfs.inserted += batch.length;
          }
        }
        console.log(`✅ Inserted ${stats.etfs.inserted} ETFs`);
      }
    }

    const duration = Date.now() - startTime;
    const totalInserted = stats.stocks.inserted + stats.crypto.inserted + 
                          stats.forex.inserted + stats.commodities.inserted + 
                          stats.etfs.inserted;

    console.log(`\n🎉 Sync complete in ${duration}ms`);
    console.log(`📊 Total assets inserted/updated: ${totalInserted}`);
    console.log(`   - Stocks: ${stats.stocks.inserted}`);
    console.log(`   - Crypto: ${stats.crypto.inserted}`);
    console.log(`   - Forex: ${stats.forex.inserted}`);
    console.log(`   - Commodities: ${stats.commodities.inserted}`);
    console.log(`   - ETFs: ${stats.etfs.inserted}`);

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'sync-twelvedata-assets',
      status: 'success',
      rows_inserted: totalInserted,
      duration_ms: duration,
      metadata: stats
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Asset sync completed',
        duration_ms: duration,
        stats
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const error = err as Error;
    console.error('❌ Error syncing assets:', error.message);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('function_status').insert({
        function_name: 'sync-twelvedata-assets',
        status: 'error',
        error_message: error.message,
        duration_ms: Date.now() - startTime
      });
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
