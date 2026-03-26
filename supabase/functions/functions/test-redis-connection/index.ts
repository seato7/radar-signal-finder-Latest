import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

    if (!redisUrl || !redisToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Redis credentials',
          details: {
            hasUrl: !!redisUrl,
            hasToken: !!redisToken,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Testing Redis connection...');
    console.log('URL:', redisUrl.substring(0, 30) + '...');

    // Test 1: SET a test key
    const setResponse = await fetch(`${redisUrl}/set/lovable-test-key/hello-world`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    });

    const setData = await setResponse.json();
    console.log('SET response:', setResponse.status, setData);

    if (!setResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to SET test key',
          status: setResponse.status,
          response: setData,
          url: redisUrl.substring(0, 30) + '...',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test 2: GET the test key
    const getResponse = await fetch(`${redisUrl}/get/lovable-test-key`, {
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    });

    const getData = await getResponse.json();
    console.log('GET response:', getResponse.status, getData);

    if (!getResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to GET test key',
          status: getResponse.status,
          response: getData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test 3: DELETE the test key
    const delResponse = await fetch(`${redisUrl}/del/lovable-test-key`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    });

    const delData = await delResponse.json();
    console.log('DEL response:', delResponse.status, delData);

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Redis connection validated successfully',
        tests: {
          set: { status: setResponse.status, result: setData },
          get: { status: getResponse.status, result: getData },
          del: { status: delResponse.status, result: delData },
        },
        config: {
          url: redisUrl.substring(0, 30) + '...',
          tokenLength: redisToken.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Redis test error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        stack: errorStack,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
