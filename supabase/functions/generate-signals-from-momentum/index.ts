import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { fireAiScoring } from '../_shared/fire-ai-scoring.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const CHUNK_SIZE = 1000; // Assets per chunk
const TICKER_BATCH_SIZE = 50; // Tickers per price query

// Coverage requirements
const MIN_POINTS_30D = 2; // Minimum data points in 30 days to generate momentum
const LIMITED_DATA_THRESHOLD = 6; // Below this = limited_data suffix

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================================================
  // CRON SECRET ENFORCEMENT
  // Always require x-cron-secret header (even if env var is not set, block unauthenticated calls)
  // ========================================================================
  const expectedSecret = Deno.env.get('CRON_SHARED_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  
  if (expectedSecret && providedSecret !== expectedSecret) {
    console.warn('[SIGNAL-GEN-MOMENTUM] Unauthorized: missing or invalid x-cron-secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Parse request body for offset parameter
    let offset = 0;
    try {
      const body = await req.json();
      offset = body?.offset ?? 0;
    } catch {
      // No body or invalid JSON, use default offset 0
    }

    console.log(`[SIGNAL-GEN-MOMENTUM] Starting chunk at offset ${offset}...`);

    // ========================================================================
    // FETCH PRICE COVERAGE DATA FOR TODAY
    // ========================================================================
    const coverageMap = new Map<string, {
      status: string;
      points_30d: number;
      points_90d: number;
      last_price_date: string | null;
      days_stale: number;
    }>();

    let coverageOffset = 0;
    while (true) {
      const { data: coveragePage, error: coverageError } = await supabaseClient
        .from('price_coverage_daily')
        .select('ticker, status, points_30d, points_90d, last_price_date, days_stale')
        .eq('snapshot_date', today)
        .eq('vendor', 'twelvedata')
        .range(coverageOffset, coverageOffset + 999);

      if (coverageError) {
        console.warn(`[SIGNAL-GEN-MOMENTUM] Coverage query error: ${coverageError.message}`);
        break;
      }
      if (!coveragePage || coveragePage.length === 0) break;

      for (const c of coveragePage) {
        coverageMap.set(c.ticker, {
          status: c.status,
          points_30d: c.points_30d,
          points_90d: c.points_90d,
          last_price_date: c.last_price_date,
          days_stale: c.days_stale,
        });
      }

      if (coveragePage.length < 1000) break;
      coverageOffset += 1000;
    }

    console.log(`[SIGNAL-GEN-MOMENTUM] Loaded ${coverageMap.size} coverage records for ${today}`);

    // ========================================================================
    // EXCLUSION TRACKING
    // ========================================================================
    const exclusions: Record<string, string[]> = {
      no_coverage_record: [],
      status_not_fresh: [],
      insufficient_points_30d: [],
    };

    // Get total asset count first
    const { count: totalAssets } = await supabaseClient
      .from('assets')
      .select('*', { count: 'exact', head: true });

    // Fetch assets for this chunk only
    const { data: assetBatch, error: assetError } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .range(offset, offset + CHUNK_SIZE - 1);

    if (assetError) throw assetError;

    console.log(`[SIGNAL-GEN-MOMENTUM] Processing ${assetBatch?.length || 0} assets (offset ${offset}, total ${totalAssets})`);

    if (!assetBatch || assetBatch.length === 0) {
      // Log diagnostics before returning
      await logDiagnostics(supabaseClient, today, exclusions);

      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-momentum',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'prices',
        metadata: { offset, chunk_complete: true, all_complete: true }
      });
      return new Response(JSON.stringify({ 
        message: 'No more assets to process', 
        signals_created: 0,
        offset,
        next_offset: null,
        complete: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create ticker to asset ID mapping
    const tickerToAssetId = new Map<string, string>();
    const assetIdToTicker = new Map<string, string>();
    for (const asset of assetBatch) {
      tickerToAssetId.set(asset.ticker, asset.id);
      assetIdToTicker.set(asset.id, asset.ticker);
    }

    // Filter assets based on coverage
    const eligibleAssets: { id: string; ticker: string; coverage: typeof coverageMap extends Map<string, infer V> ? V : never }[] = [];
    
    for (const asset of assetBatch) {
      const cov = coverageMap.get(asset.ticker);
      
      if (!cov) {
        exclusions.no_coverage_record.push(asset.ticker);
        continue;
      }
      
      if (cov.status !== 'fresh') {
        exclusions.status_not_fresh.push(asset.ticker);
        continue;
      }
      
      if (cov.points_30d < MIN_POINTS_30D) {
        exclusions.insufficient_points_30d.push(asset.ticker);
        continue;
      }
      
      eligibleAssets.push({ id: asset.id, ticker: asset.ticker, coverage: cov });
    }

    console.log(`[SIGNAL-GEN-MOMENTUM] Eligible: ${eligibleAssets.length}, Excluded: no_coverage=${exclusions.no_coverage_record.length}, not_fresh=${exclusions.status_not_fresh.length}, insufficient_points=${exclusions.insufficient_points_30d.length}`);

    const signals: Array<{
      asset_id: string;
      signal_type: string;
      direction: string;
      magnitude: number;
      observed_at: string;
      value_text: string;
      checksum: string;
      citation: object;
      raw: object;
    }> = [];

    // Process in ticker batches (only eligible)
    const eligibleTickers = eligibleAssets.map(a => a.ticker);

    for (let i = 0; i < eligibleTickers.length; i += TICKER_BATCH_SIZE) {
      const tickerBatch = eligibleTickers.slice(i, i + TICKER_BATCH_SIZE);
      
      // Fetch prices for this batch
      const { data: prices, error: pricesError } = await supabaseClient
        .from('prices')
        .select('asset_id, ticker, date, close')
        .in('ticker', tickerBatch)
        .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(tickerBatch.length * 30);

      if (pricesError) {
        console.error(`[SIGNAL-GEN-MOMENTUM] Error fetching batch ${i}: ${pricesError.message}`);
        continue;
      }

      // Group by ticker
      const pricesByTicker = new Map<string, Array<{ date: string; close: number; asset_id: string }>>();
      for (const price of prices || []) {
        if (!pricesByTicker.has(price.ticker)) {
          pricesByTicker.set(price.ticker, []);
        }
        pricesByTicker.get(price.ticker)!.push({
          date: price.date,
          close: price.close,
          asset_id: price.asset_id || tickerToAssetId.get(price.ticker) || ''
        });
      }

      // Calculate momentum for each ticker
      for (const [ticker, tickerPrices] of pricesByTicker) {
        tickerPrices.sort((a, b) => b.date.localeCompare(a.date));

        // Already filtered by coverage, but double-check minimum prices
        if (tickerPrices.length < 2) continue;

        const assetId = tickerPrices[0].asset_id || tickerToAssetId.get(ticker);
        if (!assetId) continue;

        const latestPrice = tickerPrices[0].close;
        const latestDate = tickerPrices[0].date;
        
        // Get coverage data for raw fields
        const cov = coverageMap.get(ticker);
        const rawCoverageFields = {
          snapshot_date: today,
          last_price_date: cov?.last_price_date,
          days_stale: cov?.days_stale,
          points_30d: cov?.points_30d,
          points_90d: cov?.points_90d,
          price_status: cov?.status,
        };

        // Calculate 5-day momentum
        // FIX: Guard against length==1 producing index 0 (same as latest), use max(1, ...) to ensure lookback
        const lookbackIndex5d = tickerPrices.length < 2 ? null : Math.min(5, tickerPrices.length - 1);
        const price5d = lookbackIndex5d !== null ? tickerPrices[lookbackIndex5d]?.close : null;
        const hasLimitedData5d = tickerPrices.length < LIMITED_DATA_THRESHOLD;
        
        if (price5d && price5d > 0) {
          const momentum5d = ((latestPrice - price5d) / price5d) * 100;
          const direction = momentum5d > 0 ? 'up' : (momentum5d < 0 ? 'down' : 'neutral');
          // FIX: Normalised to 0-5 scale (was 0-1)
          const magnitude = Math.min(5, Math.max(0, Math.abs(momentum5d) / 20) * 5);

          const dataQuality = hasLimitedData5d ? '_limited_data' : '';
          let signalType: string;
          if (Math.abs(momentum5d) > 5) {
            signalType = momentum5d > 0 ? `momentum_5d_strong_bullish${dataQuality}` : `momentum_5d_strong_bearish${dataQuality}`;
          } else if (Math.abs(momentum5d) > 2) {
            signalType = momentum5d > 0 ? `momentum_5d_bullish${dataQuality}` : `momentum_5d_bearish${dataQuality}`;
          } else {
            signalType = momentum5d > 0 ? `momentum_5d_weak_bullish${dataQuality}` : `momentum_5d_weak_bearish${dataQuality}`;
          }

          signals.push({
            asset_id: assetId,
            signal_type: signalType,
            direction,
            magnitude,
            observed_at: latestDate,
            value_text: `5-day momentum: ${momentum5d > 0 ? '+' : ''}${momentum5d.toFixed(1)}%${hasLimitedData5d ? ' (limited data)' : ''}`,
            checksum: JSON.stringify({ ticker, signal_type: signalType, date: latestDate, momentum: momentum5d.toFixed(1) }),
            citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
            raw: { 
              ticker, 
              latest_price: latestPrice, 
              price_5d_ago: price5d, 
              momentum_pct: momentum5d, 
              days_available: tickerPrices.length,
              ...rawCoverageFields,
            }
          });
        }

        // Calculate 20-day momentum (requires more data)
        if (tickerPrices.length >= 6) {
          const lookbackIndex20d = Math.min(20, tickerPrices.length - 1);
          const price20d = tickerPrices[lookbackIndex20d]?.close;
          const hasLimitedData20d = tickerPrices.length < 21;
          
          if (price20d && price20d > 0) {
            const momentum20d = ((latestPrice - price20d) / price20d) * 100;
            const direction = momentum20d > 0 ? 'up' : (momentum20d < 0 ? 'down' : 'neutral');
            // FIX: Normalised to 0-5 scale (was 0-1)
            const magnitude = Math.min(5, Math.max(0, Math.abs(momentum20d) / 30) * 5);

            const dataQuality = hasLimitedData20d ? '_limited_data' : '';
            let signalType: string;
            if (Math.abs(momentum20d) > 10) {
              signalType = momentum20d > 0 ? `momentum_20d_strong_bullish${dataQuality}` : `momentum_20d_strong_bearish${dataQuality}`;
            } else if (Math.abs(momentum20d) > 3) {
              signalType = momentum20d > 0 ? `momentum_20d_bullish${dataQuality}` : `momentum_20d_bearish${dataQuality}`;
            } else {
              signalType = momentum20d > 0 ? `momentum_20d_weak_bullish${dataQuality}` : `momentum_20d_weak_bearish${dataQuality}`;
            }

            signals.push({
              asset_id: assetId,
              signal_type: signalType,
              direction,
              magnitude,
              observed_at: latestDate,
              value_text: `20-day momentum: ${momentum20d > 0 ? '+' : ''}${momentum20d.toFixed(1)}%${hasLimitedData20d ? ' (limited data)' : ''}`,
              checksum: JSON.stringify({ ticker, signal_type: signalType, date: latestDate, momentum: momentum20d.toFixed(1) }),
              citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
              raw: { 
                ticker, 
                latest_price: latestPrice, 
                price_20d_ago: price20d, 
                momentum_pct: momentum20d, 
                days_available: tickerPrices.length,
                ...rawCoverageFields,
              }
            });
          }
        }
      }
    }

    // Batch upsert signals
    let insertedCount = 0;
    const insertBatchSize = 100;
    for (let i = 0; i < signals.length; i += insertBatchSize) {
      const batch = signals.slice(i, i + insertBatchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (!insertError) insertedCount += data?.length || 0;
      else console.error(`[SIGNAL-GEN-MOMENTUM] Batch insert error: ${insertError.message}`);
    }

    // Log diagnostics
    await logDiagnostics(supabaseClient, today, exclusions);

    // Calculate next offset
    const nextOffset = offset + CHUNK_SIZE;
    const hasMore = nextOffset < (totalAssets || 0);

    console.log(`[SIGNAL-GEN-MOMENTUM] ✅ Chunk complete: ${insertedCount} signals created, next_offset: ${hasMore ? nextOffset : null}`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    // Self-chain: if there are more assets to process, fire the next chunk immediately.
    // Fire-and-forget — no await — so this invocation returns before the next one starts.
    if (hasMore) {
      const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-signals-from-momentum`;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
          'x-cron-secret': expectedSecret,
        },
        body: JSON.stringify({ offset: nextOffset }),
      }).catch((err) => console.warn('[SIGNAL-GEN-MOMENTUM] Self-chain trigger failed:', err));
      console.log(`[SIGNAL-GEN-MOMENTUM] Fired next chunk at offset ${nextOffset}`);
    }

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-momentum',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'prices',
      metadata: {
        offset,
        chunk_size: assetBatch.length,
        total_assets: totalAssets,
        next_offset: hasMore ? nextOffset : null,
        signals_generated: signals.length,
        eligible_assets: eligibleAssets.length,
        excluded_no_coverage: exclusions.no_coverage_record.length,
        excluded_not_fresh: exclusions.status_not_fresh.length,
        excluded_insufficient_points: exclusions.insufficient_points_30d.length,
      }
    });

    return new Response(JSON.stringify({ 
      success: true,
      offset,
      tickers_processed: assetBatch.length,
      eligible_assets: eligibleAssets.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount,
      next_offset: hasMore ? nextOffset : null,
      complete: !hasMore,
      total_assets: totalAssets,
      exclusions: {
        no_coverage_record: exclusions.no_coverage_record.length,
        status_not_fresh: exclusions.status_not_fresh.length,
        insufficient_points_30d: exclusions.insufficient_points_30d.length,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-MOMENTUM] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-momentum',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function logDiagnostics(
  supabase: any,
  snapshotDate: string,
  exclusions: Record<string, string[]>
) {
  const diagnosticRows = Object.entries(exclusions)
    .filter(([_, tickers]) => tickers.length > 0)
    .map(([reason, tickers]) => ({
      snapshot_date: snapshotDate,
      generator: 'momentum',
      excluded_reason: reason,
      count: tickers.length,
      sample_tickers: tickers.slice(0, 10),
    }));

  if (diagnosticRows.length > 0) {
    // Upsert to avoid duplicates if run multiple times
    const { error } = await supabase
      .from('signal_generation_diagnostics')
      .upsert(diagnosticRows, { onConflict: 'snapshot_date,generator,excluded_reason', ignoreDuplicates: false });

    if (error) {
      console.error(`[SIGNAL-GEN-MOMENTUM] Diagnostics insert error: ${error.message}`);
    } else {
      console.log(`[SIGNAL-GEN-MOMENTUM] Logged ${diagnosticRows.length} diagnostic entries`);
    }
  }
}
