import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This edge function should be called via cron every minute
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    console.log('[BOT-SCHEDULER] Starting bot execution cycle');
    
    // Get all running bots
    const { data: bots, error: botsError } = await supabaseClient
      .from('bots')
      .select('*')
      .eq('status', 'running');
    
    if (botsError) throw botsError;
    
    console.log(`[BOT-SCHEDULER] Found ${bots?.length || 0} running bots`);
    
    for (const bot of bots || []) {
      console.log(`[BOT-SCHEDULER] Processing bot ${bot.id}`);
      
      // Call manage-bots function to execute strategy
      try {
        const { data, error } = await supabaseClient.functions.invoke('manage-bots', {
          body: {
            action: 'tick',
            bot_id: bot.id
          }
        });
        
        if (error) {
          console.error(`[BOT-SCHEDULER] Error ticking bot ${bot.id}:`, error);
        } else {
          console.log(`[BOT-SCHEDULER] Bot ${bot.id} ticked successfully`);
        }
      } catch (error) {
        console.error(`[BOT-SCHEDULER] Exception for bot ${bot.id}:`, error);
      }
    }

    return new Response(JSON.stringify({
      bots_processed: bots?.length || 0,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[BOT-SCHEDULER] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
