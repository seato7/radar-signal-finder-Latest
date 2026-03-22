import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { callGemini } from "../_shared/gemini.ts";

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

    const fullPrompt = `You are creating personalized investment digests that are engaging, actionable, and valuable.\n\n${prompt}`;
    const digest = await callGemini(fullPrompt, 400, 'text');
    if (!digest) throw new Error('Gemini returned no content');

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
