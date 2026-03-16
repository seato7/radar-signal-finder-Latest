/**
 * Firecrawl Scrape - Extract content from a single URL
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[firecrawl-scrape] FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    console.log(`[firecrawl-scrape] Scraping URL: ${normalizedUrl}`);

    // Add 30s timeout to prevent hanging function execution slots
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: normalizedUrl,
          formats: options?.formats || ['markdown'],
          onlyMainContent: options?.onlyMainContent ?? true,
          waitFor: options?.waitFor,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      // Differentiate error types for better error handling by callers
      const errorType = response.status === 429 ? 'rate_limit'
        : response.status === 401 ? 'auth_error'
        : response.status === 402 ? 'quota_exceeded'
        : 'request_failed';
      console.error(`[firecrawl-scrape] ${errorType}: ${data.error || response.status} (${duration}ms)`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: data.error || `Request failed with status ${response.status}`,
          error_type: errorType,
          duration_ms: duration
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[firecrawl-scrape] Success for ${normalizedUrl} (${duration}ms)`);
    
    return new Response(
      JSON.stringify({
        success: true,
        data: data.data || data,
        duration_ms: duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[firecrawl-scrape] Exception: ${errorMessage} (${duration}ms)`);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        duration_ms: duration
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
