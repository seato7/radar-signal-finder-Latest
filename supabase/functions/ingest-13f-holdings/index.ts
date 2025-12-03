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

// Major hedge fund managers to track
const TRACKED_MANAGERS = [
  'Berkshire Hathaway',
  'Bridgewater Associates',
  'Renaissance Technologies',
  'Citadel Advisors',
  'Two Sigma',
  'DE Shaw',
  'Tiger Global',
  'Millennium Management',
  'Point72',
  'Elliott Management'
];

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
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityKey) {
      throw new Error('Perplexity API key not configured');
    }

    console.log('🏦 Starting 13F holdings ingestion via Perplexity...');
    
    let response;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries <= maxRetries) {
      try {
        console.log(`🔄 Fetching 13F holdings, attempt ${retries + 1}/${maxRetries + 1}`);
        
        response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{
              role: 'system',
              content: 'You are a financial data provider specializing in SEC 13F filings. Return ONLY structured data in the exact format requested. No explanations or commentary.'
            }, {
              role: 'user',
              content: `List the most recent significant 13F holdings changes from major hedge funds (last filing period). Include holdings from: ${TRACKED_MANAGERS.join(', ')}.

For each holding provide EXACTLY this format:

HOLDING:
MANAGER: [Fund Name]
TICKER: [Stock Symbol]
SHARES: [Number of shares]
VALUE: [Value in thousands USD]
CHANGE: [new/increase/decrease/unchanged]
CHANGE_PCT: [Percentage change from prior quarter]
PERIOD: [Filing period YYYY-MM-DD]

List at least 15 significant holdings with real data from the most recent 13F filings.`
            }],
            temperature: 0.1,
            max_tokens: 3000,
          }),
        });
        
        if (response.status === 429) {
          const backoffMs = Math.min(3000 * Math.pow(2, retries), 30000);
          console.log(`⚠️ Rate limited, retry ${retries + 1}/${maxRetries + 1} in ${backoffMs}ms`);
          retries++;
          if (retries <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
          throw new Error('Rate limit exceeded after retries');
        }
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error');
          console.error(`❌ Perplexity API error: ${response.status} - ${errorText}`);
          retries++;
          if (retries <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 3000 * retries));
            continue;
          }
          throw new Error(`Perplexity API error: ${response.status}`);
        }
        
        console.log(`✅ Successfully fetched 13F holdings data`);
        break;
        
      } catch (fetchError) {
        console.error(`❌ Fetch error:`, fetchError);
        retries++;
        if (retries > maxRetries) {
          throw fetchError;
        }
        await new Promise(resolve => setTimeout(resolve, 3000 * retries));
      }
    }
    
    if (!response) {
      throw new Error('Failed to fetch after retries');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('Parsing 13F holdings response...');
    
    // Parse holdings from response
    const holdingBlocks = content.split(/HOLDING:/i).filter((b: string) => b.trim());
    const signals: any[] = [];
    
    for (const block of holdingBlocks) {
      const managerMatch = block.match(/MANAGER:\s*(.+)/i);
      const tickerMatch = block.match(/TICKER:\s*([A-Z]+)/i);
      const sharesMatch = block.match(/SHARES:\s*([\d,]+)/i);
      const valueMatch = block.match(/VALUE:\s*\$?([\d,]+)/i);
      const changeMatch = block.match(/CHANGE:\s*(new|increase|decrease|unchanged)/i);
      const changePctMatch = block.match(/CHANGE_PCT:\s*([-+]?[\d.]+)/i);
      const periodMatch = block.match(/PERIOD:\s*(\d{4}-\d{2}-\d{2})/i);
      
      if (managerMatch && tickerMatch) {
        const manager = managerMatch[1].trim();
        const ticker = tickerMatch[1].toUpperCase();
        const shares = sharesMatch ? parseInt(sharesMatch[1].replace(/,/g, '')) : 0;
        const value = valueMatch ? parseInt(valueMatch[1].replace(/,/g, '')) : 0;
        const change = changeMatch?.[1]?.toLowerCase() || 'unchanged';
        const changePct = changePctMatch ? parseFloat(changePctMatch[1]) : 0;
        const period = periodMatch?.[1] || new Date().toISOString().split('T')[0];
        
        // Determine signal type and direction
        let signalType = 'bigmoney_hold';
        let direction = 'neutral';
        
        if (change === 'new') {
          signalType = 'bigmoney_hold_new';
          direction = 'up';
        } else if (change === 'increase') {
          signalType = 'bigmoney_hold_increase';
          direction = 'up';
        } else if (change === 'decrease') {
          signalType = 'bigmoney_hold_decrease';
          direction = 'down';
        }
        
        // Generate checksum for deduplication
        const checksumData = JSON.stringify({ manager, period, ticker, value });
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(checksumData));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        signals.push({
          signal_type: signalType,
          value_text: `${manager} - ${ticker}`,
          direction,
          magnitude: value / 1000.0,
          observed_at: new Date(period).toISOString(),
          raw: {
            manager,
            ticker,
            value,
            shares,
            period_ended: period,
            change_type: change,
            change_pct: changePct,
          },
          citation: {
            source: `SEC 13F-HR: ${manager}`,
            url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(manager)}&type=13F`,
            timestamp: period
          },
          checksum
        });
      }
    }
    
    console.log(`Parsed ${signals.length} 13F holdings signals`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const signal of signals) {
      // Check for duplicates by checksum
      const { data: existing } = await supabaseClient
        .from('signals')
        .select('id')
        .eq('checksum', signal.checksum)
        .single();
      
      if (existing) {
        skipped++;
        continue;
      }
      
      const { error } = await supabaseClient
        .from('signals')
        .insert(signal);
      
      if (error) {
        if (error.code === '23505') {
          skipped++;
        } else {
          console.error('Insert error:', error);
        }
      } else {
        inserted++;
      }
    }

    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-13f-holdings',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity AI',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-13f-holdings',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Perplexity AI',
    });

    return new Response(JSON.stringify({
      success: true,
      inserted,
      skipped,
      total_parsed: signals.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ingest-13f-holdings:', error);
    
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-13f-holdings',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity AI',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    await slackAlerter.sendCriticalAlert({
      type: 'api_reliability',
      etlName: 'ingest-13f-holdings',
      message: `13F Holdings failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
