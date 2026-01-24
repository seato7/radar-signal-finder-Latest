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
const MIN_PRICE_USD = 0.10;           // Exclude extreme penny stocks (allow FX)
const MAX_RETURN_WINSORIZE = 0.20;    // Cap returns at +-20%
const MIN_SAMPLES_TO_STORE = 10;      // Minimum samples to store alpha
const SHRINKAGE_K = 100;              // Shrinkage factor for small samples

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
 * Canonicalize signal type by removing _limited_data suffix
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
  
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('Starting signal alpha computation with quality filters...');

    // ========================================================================
    // Step 1: Get ALL distinct signal types from actual signals table
    // ========================================================================
    const { data: rawSignalTypes, error: stError } = await supabase
      .from('signals')
      .select('signal_type')
      .gte('observed_at', new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString())
      .not('asset_id', 'is', null);

    if (stError) throw stError;

    // Get unique raw signal types
    const rawTypes = [...new Set((rawSignalTypes || []).map(s => s.signal_type))];
    console.log(`Found ${rawTypes.length} unique raw signal types`);

    // Group signal types by their canonical form (collapsing _limited_data variants)
    const typeGroups = new Map<string, string[]>();
    for (const rawType of rawTypes) {
      const canonical = canonicalSignalType(rawType);
      if (!typeGroups.has(canonical)) {
        typeGroups.set(canonical, []);
      }
      typeGroups.get(canonical)!.push(rawType);
    }
    console.log(`Grouped into ${typeGroups.size} canonical types`);

    // ========================================================================
    // Step 2: Build asset_id -> ticker lookup map
    // ========================================================================
    const { data: allAssets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker');
    
    if (assetsError) throw assetsError;
    
    const assetIdToTicker = new Map<string, string>();
    for (const a of allAssets || []) {
      assetIdToTicker.set(a.id, a.ticker);
    }
    console.log(`Built lookup map for ${assetIdToTicker.size} assets`);

    const alphas: AlphaRow[] = [];
    let processedTypes = 0;

    // ========================================================================
    // Step 3: Process each CANONICAL signal type (including _limited_data)
    // ========================================================================
    for (const [canonicalType, variants] of typeGroups) {
      // Build filter for all variants of this canonical type
      // e.g., for "momentum_5d_bullish", query both "momentum_5d_bullish" and "momentum_5d_bullish_limited_data"
      const signalFilter = variants.map(v => `signal_type.eq.${v}`).join(',');
      
      const { data: signals, error: sigError } = await supabase
        .from('signals')
        .select('asset_id, observed_at, magnitude, direction, signal_type')
        .or(signalFilter)
        .gte('observed_at', new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString())
        .not('asset_id', 'is', null)
        .limit(10000);

      if (sigError) {
        console.error(`Error fetching signals for ${canonicalType}:`, sigError);
        continue;
      }

      if (!signals || signals.length === 0) continue;

      // Group signals by ticker and date
      const signalsByTickerDate = new Map<string, { 
        date: string; 
        ticker: string; 
        magnitude: number; 
        direction: string;
      }>();
      
      for (const s of signals) {
        const ticker = assetIdToTicker.get(s.asset_id);
        if (!ticker) continue;
        
        const dateStr = new Date(s.observed_at).toISOString().split('T')[0];
        const key = `${ticker}_${dateStr}`;
        
        // Keep only most recent signal per ticker/date
        if (!signalsByTickerDate.has(key)) {
          signalsByTickerDate.set(key, {
            date: dateStr,
            ticker,
            magnitude: s.magnitude || 1,
            direction: s.direction || 'neutral'
          });
        }
      }

      // Get unique tickers and date range
      const tickers = [...new Set([...signalsByTickerDate.values()].map(s => s.ticker))];
      const dates = [...new Set([...signalsByTickerDate.values()].map(s => s.date))].sort();

      if (tickers.length === 0 || dates.length === 0) continue;

      // Fetch prices for these tickers covering the date range
      const minDate = dates[0];
      const maxDate = new Date(new Date(dates[dates.length - 1]).getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: prices, error: priceError } = await supabase
        .from('prices')
        .select('ticker, date, close')
        .in('ticker', tickers.slice(0, 500))
        .gte('date', minDate)
        .lte('date', maxDate)
        .order('date', { ascending: true });

      if (priceError) {
        console.error(`Error fetching prices for ${canonicalType}:`, priceError);
        continue;
      }

      if (!prices || prices.length === 0) continue;

      // Build price lookup: ticker -> date -> close
      const priceLookup = new Map<string, Map<string, number>>();
      for (const p of prices) {
        if (!priceLookup.has(p.ticker)) {
          priceLookup.set(p.ticker, new Map());
        }
        priceLookup.get(p.ticker)!.set(p.date, p.close);
      }

      // Calculate forward returns for each horizon
      const returns1d: number[] = [];
      const returns3d: number[] = [];
      const returns7d: number[] = [];

      for (const [, signal] of signalsByTickerDate) {
        const tickerPrices = priceLookup.get(signal.ticker);
        if (!tickerPrices) continue;

        const p0 = tickerPrices.get(signal.date);
        
        // QUALITY FILTER: Price validity checks
        if (!Number.isFinite(p0) || p0 === null || p0 === undefined) continue;
        if (p0 <= MIN_PRICE_USD) continue;
        if (p0 === 0) continue;

        const futureDates = [...tickerPrices.keys()]
          .filter(d => d > signal.date)
          .sort();

        // 1-day forward return
        if (futureDates.length >= 1) {
          const p1 = tickerPrices.get(futureDates[0]);
          if (p1 && Number.isFinite(p1) && p1 > 0) {
            const rawRet = (p1 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            // QUALITY FILTER: Winsorize returns
            const ret = clamp(rawRet, -MAX_RETURN_WINSORIZE, MAX_RETURN_WINSORIZE) * dirMult;
            returns1d.push(ret);
          }
        }

        // 3-day forward return
        if (futureDates.length >= 3) {
          const p3 = tickerPrices.get(futureDates[2]);
          if (p3 && Number.isFinite(p3) && p3 > 0) {
            const rawRet = (p3 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            const ret = clamp(rawRet, -MAX_RETURN_WINSORIZE, MAX_RETURN_WINSORIZE) * dirMult;
            returns3d.push(ret);
          }
        }

        // 7-day forward return
        if (futureDates.length >= 5) {
          const targetIdx = Math.min(6, futureDates.length - 1);
          const p7 = tickerPrices.get(futureDates[targetIdx]);
          if (p7 && Number.isFinite(p7) && p7 > 0) {
            const rawRet = (p7 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            const ret = clamp(rawRet, -MAX_RETURN_WINSORIZE, MAX_RETURN_WINSORIZE) * dirMult;
            returns7d.push(ret);
          }
        }
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
        horizons: ['1d', '3d', '7d'],
        quality_filters: {
          min_price_usd: MIN_PRICE_USD,
          max_return_winsorize: MAX_RETURN_WINSORIZE,
          min_samples: MIN_SAMPLES_TO_STORE,
          shrinkage_k: SHRINKAGE_K,
        },
      },
    });

    console.log(`compute-signal-alpha completed in ${duration}ms, updated ${alphas.length} records`);

    return new Response(
      JSON.stringify({
        ok: true,
        updated: alphas.length,
        signal_types_processed: processedTypes,
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
