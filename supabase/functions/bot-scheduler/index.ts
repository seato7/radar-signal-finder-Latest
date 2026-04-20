import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  try {
    console.log('[BOT-SCHEDULER] Starting bot execution cycle');
    const { data: bots, error: botsError } = await supabaseClient.from('bots').select('*').eq('status', 'running');
    if (botsError) throw botsError;
    console.log(`[BOT-SCHEDULER] Found ${bots?.length || 0} running bots`);
    
    let processedCount = 0;
    let errorCount = 0;
    for (const bot of bots || []) {
      // Validate bot has required config before executing
      if (!bot.id || !bot.status || bot.status !== 'running') {
        console.log(`[BOT-SCHEDULER] Skipping bot ${bot.id} — status: ${bot.status}`);
        continue;
      }
      console.log(`[BOT-SCHEDULER] Processing bot ${bot.id}`);
      try {
        const { error } = await supabaseClient.functions.invoke('manage-bots', { body: { action: 'tick', bot_id: bot.id } });
        if (error) { console.error(`[BOT-SCHEDULER] Error ticking bot ${bot.id}:`, error); errorCount++; }
        else { console.log(`[BOT-SCHEDULER] Bot ${bot.id} ticked successfully`); processedCount++; }
      } catch (error) { console.error(`[BOT-SCHEDULER] Exception for bot ${bot.id}:`, error); errorCount++; }
    }

    const duration = Date.now() - startTime;

    if ((bots && bots.length > 0) || errorCount > 0) {
      await logHeartbeat(supabaseClient, { function_name: 'bot-scheduler', status: errorCount === 0 ? 'success' : 'failure', rows_inserted: processedCount, duration_ms: duration, source_used: 'bots', metadata: { errors: errorCount, totalBots: bots?.length || 0 } });
      await slackAlerter.sendLiveAlert({ etlName: 'bot-scheduler', status: errorCount === 0 ? 'success' : 'partial', duration, latencyMs: duration, rowsInserted: processedCount, metadata: { errors: errorCount, totalBots: bots?.length || 0 } });
    }

    return new Response(JSON.stringify({ bots_processed: processedCount, bots_found: bots?.length || 0, errors: errorCount, timestamp: new Date().toISOString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[BOT-SCHEDULER] Error:', error);
    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, { function_name: 'bot-scheduler', status: 'failure', duration_ms: duration, error_message: error instanceof Error ? error.message : 'Unknown error' });
    await slackAlerter.sendCriticalAlert({ type: 'halted', etlName: 'bot-scheduler', message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
