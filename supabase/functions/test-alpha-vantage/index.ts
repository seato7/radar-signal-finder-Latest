/**
 * TEST FUNCTION: Validate Alpha Vantage API key and test live queries
 * Tests MSFT, AAPL, TSLA to verify API is working
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    const testSymbols = ['MSFT', 'AAPL', 'TSLA'];
    const results: any[] = [];

    console.log('🧪 ALPHA VANTAGE API TEST - Starting validation...');
    console.log(`API Key configured: ${apiKey ? '✅ YES' : '❌ NO'}`);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ALPHA_VANTAGE_API_KEY not configured',
          recommendation: 'Add API key in Supabase Edge Function Secrets',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Test each symbol
    for (const symbol of testSymbols) {
      console.log(`\n📊 Testing ${symbol}...`);
      const startTime = Date.now();

      try {
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
        const response = await fetch(url);
        const duration = Date.now() - startTime;
        const data = await response.json();

        const hasTimeSeries = data['Time Series (Daily)'] !== undefined;
        const hasError = data['Error Message'] !== undefined;
        const hasNote = data['Note'] !== undefined; // Rate limit message
        const hasInformation = data['Information'] !== undefined; // Premium feature message

        const result = {
          symbol,
          status_code: response.status,
          duration_ms: duration,
          has_time_series: hasTimeSeries,
          has_error: hasError,
          has_rate_limit_message: hasNote,
          has_premium_message: hasInformation,
          data_points: hasTimeSeries ? Object.keys(data['Time Series (Daily)']).length : 0,
          latest_date: hasTimeSeries ? Object.keys(data['Time Series (Daily)'])[0] : null,
          sample_price: hasTimeSeries ? data['Time Series (Daily)'][Object.keys(data['Time Series (Daily)'])[0]]['4. close'] : null,
          error_message: hasError ? data['Error Message'] : null,
          rate_limit_note: hasNote ? data['Note'] : null,
          premium_info: hasInformation ? data['Information'] : null,
          raw_response_keys: Object.keys(data),
        };

        console.log(`${symbol} result:`, JSON.stringify(result, null, 2));
        results.push(result);

        // Respect API rate limits (5 calls/min for free tier)
        if (testSymbols.indexOf(symbol) < testSymbols.length - 1) {
          console.log('⏳ Waiting 15s to respect rate limits...');
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      } catch (error) {
        console.error(`❌ ${symbol} failed:`, error);
        results.push({
          symbol,
          status_code: 0,
          error: error.message,
          success: false,
        });
      }
    }

    // Analyze results
    const successCount = results.filter(r => r.has_time_series).length;
    const rateLimitCount = results.filter(r => r.has_rate_limit_message).length;
    const errorCount = results.filter(r => r.has_error || r.error).length;

    const summary = {
      success: successCount > 0,
      api_key_valid: successCount > 0 || rateLimitCount > 0, // Key works but might be rate limited
      tested_symbols: testSymbols.length,
      successful_calls: successCount,
      rate_limited_calls: rateLimitCount,
      failed_calls: errorCount,
      recommendation: successCount === testSymbols.length 
        ? '✅ API working perfectly'
        : rateLimitCount > 0
        ? '⚠️ API key valid but rate limited (upgrade needed or wait 1 minute)'
        : errorCount > 0
        ? '❌ API key invalid or expired - replace immediately'
        : '⚠️ Unknown issue - check raw responses',
      results,
    };

    console.log('\n📊 FINAL SUMMARY:', JSON.stringify(summary, null, 2));

    return new Response(
      JSON.stringify(summary, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Test failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
