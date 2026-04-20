// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let themeId: string | null = null;
    try {
      const body = await req.json();
      themeId = body.theme_id;
    } catch {
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      themeId = pathParts[pathParts.length - 2];
    }

    if (!themeId) throw new Error('Theme ID required');

    const { data: theme, error: themeError } = await supabaseClient
      .from('themes').select('*').eq('id', themeId).single();
    if (themeError) throw themeError;

    const { data: signals } = await supabaseClient
      .from('signals').select('signal_type, value_text, magnitude, observed_at')
      .eq('theme_id', themeId).order('observed_at', { ascending: false }).limit(15);

    // If signals exist, generate AI explanation
    if (signals && signals.length > 0) {
      const signalSummary = signals.slice(0, 10).map(s =>
        `${s.signal_type} (magnitude: ${s.magnitude?.toFixed(2)}): ${s.value_text?.substring(0, 100)}`
      ).join('\n');

      const aiPrompt = `You are a financial analyst. Explain in 2-3 sentences WHY this investment theme is relevant RIGHT NOW based on these recent signals:\n\nTheme: ${theme.name}\n\nRecent signals:\n${signalSummary}\n\nBe specific and data-driven. Focus on what's driving the opportunity.`;

      const aiSummary = await callGemini(aiPrompt, 300, 'text');

      if (aiSummary) {
        const signalTypes = [...new Set(signals.map(s => s.signal_type))];
        return new Response(JSON.stringify({
          theme_name: theme.name,
          summary: aiSummary,
          key_drivers: signalTypes.slice(0, 5).map(type => {
            const s = signals.find(sig => sig.signal_type === type);
            return { type, description: s?.value_text?.substring(0, 120) || `${type} signal detected` };
          }),
          signal_count: signals.length,
          timeframe: 'Last 7 days',
          strength: signals.length > 5 ? 'Strong' : 'Moderate',
          ai_generated: true
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Fallback: data-driven (no AI) but still meaningful
    const signalTypes = signals ? [...new Set(signals.map(s => s.signal_type))] : [];
    const topSignals = signals?.slice(0, 3).map(s => s.value_text?.substring(0, 100)).filter(Boolean) || [];
    return new Response(JSON.stringify({
      theme_name: theme.name,
      summary: signals?.length
        ? `${theme.name} has ${signals.length} active signals including ${signalTypes.slice(0, 2).join(' and ')}. ${topSignals[0] || ''}`
        : `No recent signals for ${theme.name}`,
      key_drivers: signalTypes.slice(0, 5).map(type => ({
        type,
        description: signals?.find(s => s.signal_type === type)?.value_text?.substring(0, 120) || `${type} signal`
      })),
      signal_count: signals?.length || 0,
      timeframe: 'Last 7 days',
      strength: (signals?.length || 0) > 5 ? 'Strong' : 'Moderate',
      ai_generated: false
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Theme explanation error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
