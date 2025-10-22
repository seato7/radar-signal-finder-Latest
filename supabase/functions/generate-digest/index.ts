import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userWatchlist, recentSignals, userActivity } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `Create a personalized daily investment digest for this user:

Watchlist: ${userWatchlist.map((t: any) => t.name).join(', ')}
Recent Activity: ${userActivity || 'First time user'}
New Signals Today: ${recentSignals.length}

Generate a compelling digest with:

1. **Opening Hook** (1 sentence) - Most important development today
2. **Your Top 3 Opportunities** - Based on their watchlist
   - Theme name
   - What changed (new signals, score movement)
   - Why it matters
3. **What to Watch** - 2-3 upcoming catalysts or events
4. **Market Context** - Brief market sentiment (1-2 sentences)

Keep it:
- Personalized (reference their watchlist)
- Actionable (what can they do today)
- Scannable (use emojis, short paragraphs)
- Under 200 words total

Style: Like a smart friend giving you the morning market brief.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are creating personalized investment digests that are engaging, actionable, and valuable.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const digest = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ digest }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-digest:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
