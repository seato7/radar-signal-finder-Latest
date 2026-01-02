import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const slackAlerter = new SlackAlerter();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[SEARCH-TRENDS] Starting Search Trends ingestion via Firecrawl...');
    
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!firecrawlKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }
    
    // Fetch top assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, asset_class')
      .in('asset_class', ['stock', 'crypto', 'forex'])
      .limit(20);
    
    if (assetsError) throw assetsError;
    
    let inserted = 0;
    let skipped = 0;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Batch search for multiple tickers
    const tickerList = (assets || []).map(a => a.ticker).join(' OR ');
    
    console.log(`[SEARCH-TRENDS] Searching trends for ${assets?.length || 0} assets...`);
    
    const searchResponse = await fetch(`${FIRECRAWL_API_URL}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `Google Trends search interest ${tickerList} stock crypto trending`,
        limit: 15,
        scrapeOptions: { formats: ['markdown'] }
      }),
    });

    if (!searchResponse.ok) {
      throw new Error(`Firecrawl search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];
    
    console.log(`[SEARCH-TRENDS] Got ${results.length} search results`);

    if (results.length === 0) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-search-trends',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl (no results)',
        error_message: 'provider_empty_response',
        metadata: {
          outcome: 'no_data',
          reason: 'provider_empty_response',
          explanation: 'Firecrawl search returned no results for trending topics'
        }
      });
      
      return new Response(JSON.stringify({ success: true, inserted: 0, skipped: 0, outcome: 'no_data', reason: 'provider_empty_response' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const combinedContent = results
      .slice(0, 10)
      .map((r: any) => `[${r.url}]\n${r.markdown || r.description || ''}`)
      .join('\n\n---\n\n');

    // Use AI to extract trend data for each ticker
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
          content: 'Extract search trend data. Return valid JSON array only.'
        }, {
          role: 'user',
          content: `Extract Google search trend data for these tickers: ${(assets || []).map(a => a.ticker).join(', ')}

Return JSON array:
[{
  "ticker": "SYMBOL",
  "search_volume": number (0-100 relative interest),
  "trend_change": number (-100 to +100 percent change),
  "breakout": boolean
}]

Only include tickers you find evidence for. If no data, return [].

Content:
${combinedContent.substring(0, 12000)}`
        }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      console.error('[SEARCH-TRENDS] AI extraction failed:', aiResponse.status);
      throw new Error(`AI extraction failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '[]';
    
    let trends: any[] = [];
    try {
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        trends = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('[SEARCH-TRENDS] Failed to parse AI response:', parseError);
    }

    console.log(`[SEARCH-TRENDS] AI extracted ${trends.length} trend records`);

    for (const trend of trends) {
      if (!trend.ticker) {
        skipped++;
        continue;
      }

      const asset = (assets || []).find(a => a.ticker.toUpperCase() === trend.ticker.toUpperCase());
      if (!asset) {
        skipped++;
        continue;
      }

      const trendData = {
        ticker: asset.ticker,
        keyword: asset.name,
        period_start: startDate,
        period_end: today,
        search_volume: trend.search_volume || 50,
        trend_change: trend.trend_change || 0,
        region: 'US',
        metadata: { 
          breakout: trend.breakout || false, 
          source: 'Firecrawl + Lovable AI',
          sources: results.slice(0, 3).map((r: any) => r.url).filter(Boolean)
        }
      };
      
      const { error: insertError } = await supabase
        .from('search_trends')
        .insert(trendData);
      
      if (!insertError) {
        inserted++;
        
        // Create signal for breakout trends
        if (trend.breakout || (trend.trend_change && trend.trend_change > 50)) {
          const { data: assetData } = await supabase
            .from('assets')
            .select('id')
            .eq('ticker', asset.ticker)
            .single();
            
          await supabase.from('signals').insert({
            signal_type: 'search_trend_breakout',
            asset_id: assetData?.id,
            direction: 'up',
            magnitude: Math.min((trend.trend_change || 50) / 100, 1.0),
            value_text: `Search interest breakout: +${(trend.trend_change || 0).toFixed(1)}% (volume: ${trend.search_volume || 50})`,
            observed_at: new Date().toISOString(),
            citation: {
              source: 'Firecrawl + Lovable AI - Search Trends',
              url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(asset.ticker)}`,
              timestamp: new Date().toISOString()
            },
            checksum: `${asset.ticker}-trends-${today}`,
          });
        }
      } else {
        skipped++;
      }
    }
    
    const durationMs = Date.now() - startTime;
    
    // Standardized outcome classification
    const reasonCode = inserted === 0 
      ? (skipped > 0 ? 'no_new_records' : 'provider_empty_response')
      : null;
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-search-trends',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: durationMs,
      source_used: 'Firecrawl + Lovable AI',
      error_message: reasonCode,
      metadata: {
        outcome: inserted > 0 ? 'success' : 'no_data',
        reason: reasonCode,
        explanation: inserted === 0 
          ? (skipped > 0 ? 'All trend records already exist in database' : 'No trend data extracted by AI')
          : null
      }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-search-trends',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Firecrawl + Lovable AI',
      duration: durationMs,
    });

    console.log(`[SEARCH-TRENDS] ✅ Complete: ${inserted} inserted, ${skipped} skipped`);

    return new Response(JSON.stringify({
      success: true,
      processed: assets?.length || 0,
      inserted,
      skipped,
      source: 'Firecrawl + Lovable AI'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[SEARCH-TRENDS] ❌ Fatal error:', error);
    await logHeartbeat(supabase, {
      function_name: 'ingest-search-trends',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl + Lovable AI',
      error_message: error instanceof Error ? error.message : String(error),
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-search-trends',
      message: `Search trends ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
