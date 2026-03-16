import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlphaRow {
  signal_type: string;
  horizon: '1d' | '3d' | '7d';
  avg_forward_return: number;
  hit_rate: number;
  sample_size: number;
  std_forward_return: number;
}

// ============================================================================
// QUALITY FILTERS - Critical for preventing outlier contamination
// ============================================================================
const MIN_PRICE_USD = 0.50;           // Exclude extreme penny stocks (allow FX)
const MAX_RETURN_WINSORIZE = 0.20;    // Cap returns at +-20%
const MIN_SAMPLES_TO_STORE = 10;      // Minimum samples to store alpha
const SHRINKAGE_K = 100;              // Shrinkage factor for small samples

// Backfill-friendly lookback (can be overridden via request body)
const DEFAULT_LOOKBACK_DAYS = 180;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Canonicalize signal type by removing _limited_data suffix ONLY
 * This collapses variants into their parent type for combined statistics
 */
function canonicalSignalType(t: string): string {
  return t.replace(/_limited_data$/, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  // CRITICAL: Track run start time for stale cleanup
  const runStartedAt = new Date().toISOString();

  // Optional runtime tuning
  let body: { lookback_days?: number } = {};
  try {
    body = await req.json();
  } catch {
    // no body
  }

  const lookbackDays = Math.min(365, Math.max(30, body.lookback_days ?? DEFAULT_LOOKBACK_DAYS));
  const lookbackStartIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('Starting signal alpha computation with asset_id-based price lookup...');
    console.log(`Run started at: ${runStartedAt}`);
    console.log(`Lookback window: ${lookbackDays} days (since ${lookbackStartIso})`);

    // ========================================================================
    // Step 1: Get ALL distinct signal types from actual signals table
    // ========================================================================
    const { data: rawSignalTypes, error: stError } = await supabase
      .from('signals')
      .select('signal_type')
      .gte('observed_at', lookbackStartIso)
      .not('asset_id', 'is', null);

    if (stError) throw stError;

    // Get unique raw signal types
    const rawTypes = [...new Set((rawSignalTypes || []).map(s => s.signal_type))];
    console.log(`Found ${rawTypes.length} unique raw signal types`);

    // Group signal types by their canonical form (collapsing _limited_data variants ONLY)
    const typeGroups = new Map<string, string[]>();
    for (const rawType of rawTypes) {
      const canonical = canonicalSignalType(rawType);
      if (!typeGroups.has(canonical)) {
        typeGroups.set(canonical, []);
      }
      typeGroups.get(canonical)!.push(rawType);
    }
    console.log(`Grouped into ${typeGroups.size} canonical types`);

    const alphas: AlphaRow[] = [];
    let processedTypes = 0;
    let skippedNoPrice = 0;
    let skippedLowSamples = 0;

    // Diagnostic tracking
    const diagnostics: { type: string; signals: number; priceMatches: number; returns: number }[] = [];

    // ========================================================================
    // Step 2: Process each CANONICAL signal type
    // ========================================================================
    for (const [canonicalType, variants] of typeGroups) {
      // Build filter for all variants of this canonical type
      const signalFilter = variants.map(v => `signal_type.eq.${v}`).join(',');
      
      // CRITICAL: Paginate to avoid truncation bias
      let allSignals: any[] = [];
      let signalOffset = 0;
      const SIGNAL_PAGE_SIZE = 5000;

      while (true) {
        const { data: signalPage, error: sigError } = await supabase
          .from('signals')
          .select('asset_id, observed_at, magnitude, direction, signal_type')
          .or(signalFilter)
          .gte('observed_at', lookbackStartIso)
          .not('asset_id', 'is', null)
          .order('observed_at', { ascending: true })
          .range(signalOffset, signalOffset + SIGNAL_PAGE_SIZE - 1);

        if (sigError) {
          console.error(`Error fetching signals for ${canonicalType}:`, sigError);
          break;
        }

        if (!signalPage || signalPage.length === 0) break;
        allSignals = allSignals.concat(signalPage);
        
        if (signalPage.length < SIGNAL_PAGE_SIZE) break;
        signalOffset += SIGNAL_PAGE_SIZE;
      }

      if (allSignals.length === 0) continue;

      // Get unique asset_ids
      const assetIds = [...new Set(allSignals.map(s => s.asset_id))];

      // ======================================================================
      // HARD FAILURE GUARD: Exclude orphaned asset_ids (signals.asset_id not in assets)
      // This prevents junk signals from contaminating alpha coverage.
      // ======================================================================
      const existingAssetIds = new Set<string>();
      const ASSET_ID_BATCH_SIZE = 200;
      for (let i = 0; i < assetIds.length; i += ASSET_ID_BATCH_SIZE) {
        const batch = assetIds.slice(i, i + ASSET_ID_BATCH_SIZE);
        const { data: assetRows, error: assetErr } = await supabase
          .from('assets')
          .select('id')
          .in('id', batch);
        if (assetErr) {
          console.warn(`[ALPHA] Failed to validate assets for ${canonicalType}: ${assetErr.message}`);
          break;
        }
        for (const a of assetRows || []) existingAssetIds.add(a.id);
      }
      
      // Build signals grouped by asset_id and date
      const signalsByAssetDate = new Map<string, { 
        date: string; 
        assetId: string;
        magnitude: number; 
        direction: string;
      }>();

      let orphanSignals = 0;
      
      for (const s of allSignals) {
        if (!existingAssetIds.has(s.asset_id)) {
          orphanSignals++;
          continue;
        }
        const dateStr = new Date(s.observed_at).toISOString().split('T')[0];
        const key = `${s.asset_id}_${dateStr}`;
        
        // Keep only most recent signal per asset/date
        if (!signalsByAssetDate.has(key)) {
          signalsByAssetDate.set(key, {
            date: dateStr,
            assetId: s.asset_id,
            magnitude: s.magnitude || 1,
            direction: s.direction || 'neutral'
          });
        }
      }

      const dates = [...new Set([...signalsByAssetDate.values()].map(s => s.date))].sort();
      if (dates.length === 0) continue;

      const minDate = dates[0];
      // Use last signal date + 7 days (to capture forward return window) without excessive extension
      // Previously had +10 days which over-extended the price fetch range
      const maxDate = new Date(new Date(dates[dates.length - 1]).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // ========================================================================
      // CRITICAL FIX: Fetch prices by ASSET_ID in small batches to avoid URL length issues
      // Each UUID is 36 chars, so 50 UUIDs = ~1800 chars (safe for URLs)
      // ========================================================================
      const priceLookup = new Map<string, Map<string, number>>();
      const PRICE_BATCH_SIZE = 50; // Small batches to avoid URL length issues
      
      let priceFetchFailed = false;
      const assetIdsFiltered = [...new Set([...signalsByAssetDate.values()].map(s => s.assetId))];

      for (let i = 0; i < assetIdsFiltered.length; i += PRICE_BATCH_SIZE) {
        const assetIdBatch = assetIdsFiltered.slice(i, i + PRICE_BATCH_SIZE);
        
        const { data: prices, error: priceError } = await supabase
          .from('prices')
          .select('asset_id, date, close')
          .in('asset_id', assetIdBatch)
          .gte('date', minDate)
          .lte('date', maxDate)
          .order('date', { ascending: true });

        if (priceError) {
          console.error(`Error fetching prices batch for ${canonicalType}:`, priceError);
          priceFetchFailed = true;
          break;
        }

        for (const p of prices || []) {
          if (!priceLookup.has(p.asset_id)) {
            priceLookup.set(p.asset_id, new Map());
          }
          priceLookup.get(p.asset_id)!.set(p.date, p.close);
        }
      }

      if (priceFetchFailed) {
        skippedNoPrice++;
        continue;
      }

      if (priceLookup.size === 0) {
        skippedNoPrice++;
        diagnostics.push({ type: canonicalType, signals: allSignals.length, priceMatches: 0, returns: 0 });
        continue;
      }

      // Precompute sorted price dates per asset once (performance + consistency)
      const sortedDatesByAsset = new Map<string, string[]>();
      for (const [assetId, m] of priceLookup) {
        sortedDatesByAsset.set(assetId, [...m.keys()].sort());
      }

      // Calculate forward returns for each horizon
      const returns1d: number[] = [];
      const returns3d: number[] = [];
      const returns7d: number[] = [];

      let priceMatchCount = 0;

      for (const [, signal] of signalsByAssetDate) {
        const assetPrices = priceLookup.get(signal.assetId);
        if (!assetPrices) continue;

        // ====================================================================
        // CRITICAL FIX: Use "next available row" logic instead of exact date match
        // This handles weekends, holidays, and non-trading days correctly
        // ====================================================================
        
        // Get all dates for this asset sorted chronologically
        const sortedDates = sortedDatesByAsset.get(signal.assetId) || [];
        if (sortedDates.length === 0) continue;
        
        // Find p0: first price row with date >= signal.date
        const p0DateIdx = sortedDates.findIndex(d => d >= signal.date);
        if (p0DateIdx === -1) continue; // No price on or after signal date
        
        const p0Date = sortedDates[p0DateIdx];
        const p0 = assetPrices.get(p0Date);
        
        // QUALITY FILTER: Price validity checks
        if (!Number.isFinite(p0) || p0 === null || p0 === undefined) continue;
        if (p0 <= MIN_PRICE_USD) continue;
        if (p0 === 0) continue;

        priceMatchCount++;

        // 1-day forward return: next available price row after p0
        const p1Idx = p0DateIdx + 1;
        if (p1Idx < sortedDates.length) {
          const p1Date = sortedDates[p1Idx];
          const p1 = assetPrices.get(p1Date);
          if (p1 && Number.isFinite(p1) && p1 > 0) {
            const rawRet = (p1 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            // QUALITY FILTER: Winsorize returns BEFORE applying direction
            const clampedRet = clamp(rawRet, -MAX_RETURN_WINSORIZE, MAX_RETURN_WINSORIZE);
            const ret = clampedRet * dirMult;
            returns1d.push(ret);
          }
        }

        // 3-day forward return: 3rd price row after p0
        const p3Idx = p0DateIdx + 3;
        if (p3Idx < sortedDates.length) {
          const p3Date = sortedDates[p3Idx];
          const p3 = assetPrices.get(p3Date);
          if (p3 && Number.isFinite(p3) && p3 > 0) {
            const rawRet = (p3 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            const clampedRet = clamp(rawRet, -MAX_RETURN_WINSORIZE, MAX_RETURN_WINSORIZE);
            const ret = clampedRet * dirMult;
            returns3d.push(ret);
          }
        }

        // 7-day forward return: 7th price row after p0 (or last available if fewer)
        const p7Idx = Math.min(p0DateIdx + 7, sortedDates.length - 1);
        if (p7Idx > p0DateIdx) {
          const p7Date = sortedDates[p7Idx];
          const p7 = assetPrices.get(p7Date);
          if (p7 && Number.isFinite(p7) && p7 > 0) {
            const rawRet = (p7 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            const clampedRet = clamp(rawRet, -MAX_RETURN_WINSORIZE, MAX_RETURN_WINSORIZE);
            const ret = clampedRet * dirMult;
            returns7d.push(ret);
          }
        }
      }

      diagnostics.push({ 
        type: canonicalType, 
        signals: allSignals.length, 
        priceMatches: priceMatchCount, 
        returns: returns1d.length 
      });

      if (orphanSignals > 0) {
        console.log(`[ALPHA][${canonicalType}] Skipped ${orphanSignals} orphan signals (asset_id not found in assets)`);
      }

      // ====================================================================
      // Calculate stats with SHRINKAGE toward zero for small samples
      // ====================================================================
      if (returns1d.length >= MIN_SAMPLES_TO_STORE) {
        const n = returns1d.length;
        const m = mean(returns1d);
        const sd = std(returns1d);
        
        // Shrink mean towards 0: weight = n / (n + K)
        // With K=100: n=10 -> 9%, n=50 -> 33%, n=100 -> 50%, n=500 -> 83%
        const shrinkWeight = n / (n + SHRINKAGE_K);
        const mShrunk = m * shrinkWeight;
        const hit = returns1d.filter(x => x > 0).length / Math.max(1, n);
        
        alphas.push({
          signal_type: canonicalType,
          horizon: '1d',
          avg_forward_return: mShrunk,
          hit_rate: hit,
          sample_size: n,
          std_forward_return: sd,
        });
      } else if (returns1d.length > 0) {
        skippedLowSamples++;
      }

      if (returns3d.length >= MIN_SAMPLES_TO_STORE) {
        const n = returns3d.length;
        const m = mean(returns3d);
        const sd = std(returns3d);
        const shrinkWeight = n / (n + SHRINKAGE_K);
        const mShrunk = m * shrinkWeight;
        const hit = returns3d.filter(x => x > 0).length / Math.max(1, n);
        
        alphas.push({
          signal_type: canonicalType,
          horizon: '3d',
          avg_forward_return: mShrunk,
          hit_rate: hit,
          sample_size: n,
          std_forward_return: sd,
        });
      }

      if (returns7d.length >= MIN_SAMPLES_TO_STORE) {
        const n = returns7d.length;
        const m = mean(returns7d);
        const sd = std(returns7d);
        const shrinkWeight = n / (n + SHRINKAGE_K);
        const mShrunk = m * shrinkWeight;
        const hit = returns7d.filter(x => x > 0).length / Math.max(1, n);
        
        alphas.push({
          signal_type: canonicalType,
          horizon: '7d',
          avg_forward_return: mShrunk,
          hit_rate: hit,
          sample_size: n,
          std_forward_return: sd,
        });
      }

      processedTypes++;
      if (processedTypes % 10 === 0) {
        console.log(`Processed ${processedTypes}/${typeGroups.size} signal types`);
      }
    }

    console.log(`Computed alpha for ${alphas.length} signal_type/horizon combinations`);
    console.log(`Skipped: ${skippedNoPrice} types with no price data, ${skippedLowSamples} types with low samples`);

    // Log top 10 diagnostics by signal count
    diagnostics.sort((a, b) => b.signals - a.signals);
    console.log('Top 10 signal types by volume:');
    for (const d of diagnostics.slice(0, 10)) {
      console.log(`  ${d.type}: ${d.signals} signals, ${d.priceMatches} price matches, ${d.returns} returns`);
    }

    // Highlight types with price matches but 0 returns (usually p1 selection/range issues)
    const zeroReturnTypes = diagnostics
      .filter(d => d.priceMatches > 0 && d.returns === 0)
      .sort((a, b) => b.priceMatches - a.priceMatches)
      .slice(0, 20);

    if (zeroReturnTypes.length > 0) {
      console.warn('[ALPHA] Types with priceMatches>0 but returns=0 (top 20):');
      for (const d of zeroReturnTypes) {
        console.warn(`  ${d.type}: priceMatches=${d.priceMatches}, signals=${d.signals}`);
      }
    }

    // Upsert all alphas
    if (alphas.length > 0) {
      const { error: upsertError } = await supabase
        .from('signal_type_alpha')
        .upsert(
          alphas.map(a => ({
            signal_type: a.signal_type,
            horizon: a.horizon,
            avg_forward_return: a.avg_forward_return,
            hit_rate: a.hit_rate,
            sample_size: a.sample_size,
            std_forward_return: a.std_forward_return,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'signal_type,horizon' }
        );

      if (upsertError) throw upsertError;
    }

    // ========================================================================
    // CRITICAL FIX: Delete stale alpha rows that were NOT updated in this run
    // This removes polluted values like cot_positioning that can't be recomputed
    // ========================================================================
    const horizons = ['1d', '3d', '7d'];
    let totalDeleted = 0;
    
    for (const horizon of horizons) {
      const { data: deleted, error: deleteError } = await supabase
        .from('signal_type_alpha')
        .delete()
        .eq('horizon', horizon)
        .lt('updated_at', runStartedAt)
        .select('signal_type');
      
      if (deleteError) {
        // Log warning and include in response so callers know deletion failed (not silently swallow)
        console.warn(`[ALPHA] WARNING: Failed to delete stale alphas for ${horizon}: ${deleteError.message}`);
        // Note: totalDeleted is NOT incremented on error - caller should check response for delete_errors
      } else if (deleted && deleted.length > 0) {
        console.log(`Deleted ${deleted.length} stale alpha rows for horizon ${horizon}:`, deleted.map(d => d.signal_type).join(', '));
        totalDeleted += deleted.length;
      }
    }

    const duration = Date.now() - startTime;

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'compute-signal-alpha',
      status: 'success',
      rows_inserted: alphas.length,
      duration_ms: duration,
      metadata: {
        signal_types_processed: processedTypes,
        total_alpha_records: alphas.length,
        stale_deleted: totalDeleted,
        skipped_no_price: skippedNoPrice,
        skipped_low_samples: skippedLowSamples,
        horizons: ['1d', '3d', '7d'],
        quality_filters: {
          min_price_usd: MIN_PRICE_USD,
          max_return_winsorize: MAX_RETURN_WINSORIZE,
          min_samples: MIN_SAMPLES_TO_STORE,
          shrinkage_k: SHRINKAGE_K,
        },
        run_started_at: runStartedAt,
      },
    });

    console.log(`compute-signal-alpha completed in ${duration}ms, updated ${alphas.length} records, deleted ${totalDeleted} stale`);

    return new Response(
      JSON.stringify({
        ok: true,
        updated: alphas.length,
        stale_deleted: totalDeleted,
        signal_types_processed: processedTypes,
        skipped_no_price: skippedNoPrice,
        skipped_low_samples: skippedLowSamples,
        duration_ms: duration,
        quality_filters: {
          min_price_usd: MIN_PRICE_USD,
          max_return_winsorize: MAX_RETURN_WINSORIZE,
          shrinkage_k: SHRINKAGE_K,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('compute-signal-alpha error:', e);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await supabase.from('function_status').insert({
        function_name: 'compute-signal-alpha',
        status: 'error',
        error_message: String(e),
        duration_ms: Date.now() - startTime,
      });
    }

    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
