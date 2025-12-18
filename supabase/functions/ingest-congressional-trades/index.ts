import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

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

    console.log('[CONGRESSIONAL] Starting congressional trades ingestion with Firecrawl...');
    
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!firecrawlKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Step 1: Try to scrape official sources directly first
    console.log('[CONGRESSIONAL] Scraping official sources for congressional trades...');
    
    let allSearchResults: any[] = [];
    
    // Primary: Try House Stock Watcher (aggregates official disclosures)
    const primarySources = [
      'https://housestockwatcher.com/summary_by_rep',
      'https://senatestockwatcher.com/summary_by_senator'
    ];
    
    for (const sourceUrl of primarySources) {
      try {
        console.log(`[CONGRESSIONAL] Scraping ${sourceUrl}...`);
        const scrapeResponse = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: sourceUrl,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 3000
          }),
        });

        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          if (scrapeData.data?.markdown || scrapeData.markdown) {
            allSearchResults.push({
              url: sourceUrl,
              markdown: scrapeData.data?.markdown || scrapeData.markdown,
              source: 'official_scrape'
            });
            console.log(`[CONGRESSIONAL] Scraped ${sourceUrl} successfully`);
          }
        }
      } catch (err) {
        console.warn(`[CONGRESSIONAL] Scrape failed for ${sourceUrl}:`, err);
      }
    }
    
    // Fallback: Search for recent congressional trading news
    if (allSearchResults.length === 0) {
      console.log('[CONGRESSIONAL] Primary sources failed, searching news...');
      
      const searchQueries = [
        'site:housestockwatcher.com stock trades 2024',
        'congress stock trades disclosure december 2024',
        'senator representative stock purchase sell filing'
      ];
      
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
              allSearchResults.push(...searchData.data);
              console.log(`[CONGRESSIONAL] Query "${query.substring(0, 30)}..." returned ${searchData.data.length} results`);
            }
          }
        } catch (err) {
          console.warn(`[CONGRESSIONAL] Search query failed: ${query}`, err);
        }
      }
    }

    console.log(`[CONGRESSIONAL] Total content sources: ${allSearchResults.length}`);

    if (allSearchResults.length === 0) {
      console.log('[CONGRESSIONAL] No results from any source');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-congressional-trades',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl (no results)',
      });

      return new Response(
        JSON.stringify({ success: true, inserted: 0, skipped: 0, message: 'No sources available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Combine content and extract structured data with Lovable AI
    const combinedContent = allSearchResults
      .slice(0, 10)
      .map((r, i) => `[Source ${i + 1}: ${r.url || 'unknown'}]\n${r.markdown || r.description || ''}`)
      .join('\n\n---\n\n');

    console.log('[CONGRESSIONAL] Extracting trade data with Lovable AI...');

    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'system',
          content: 'You are a congressional trading data extractor. Extract ONLY verifiable trades mentioned in the content. Return valid JSON array only.'
        }, {
          role: 'user',
          content: `Extract congressional stock trades from this content. Return a JSON array of trades with this exact structure:
[{
  "representative": "Full Name",
  "ticker": "SYMBOL",
  "transaction_type": "buy" or "sell",
  "transaction_date": "YYYY-MM-DD",
  "amount_min": number or null,
  "amount_max": number or null,
  "party": "Democrat" or "Republican" or "Unknown",
  "chamber": "Senate" or "House" or null
}]

Only include trades you can verify from the content. If no trades are found, return [].

Content:
${combinedContent.substring(0, 15000)}`
        }],
        temperature: 0.1,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[CONGRESSIONAL] AI extraction failed:', aiResponse.status, errorText);
      throw new Error(`AI extraction failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '[]';
    
    // Parse JSON from AI response
    let trades: any[] = [];
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        trades = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('[CONGRESSIONAL] Failed to parse AI response:', parseError);
      trades = [];
    }

    console.log(`[CONGRESSIONAL] AI extracted ${trades.length} trades`);

    // Step 3: Insert trades into database
    let inserted = 0;
    let skipped = 0;

    for (const trade of trades) {
      if (!trade.representative || !trade.ticker) {
        skipped++;
        continue;
      }

      const record = {
        ticker: String(trade.ticker).toUpperCase().substring(0, 20),
        representative: String(trade.representative).trim().substring(0, 100),
        party: trade.party || 'Unknown',
        chamber: trade.chamber || null,
        transaction_type: trade.transaction_type || 'buy',
        transaction_date: trade.transaction_date || new Date().toISOString().split('T')[0],
        filed_date: trade.transaction_date || new Date().toISOString().split('T')[0],
        amount_min: typeof trade.amount_min === 'number' ? trade.amount_min : null,
        amount_max: typeof trade.amount_max === 'number' ? trade.amount_max : null,
        metadata: {
          data_source: 'firecrawl_congressional',
          ingested_at: new Date().toISOString(),
          sources: allSearchResults.slice(0, 5).map(r => r.url).filter(Boolean),
        },
      };

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
          console.error('[CONGRESSIONAL] Insert error:', error);
        }
      } else {
        inserted++;
      }
    }

    console.log(`[CONGRESSIONAL] ✅ Inserted ${inserted}, skipped ${skipped}`);

    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl + Lovable AI',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-congressional-trades',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Firecrawl + Lovable AI',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted, 
        skipped,
        searchResults: allSearchResults.length,
        tradesExtracted: trades.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CONGRESSIONAL] ❌ Error:', error);
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl + Lovable AI',
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
