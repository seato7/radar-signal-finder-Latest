// Phase 6D: paid-tier auth gate + per-user hourly rate limit.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, verifyAuth, enforceRateLimit } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await verifyAuth(req, { requirePaid: true });
  if (!auth.ok) return auth.response;
  const rl = await enforceRateLimit(auth.admin, auth.userId, 'firecrawl-search', 20, 3600);
  if (rl) return rl;

  const startTime = Date.now();
  try {
    const { query, options } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const limit = options?.limit || 10;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query, limit,
          lang: options?.lang, country: options?.country, tbs: options?.tbs,
          scrapeOptions: options?.scrapeOptions,
        }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timeoutId); }

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorType = response.status === 429 ? 'rate_limit' : response.status === 401 ? 'auth_error' : response.status === 402 ? 'quota_exceeded' : 'request_failed';
      return new Response(JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}`, error_type: errorType, duration_ms: duration }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resultCount = data.data?.length || 0;
    return new Response(JSON.stringify({ success: true, data: data.data || data, resultCount, duration_ms: duration }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error), duration_ms: Date.now() - startTime }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
