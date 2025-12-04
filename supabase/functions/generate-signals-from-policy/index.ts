import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-POLICY] Starting policy feed signal generation...');

    const { data: policies, error: policiesError } = await supabaseClient
      .from('policy_feeds')
      .select('*')
      .gte('published_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('published_at', { ascending: false });

    if (policiesError) throw policiesError;

    console.log(`[SIGNAL-GEN-POLICY] Found ${policies?.length || 0} policy feed items`);

    if (!policies || policies.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-policy',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No policy feeds to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const signals = [];
    for (const policy of policies) {
      const affectedTickers = policy.affected_tickers || [];
      
      if (affectedTickers.length === 0) continue;

      const { data: assets } = await supabaseClient
        .from('assets')
        .select('id, ticker')
        .in('ticker', affectedTickers);

      const impactScore = policy.impact_score || 0.5;
      const direction = impactScore > 0 ? 'up' : impactScore < 0 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(impactScore));

      for (const asset of assets || []) {
        const signalData = {
          ticker: asset.ticker,
          signal_type: 'policy_regulatory',
          published_at: policy.published_at,
          policy_title: policy.title
        };
        
        signals.push({
          asset_id: asset.id,
          signal_type: 'policy_regulatory',
          direction,
          magnitude,
          observed_at: new Date(policy.published_at).toISOString(),
          value_text: `${policy.source}: ${policy.title}`,
          checksum: JSON.stringify(signalData),
          citation: {
            source: policy.source || 'Policy Feed',
            url: policy.url,
            timestamp: new Date().toISOString()
          },
          raw: {
            title: policy.title,
            summary: policy.summary,
            category: policy.category,
            impact_score: impactScore,
            agency: policy.agency
          }
        });
      }
    }

    if (signals.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-policy',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No signals created from policies', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-POLICY] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-POLICY] ✅ Created ${signals.length} policy/regulatory signals`);

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-policy',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: signals.length,
    });

    return new Response(JSON.stringify({ 
      success: true,
      policies_processed: policies.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-POLICY] ❌ Error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-policy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
