import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  try {
    const { csv_urls } = await req.json();
    
    if (!csv_urls || csv_urls.length === 0) {
      throw new Error('csv_urls required');
    }
    
    let inserted = 0;
    let skipped = 0;
    
    for (const csvUrl of csv_urls) {
      const response = await fetch(csvUrl);
      const csvText = await response.text();
      
      // Parse CSV
      const lines = csvText.trim().split('\n');
      const headers = lines[0].toLowerCase().split(',');
      
      const dateIdx = headers.findIndex(h => h.includes('date'));
      const tickerIdx = headers.findIndex(h => h.includes('ticker') || h.includes('symbol'));
      const closeIdx = headers.findIndex(h => h.includes('close') || h.includes('price'));
      
      if (dateIdx === -1 || tickerIdx === -1 || closeIdx === -1) {
        continue;
      }
      
      // Parse rows
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const ticker = cols[tickerIdx]?.trim().toUpperCase();
        const date = cols[dateIdx]?.trim();
        const close = parseFloat(cols[closeIdx]);
        
        if (!ticker || !date || isNaN(close)) {
          skipped++;
          continue;
        }
        
        // Generate checksum
        const checksumData = `${ticker}|${date}|${close}|${csvUrl}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(checksumData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Check exists
        const { data: existing } = await supabaseClient
          .from('prices')
          .select('id')
          .eq('checksum', checksum)
          .single();
        
        if (existing) {
          skipped++;
          continue;
        }
        
        // Find asset
        const { data: asset } = await supabaseClient
          .from('assets')
          .select('id')
          .eq('ticker', ticker)
          .single();
        
        // Insert price
        await supabaseClient
          .from('prices')
          .insert({
            ticker,
            date,
            close,
            asset_id: asset?.id,
            checksum
          });
        
        inserted++;
      }
    }

    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-prices-csv',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: 'CSV Upload',
    });

    return new Response(JSON.stringify({ inserted, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-prices-csv',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'CSV Upload',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
