import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callGemini } from "../_shared/gemini.ts";

const slackAlerter = new SlackAlerter();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// v2 fixes:
// 1. fetchWithRetry: exponential backoff on 429 for both Firecrawl and AI calls
// 2. Per-ticker AI calls instead of one giant 20-ticker prompt
// 3. search_trends: .insert() → .upsert() on (ticker, period_end)
// 4. Delay between per-ticker AI calls to stay under rate limits

const RETRY_MAX = 3;
const RETRY_BASE_MS = 1000; // doubles each attempt: 1s, 2s, 4s
const AI_CALL_DELAY_MS = 300; // pause between per-ticker AI calls

/**
 * Calls fn() and retries up to RETRY_MAX times when the response is 429.
 * Does not retry on 402 (billing issue — retrying won't help).
 * Does not retry on 4xx other than 429.
 */
async function fetchWithRetry(fn: () => Promise<Response>): Promise<Response> {
  let response: Response = await fn();

  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    if (response.status !== 429) break;

    const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
    console.log(`[RETRY] 429 rate limited — waiting ${delayMs}ms (attempt ${attempt}/${RETRY_MAX})`);
    await new Promise(r => setTimeout(r, delayMs));

    response = await fn();
  }

  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[SEARCH-TRENDS] v2 starting...');

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlKey) throw new Error('FIRECRAWL_API_KEY not configured');

    // Fetch top assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, asset_class')
      .in('asset_class', ['stock', 'crypto', 'forex'])
      .limit(20);

    if (assetsError) throw assetsError;
    if (!assets || assets.length === 0) {
      throw new Error('No assets returned from database');
    }

    const today = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`[SEARCH-TRENDS] Searching trends for ${assets.length} assets...`);

    // --- Step 1: Single Firecrawl search with retry ---
    const tickerList = assets.map(a => a.ticker).join(' OR ');

    const searchResponse = await fetchWithRetry(() =>
      fetch(`${FIRECRAWL_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `Google Trends search interest ${tickerList} stock crypto trending`,
          limit: 15,
          scrapeOptions: { formats: ['markdown'] },
        }),
      })
    );

    if (!searchResponse.ok) {
      throw new Error(`Firecrawl search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];

    console.log(`[SEARCH-TRENDS] Got ${results.length} search results from Firecrawl`);

    if (results.length === 0) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-search-trends',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl (no results)',
        error_message: 'provider_empty_response',
        metadata: { outcome: 'no_data', reason: 'provider_empty_response' },
      });

      return new Response(
        JSON.stringify({ success: true, inserted: 0, skipped: 0, outcome: 'no_data', reason: 'provider_empty_response' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Combine search content once — reused across all per-ticker AI calls
    const combinedContent = results
      .slice(0, 10)
      .map((r: any) => `[${r.url}]\n${r.markdown || r.description || ''}`)
      .join('\n\n---\n\n')
      .substring(0, 15000);

    // --- Step 2: Per-ticker AI calls with retry + inter-call delay ---
    let inserted = 0;
    let skipped = 0;

    for (const asset of assets) {
      // Delay between calls to stay under AI gateway rate limits
      if (assets.indexOf(asset) > 0) {
        await new Promise(r => setTimeout(r, AI_CALL_DELAY_MS));
      }

      let trend: { search_volume?: number; trend_change?: number; breakout?: boolean } | null = null;

      try {
        const aiPrompt = `Extract search trend data for a single stock ticker. Return valid JSON only.

Find search trend data for ticker: ${asset.ticker} (${asset.name})

Return a single JSON object (not an array):
{
  "search_volume": number (0-100 relative interest, or null if not found),
  "trend_change": number (-100 to +100 percent change, or null if not found),
  "breakout": boolean (true if unusually high interest)
}

Only return data you find evidence for in the content below. If no data for ${asset.ticker}, return {"search_volume": null, "trend_change": null, "breakout": false}.

Content:
${combinedContent.substring(0, 8000)}`;

        const aiContent = await callGemini(aiPrompt, 200);

        if (!aiContent) {
          console.error(`[SEARCH-TRENDS] AI call returned null for ${asset.ticker} — skipping`);
          skipped++;
          continue;
        }

        try {
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Only use if we have at least one real value
            if (parsed.search_volume != null || parsed.trend_change != null) {
              trend = parsed;
            }
          }
        } catch {
          console.error(`[SEARCH-TRENDS] Failed to parse AI response for ${asset.ticker}`);
        }

      } catch (aiErr) {
        console.error(`[SEARCH-TRENDS] AI error for ${asset.ticker}:`, aiErr);
        skipped++;
        continue;
      }

      if (!trend) {
        skipped++;
        continue;
      }

      // --- Step 3: Upsert search_trends (idempotent on ticker + period_end) ---
      const trendData = {
        ticker: asset.ticker,
        keyword: asset.name,
        period_start: startDate,
        period_end: today,
        search_volume: trend.search_volume ?? 50,
        trend_change: trend.trend_change ?? 0,
        region: 'US',
        metadata: {
          breakout: trend.breakout || false,
          source: 'Firecrawl + Gemini',
          sources: results.slice(0, 3).map((r: any) => r.url).filter(Boolean),
        },
      };

      const { error: upsertError } = await supabase
        .from('search_trends')
        .upsert(trendData, { onConflict: 'ticker,period_end' });

      if (upsertError) {
        console.error(`[SEARCH-TRENDS] Upsert failed for ${asset.ticker}:`, upsertError.message);
        skipped++;
        continue;
      }

      inserted++;

      // Generate signal for breakout trends
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
          magnitude: Math.min((trend.trend_change ?? 50) / 100, 1.0),
          value_text: `Search interest breakout: +${(trend.trend_change ?? 0).toFixed(1)}% (volume: ${trend.search_volume ?? 50})`,
          observed_at: new Date().toISOString(),
          citation: {
            source: 'Firecrawl + Gemini - Search Trends',
            url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(asset.ticker)}`,
            timestamp: new Date().toISOString(),
          },
          checksum: `${asset.ticker}-trends-${today}`,
        });
      }

      console.log(`[SEARCH-TRENDS] ✅ ${asset.ticker}: volume=${trend.search_volume}, change=${trend.trend_change}, breakout=${trend.breakout}`);
    }

    const durationMs = Date.now() - startTime;
    const reasonCode = inserted === 0
      ? (skipped > 0 ? 'no_new_records' : 'provider_empty_response')
      : null;

    await logHeartbeat(supabase, {
      function_name: 'ingest-search-trends',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: durationMs,
      source_used: 'Firecrawl + Gemini',
      error_message: reasonCode,
      metadata: {
        outcome: inserted > 0 ? 'success' : 'no_data',
        assets_processed: assets.length,
        version: 'v2_per_ticker_retry',
      },
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-search-trends',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Firecrawl + Gemini',
      duration: durationMs,
    });

    console.log(`[SEARCH-TRENDS] ✅ Complete: ${inserted} inserted, ${skipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: assets.length,
        inserted,
        skipped,
        source: 'Firecrawl + Gemini',
        version: 'v2_per_ticker_retry',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SEARCH-TRENDS] ❌ Fatal error:', error);

    await logHeartbeat(supabase, {
      function_name: 'ingest-search-trends',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl + Gemini',
      error_message: error instanceof Error ? error.message : String(error),
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-search-trends',
      message: `Search trends ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
