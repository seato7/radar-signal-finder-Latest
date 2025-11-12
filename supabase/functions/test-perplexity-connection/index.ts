/**
 * Test Perplexity API Connection
 * Validates endpoint, headers, authentication, and HTML masquerade detection
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { testPerplexityConnection, queryPerplexity } from "../_shared/perplexity-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'PERPLEXITY_API_KEY not configured in environment',
          recommendation: 'Add PERPLEXITY_API_KEY to Supabase secrets'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('🧪 Testing Perplexity API connection...');
    console.log(`API Key length: ${perplexityApiKey.length} chars`);
    console.log(`API Key prefix: ${perplexityApiKey.substring(0, 8)}...`);

    // Test 1: Basic connectivity with simple query
    console.log('\n📝 Test 1: Simple math query');
    const test1 = await testPerplexityConnection(perplexityApiKey);
    console.log(`Result: ${test1.success ? '✅' : '❌'} ${test1.message}`);

    // Test 2: More complex query to verify model works
    console.log('\n📝 Test 2: Stock ticker query');
    let test2Result;
    try {
      test2Result = await queryPerplexity(
        'What is the current price of AAPL stock? Answer in format: price: [number]',
        perplexityApiKey,
        { maxTokens: 100 }
      );
      console.log(`Result: ✅ ${test2Result.substring(0, 100)}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.log(`Result: ❌ ${err.message}`);
      test2Result = null;
    }

    // Test 3: Verify HTML masquerade detection works
    console.log('\n📝 Test 3: HTML masquerade detection');
    const htmlDetectionWorks = test1.success && !test1.message.includes('HTML');

    // Compile results
    const allTests = {
      test1_basic_connectivity: {
        passed: test1.success,
        message: test1.message,
        details: test1.details
      },
      test2_stock_query: {
        passed: !!test2Result,
        message: test2Result ? 'Query successful' : 'Query failed',
        response: test2Result?.substring(0, 200)
      },
      test3_html_detection: {
        passed: htmlDetectionWorks,
        message: htmlDetectionWorks 
          ? 'HTML masquerade detection working' 
          : 'HTML masquerade detected or connection failed'
      }
    };

    const allPassed = Object.values(allTests).every(t => t.passed);

    console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    return new Response(
      JSON.stringify({
        success: allPassed,
        message: allPassed 
          ? '✅ Perplexity API is configured correctly' 
          : '⚠️ Perplexity API has issues',
        timestamp: new Date().toISOString(),
        tests: allTests,
        recommendations: allPassed 
          ? ['Perplexity API is ready for production use']
          : [
              !test1.success ? 'Check PERPLEXITY_API_KEY is valid at https://www.perplexity.ai/settings/api' : null,
              !test2Result ? 'Verify API key has sufficient quota and permissions' : null,
              !htmlDetectionWorks ? 'Check endpoint is https://api.perplexity.ai (not www.perplexity.ai)' : null
            ].filter(Boolean)
      }, null, 2),
      {
        status: allPassed ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Test suite error:', err);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Test suite encountered an error',
        error: err.message,
        timestamp: new Date().toISOString()
      }, null, 2),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
