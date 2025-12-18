import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

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
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!firecrawlKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('[13F] 🏦 Starting 13F holdings ingestion via Firecrawl...');
    
    // Search for recent 13F filings news
    const searchQueries = [
      '13F SEC filing hedge fund holdings 2024',
      `${TRACKED_MANAGERS.slice(0, 3).join(' ')} stock holdings quarterly`,
      'institutional investor portfolio changes SEC'
    ];
    
    let allResults: any[] = [];
    
    for (const query of searchQueries) {
      try {
        const searchResponse = await fetch(`${FIRECRAWL_API_URL}/search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] }
          }),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.data && Array.isArray(searchData.data)) {
            allResults.push(...searchData.data);
            console.log(`[13F] Query "${query.substring(0, 30)}..." returned ${searchData.data.length} results`);
          }
        }
      } catch (err) {
        console.warn(`[13F] Search query failed: ${query}`, err);
      }
    }

    console.log(`[13F] Total search results: ${allResults.length}`);

    if (allResults.length === 0) {
      await logHeartbeat(supabaseClient, {
        function_name: 'ingest-13f-holdings',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl (no results)',
      });

      return new Response(JSON.stringify({ success: true, inserted: 0, skipped: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const combinedContent = allResults
      .slice(0, 10)
      .map((r, i) => `[Source ${i + 1}: ${r.url || 'unknown'}]\n${r.markdown || r.description || ''}`)
      .join('\n\n---\n\n');

    console.log('[13F] Extracting holdings data with Lovable AI...');

    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'system',
          content: 'Extract 13F holdings data. Return valid JSON array only.'
        }, {
          role: 'user',
          content: `Extract 13F hedge fund holdings from this content. Return JSON array:
[{
  "manager": "Fund Name",
  "ticker": "SYMBOL",
  "shares": number,
  "value": number (in thousands USD),
  "change": "new" or "increase" or "decrease" or "unchanged",
  "change_pct": number,
  "period": "YYYY-MM-DD"
}]

Look for holdings from: ${TRACKED_MANAGERS.join(', ')}
Only include holdings you can verify from the content. If none found, return [].

Content:
${combinedContent.substring(0, 15000)}`
        }],
        temperature: 0.1,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI extraction failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '[]';
    
    let holdings: any[] = [];
    try {
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        holdings = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('[13F] Failed to parse AI response:', parseError);
    }

    console.log(`[13F] AI extracted ${holdings.length} holdings`);
    
    const signals: any[] = [];
    
    for (const holding of holdings) {
      if (!holding.manager || !holding.ticker) continue;
      
      const manager = String(holding.manager).trim();
      const ticker = String(holding.ticker).toUpperCase();
      const shares = typeof holding.shares === 'number' ? holding.shares : 0;
      const value = typeof holding.value === 'number' ? holding.value : 0;
      const change = holding.change || 'unchanged';
      const changePct = typeof holding.change_pct === 'number' ? holding.change_pct : 0;
      const period = holding.period || new Date().toISOString().split('T')[0];
      
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
    
    console.log(`[13F] Created ${signals.length} signals`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const signal of signals) {
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
          console.error('[13F] Insert error:', error);
        }
      } else {
        inserted++;
      }
    }

    const durationMs = Date.now() - startTime;

    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-13f-holdings',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: durationMs,
      source_used: 'Firecrawl + Lovable AI',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-13f-holdings',
      status: 'success',
      duration: durationMs,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Firecrawl + Lovable AI',
    });

    console.log(`[13F] ✅ Complete: ${inserted} inserted, ${skipped} skipped`);

    return new Response(JSON.stringify({
      success: true,
      inserted,
      skipped,
      total_parsed: signals.length,
      searchResults: allResults.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[13F] ❌ Error:', error);
    
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-13f-holdings',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl + Lovable AI',
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
