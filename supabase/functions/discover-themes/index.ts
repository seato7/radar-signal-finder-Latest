// redeployed 2026-05-18 — now persists keywords + tickers (B1 upstream fix)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { callGeminiPro } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { unmappedSignals, existingThemes } = await req.json();

    const signalSummary = (unmappedSignals || []).slice(0, 20).map((s: any) => ({
      type: s.signal_type,
      text: s.value_text,
      date: s.observed_at,
      ticker: s.ticker,
    }));

    const prompt = `Analyze these recent investment signals that don't fit existing themes and identify emerging opportunities:

Unmapped Signals:
${JSON.stringify(signalSummary, null, 2)}

Existing Themes (avoid duplicating):
${(existingThemes || []).map((t: any) => t.name).join(', ')}

Identify 1-3 potential NEW investment themes. For each theme, output EXACTLY this format (mirror mine-and-discover-themes):

THEME: [Theme Name - 2-4 words]
DESCRIPTION: [One sentence explaining the opportunity]
WHY_NOW: [One sentence on timing/catalyst]
KEYWORDS: [comma-separated, 5-10 keywords for signal matching]
TICKERS: [comma-separated US-listed tickers — REQUIRED: at least 3 tickers that demonstrably fit this theme. Do not invent. If you cannot identify 3+ plausible tickers, do not output this theme.]
CONFIDENCE: [High/Medium/Low]
---

Hard requirements:
- Each theme MUST include 3+ real, publicly traded US tickers in the TICKERS line
- No generic themes ("Technology", "Growth Stocks")
- Only suggest themes with at least 3 supporting signals`;

    const fullPrompt = `You are a market analyst identifying emerging investment themes from signal patterns.\n\n${prompt}`;
    const aiText = await callGeminiPro(fullPrompt, 2000);
    if (!aiText) throw new Error('Gemini returned no content');

    // Parse into structured themes
    const discoveredThemes: Array<{
      name: string;
      description: string;
      why_now: string;
      keywords: string[];
      tickers: string[];
      confidence: string;
    }> = [];
    const blocks = aiText.split('---').filter((b: string) => b.trim());
    for (const block of blocks) {
      const themeMatch = block.match(/THEME:\s*(.+)/i);
      const descMatch = block.match(/DESCRIPTION:\s*(.+)/i);
      const whyNowMatch = block.match(/WHY_NOW:\s*(.+)/i);
      const keywordsMatch = block.match(/KEYWORDS:\s*(.+)/i);
      const tickersMatch = block.match(/TICKERS:\s*(.+)/i);
      const confidenceMatch = block.match(/CONFIDENCE:\s*(High|Medium|Low)/i);
      if (!themeMatch || !keywordsMatch) continue;

      const keywords = keywordsMatch[1].split(',').map((k: string) => k.trim()).filter(Boolean);
      const tickers = tickersMatch
        ? tickersMatch[1].split(',').map((t: string) => t.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '')).filter(Boolean)
        : [];

      // Hard gate: skip themes without 3+ tickers (upstream B1 guarantee)
      if (tickers.length < 3) continue;

      discoveredThemes.push({
        name: themeMatch[1].trim(),
        description: descMatch ? descMatch[1].trim() : '',
        why_now: whyNowMatch ? whyNowMatch[1].trim() : '',
        keywords,
        tickers,
        confidence: confidenceMatch ? confidenceMatch[1] : 'Medium',
      });
    }

    // Persist each theme with keywords AND tickers populated
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const created: any[] = [];
    for (const t of discoveredThemes) {
      const { data, error } = await supabase
        .from('themes')
        .upsert({
          name: t.name,
          keywords: t.keywords,
          tickers: t.tickers,
          alpha: 1.0,
          metadata: {
            discovered: true,
            source: 'discover-themes',
            description: t.description,
            why_now: t.why_now,
            confidence: t.confidence,
          },
        }, { onConflict: 'name', ignoreDuplicates: true })
        .select()
        .single();
      if (!error && data) created.push(data);
    }

    return new Response(
      JSON.stringify({
        suggestions: aiText,
        discovered: created,
        themes_created: created.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in discover-themes:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
