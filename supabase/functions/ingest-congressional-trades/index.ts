import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting congressional trades ingestion...');
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');

    if (!perplexityKey) {
      throw new Error('Perplexity API key not configured');
    }

    console.log('Fetching recent congressional trades via Perplexity...');
    
    let response;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries <= maxRetries) {
      try {
        console.log(`🔄 Fetching congressional trades, attempt ${retries + 1}/${maxRetries + 1}`);
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
              content: 'You are a congressional trading data provider. Return ONLY structured data in the exact format requested. No explanations.'
            }, {
              role: 'user',
              content: `List the 10 most recent congressional stock trades from official Senate/House financial disclosures (last 30 days). Format each trade EXACTLY like this:

TRADE:
REPRESENTATIVE: [Full Name]
TICKER: [Stock Symbol]
TYPE: [buy/sell]
DATE: [YYYY-MM-DD]
AMOUNT_MIN: [number without $ or commas]
AMOUNT_MAX: [number without $ or commas]
PARTY: [Democrat/Republican]
CHAMBER: [Senate/House]

Use real data from official congressional disclosures. Include trades from members like Nancy Pelosi, Tommy Tuberville, Dan Crenshaw, etc.`
            }],
            temperature: 0.1,
            max_tokens: 2000,
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
        
        console.log(`✅ Successfully fetched congressional trades`);
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

    const records: any[] = [];
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('Perplexity response received, parsing...');
    
    // Parse structured response
    const tradeBlocks = content.split(/TRADE:/i).filter((b: string) => b.trim());
    
    for (const block of tradeBlocks) {
      const repMatch = block.match(/REPRESENTATIVE:\s*(.+)/i);
      const tickerMatch = block.match(/TICKER:\s*([A-Z]+)/i);
      const typeMatch = block.match(/TYPE:\s*(buy|sell)/i);
      const dateMatch = block.match(/DATE:\s*(\d{4}-\d{2}-\d{2})/i);
      const minMatch = block.match(/AMOUNT_MIN:\s*\$?([\d,]+)/i);
      const maxMatch = block.match(/AMOUNT_MAX:\s*\$?([\d,]+)/i);
      const partyMatch = block.match(/PARTY:\s*(Democrat|Republican)/i);
      const chamberMatch = block.match(/CHAMBER:\s*(Senate|House)/i);
      
      if (repMatch && tickerMatch) {
        const transactionDate = dateMatch?.[1] || new Date().toISOString().split('T')[0];
        
        records.push({
          ticker: tickerMatch[1].toUpperCase().substring(0, 20),
          representative: repMatch[1].trim().substring(0, 100),
          party: partyMatch?.[1] || 'Unknown',
          chamber: chamberMatch?.[1] || null,
          transaction_type: typeMatch?.[1]?.toLowerCase() || 'buy',
          transaction_date: transactionDate,
          filed_date: transactionDate,
          amount_min: minMatch ? parseInt(minMatch[1].replace(/,/g, '')) : null,
          amount_max: maxMatch ? parseInt(maxMatch[1].replace(/,/g, '')) : null,
          metadata: {
            data_source: 'perplexity_congressional',
            ingested_at: new Date().toISOString(),
          },
        });
      }
    }
    
    console.log(`Parsed ${records.length} congressional trades`);

    let inserted = 0;
    let skipped = 0;

    if (records.length > 0) {
      // Insert with conflict handling
      for (const record of records) {
        const { error } = await supabase
          .from('congressional_trades')
          .upsert(record, {
            onConflict: 'representative,ticker,transaction_date',
            ignoreDuplicates: true
          });

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
      
      console.log(`Inserted ${inserted} congressional trade records, skipped ${skipped} duplicates`);
    }

    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity AI',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-congressional-trades',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Perplexity AI',
    });

    return new Response(
      JSON.stringify({ success: true, inserted, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-congressional-trades:', error);
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity AI',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    await slackAlerter.sendCriticalAlert({
      type: 'api_reliability',
      etlName: 'ingest-congressional-trades',
      message: `Congressional trades failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
