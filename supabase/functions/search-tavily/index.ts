import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only callable by authenticated users or other edge functions
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Authorization header required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY');
  if (!TAVILY_API_KEY) {
    return new Response(JSON.stringify({ error: 'TAVILY_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { query, max_results, search_depth, include_domains } = body;

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'query is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const tavilyPayload: any = {
    api_key: TAVILY_API_KEY,
    query,
    max_results: max_results || 5,
    search_depth: search_depth || 'basic',
    include_answer: true,
  };
  if (include_domains && Array.isArray(include_domains)) {
    tavilyPayload.include_domains = include_domains;
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tavilyPayload),
  });

  if (!response.ok) {
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: 'Tavily quota exceeded — add credits at app.tavily.com' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: 'Tavily rate limit exceeded — slow down requests' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const errorText = await response.text().catch(() => 'Unknown error');
    return new Response(
      JSON.stringify({ error: `Tavily error ${response.status}: ${errorText.slice(0, 200)}` }),
      { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const data = await response.json();

  return new Response(
    JSON.stringify({
      answer: data.answer || null,
      results: (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
