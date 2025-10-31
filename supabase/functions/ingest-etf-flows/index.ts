import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function computeZScore(values: number[], currentValue: number): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdev = Math.sqrt(variance) || 0.01;
  return (currentValue - mean) / stdev;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { csv_urls } = await req.json();
    
    if (!csv_urls || csv_urls.length === 0) {
      throw new Error('csv_urls required');
    }
    
    let signalsCreated = 0;
    let signalsSkipped = 0;
    
    for (const csvUrl of csv_urls) {
      const response = await fetch(csvUrl);
      const csvText = await response.text();
      
      // Parse CSV
      const lines = csvText.trim().split('\n');
      const headers = lines[0].toLowerCase().split(',');
      
      const dateIdx = headers.findIndex(h => h.includes('date'));
      const tickerIdx = headers.findIndex(h => h.includes('ticker') || h.includes('symbol'));
      const flowIdx = headers.findIndex(h => h.includes('flow'));
      
      if (dateIdx === -1 || tickerIdx === -1 || flowIdx === -1) {
        continue;
      }
      
      const flows: Record<string, any[]> = {};
      
      // Parse rows
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const ticker = cols[tickerIdx]?.trim();
        const date = cols[dateIdx]?.trim();
        const flow = parseFloat(cols[flowIdx]);
        
        if (!ticker || !date || isNaN(flow)) continue;
        
        if (!flows[ticker]) flows[ticker] = [];
        flows[ticker].push({ date, flow });
      }
      
      // Compute z-scores per ticker
      for (const [ticker, tickerFlows] of Object.entries(flows)) {
        tickerFlows.sort((a, b) => a.date.localeCompare(b.date));
        
        for (let i = 0; i < tickerFlows.length; i++) {
          const window = tickerFlows.slice(Math.max(0, i - 60), i + 1);
          const zScore = computeZScore(window.map(f => f.flow), tickerFlows[i].flow);
          
          // Generate checksum
          const checksumData = JSON.stringify({
            date: tickerFlows[i].date,
            ticker,
            url: csvUrl
          });
          
          const encoder = new TextEncoder();
          const data = encoder.encode(checksumData);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          // Check exists
          const { data: existing } = await supabaseClient
            .from('signals')
            .select('id')
            .eq('checksum', checksum)
            .single();
          
          if (existing) {
            signalsSkipped++;
            continue;
          }
          
          // Find asset
          const { data: asset } = await supabaseClient
            .from('assets')
            .select('id')
            .eq('ticker', ticker)
            .single();
          
          // Insert signal
          await supabaseClient
            .from('signals')
            .insert({
              signal_type: 'flow_pressure_etf',
              asset_id: asset?.id,
              value_text: ticker,
              direction: zScore > 0 ? 'up' : zScore < 0 ? 'down' : 'neutral',
              magnitude: Math.abs(zScore),
              observed_at: new Date(tickerFlows[i].date).toISOString(),
              raw: {
                ticker,
                flow: tickerFlows[i].flow,
                z_score: zScore
              },
              citation: {
                source: 'ETF Flows CSV',
                url: csvUrl,
                timestamp: new Date().toISOString()
              },
              checksum
            });
          
          signalsCreated++;
        }
      }
    }

    return new Response(JSON.stringify({
      signals_created: signalsCreated,
      signals_skipped: signalsSkipped
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
