import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Disable JWT verification for automated ingestion
export const config = {
  verify_jwt: false
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const slackAlerter = new SlackAlerter();

  try {
    // This is a manual-only function, not for automated cron execution
    let body;
    try {
      body = await req.json();
    } catch {
      throw new Error('This function requires POST body with filing_url, xml_content, and manager_name. It is not designed for automated cron execution.');
    }
    
    const { filing_url, xml_content, manager_name, period_ended } = body;
    
    if (!filing_url || !xml_content || !manager_name) {
      throw new Error('Missing required POST body fields: filing_url, xml_content, manager_name');
    }

    // Simple regex-based XML parsing (safer for edge functions)
    const positions: any[] = [];
    let normalizedPeriod = period_ended || new Date().toISOString().split('T')[0];
    
    // Extract period if not provided
    if (!period_ended) {
      const periodMatch = xml_content.match(/<periodOfReport>(.*?)<\/periodOfReport>/i);
      if (periodMatch) {
        normalizedPeriod = periodMatch[1].trim();
      }
    }
    
    // Parse infoTable elements
    const infoTableRegex = /<infoTable>(.*?)<\/infoTable>/gs;
    const infoTableMatches = xml_content.matchAll(infoTableRegex);
    
    for (const match of infoTableMatches) {
      const tableContent = match[1];
      
      const cusipMatch = tableContent.match(/<cusip>(.*?)<\/cusip>/i);
      const valueMatch = tableContent.match(/<value>(.*?)<\/value>/i);
      const sharesMatch = tableContent.match(/<sshPrnamt>(.*?)<\/sshPrnamt>/i);
      
      if (cusipMatch && valueMatch) {
        positions.push({
          cusip: cusipMatch[1].trim(),
          value: parseFloat(valueMatch[1] || '0'),
          shares: parseFloat(sharesMatch?.[1] || '0'),
          manager: manager_name,
          period_ended: normalizedPeriod,
          filing_url
        });
      }
    }

    let inserted = 0;
    let skipped = 0;
    
    for (const pos of positions) {
      // Check for prior position
      const { data: priorSignal } = await supabaseClient
        .from('signals')
        .select('raw')
        .eq('signal_type', 'bigmoney_hold')
        .eq('raw->>manager', pos.manager)
        .eq('raw->>cusip', pos.cusip)
        .lt('raw->>period_ended', pos.period_ended)
        .order('raw->>period_ended', { ascending: false })
        .limit(1)
        .single();
      
      const priorValue = priorSignal?.raw?.value || null;
      
      // Classify delta
      let signalType = 'bigmoney_hold';
      let direction = 'neutral';
      
      if (priorValue === null || priorValue === 0) {
        signalType = 'bigmoney_hold_new';
        direction = 'up';
      } else if (pos.value > priorValue * 1.05) {
        signalType = 'bigmoney_hold_increase';
        direction = 'up';
      } else if (pos.value < priorValue * 0.95) {
        signalType = 'bigmoney_hold_decrease';
        direction = 'down';
      }
      
      // Generate checksum
      const checksumData = JSON.stringify({
        manager: pos.manager,
        period_ended: pos.period_ended,
        cusip: pos.cusip,
        value: pos.value
      });
      
      const encoder = new TextEncoder();
      const data = encoder.encode(checksumData);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Check if exists
      const { data: existing } = await supabaseClient
        .from('signals')
        .select('id')
        .eq('checksum', checksum)
        .single();
      
      if (existing) {
        skipped++;
        continue;
      }
      
      // Insert signal
      await supabaseClient
        .from('signals')
        .insert({
          signal_type: signalType,
          value_text: `${pos.manager} - ${pos.cusip}`,
          direction,
          magnitude: pos.value / 1000.0,
          observed_at: new Date(pos.period_ended).toISOString(),
          raw: {
            manager: pos.manager,
            cusip: pos.cusip,
            value: pos.value,
            shares: pos.shares,
            period_ended: pos.period_ended,
            prior_value: priorValue
          },
          citation: {
            source: `SEC 13F-HR: ${pos.manager}`,
            url: filing_url,
            timestamp: pos.period_ended
          },
          checksum
        });
      
      inserted++;
    }

    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-13f-holdings',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: 'SEC 13F-HR',
    });

    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-13f-holdings',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'SEC 13F-HR',
    });

    return new Response(JSON.stringify({
      inserted,
      skipped,
      total_positions: positions.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-13f-holdings',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'SEC 13F-HR',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    // Send Slack failure alert
    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-13f-holdings',
      message: `13F Holdings failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
