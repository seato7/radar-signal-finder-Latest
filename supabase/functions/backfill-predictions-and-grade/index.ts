import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const TOP_N_VALUES = [20, 50, 100];
const MIN_PRICE_USD = 1.00;
const MAX_RETURN_WINSORIZE = 0.20;

// Half-life by signal category (same as production scoring)
const HALF_LIFE_BY_CATEGORY: Record<string, number> = {
  InsiderPoliticianConfirm: 45,
  BigMoneyConfirm: 60,
  FlowPressure: 10,
  CapexMomentum: 30,
  TechEdge: 5,
  PolicyMomentum: 21,
  MacroEconomic: 14,
  Attention: 2,
  EarningsMomentum: 14,
  RiskFlags: 7,
};

// Signal type to component mapping (subset for key signals)
const SIGNAL_TYPE_TO_COMPONENT: Record<string, string> = {
  'filing_13f_new': 'BigMoneyConfirm',
  'filing_13f_increase': 'BigMoneyConfirm',
  '13f_new_position': 'BigMoneyConfirm',
  'smart_money': 'BigMoneyConfirm',
  'institutional_buying': 'BigMoneyConfirm',
  'dark_pool_activity': 'FlowPressure',
  'flow_pressure_etf': 'FlowPressure',
  'etf_inflow': 'FlowPressure',
  'insider_buy': 'InsiderPoliticianConfirm',
  'insider_sell': 'InsiderPoliticianConfirm',
  'form4_buy': 'InsiderPoliticianConfirm',
  'politician_buy': 'InsiderPoliticianConfirm',
  'technical_breakout': 'TechEdge',
  'pattern_detected': 'TechEdge',
  'momentum_5d_bullish': 'TechEdge',
  'momentum_5d_bearish': 'TechEdge',
  'momentum_5d_strong_bullish': 'TechEdge',
  'momentum_20d_bullish': 'TechEdge',
  'unusual_options': 'TechEdge',
  'news_mention': 'Attention',
  'news_sentiment': 'Attention',
  'sentiment_bullish': 'Attention',
  'cot_positioning': 'MacroEconomic',
  'short_interest': 'RiskFlags',
  'short_interest_high': 'RiskFlags',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function expDecay(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  return Math.exp(-Math.log(2) * ageDays / halfLifeDays);
}

function winsorize(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}

function confidenceLabel(cs: number): string {
  if (cs >= 2.0) return 'very_confident';
  if (cs >= 1.5) return 'confident';
  if (cs >= 1.0) return 'moderate';
  if (cs >= 0.5) return 'speculative';
  return 'risky';
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function computeMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) return 0;
  const equity: number[] = [1];
  for (const r of returns) {
    equity.push(equity[equity.length - 1] * (1 + r));
  }
  let maxDD = 0;
  let peak = equity[0];
  for (const val of equity) {
    if (val > peak) peak = val;
    const dd = (peak - val) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function computeObjectiveScore(hitRate: number, meanReturn: number, p5: number, vol: number): number {
  const tailPenalty = p5 < -0.02 ? Math.abs(p5 + 0.02) * 10 : 0;
  const volPenalty = vol > 0.03 ? (vol - 0.03) * 10 : 0;
  return 0.65 * hitRate + 0.35 * meanReturn * 100 - 0.50 * tailPenalty - 0.25 * volPenalty;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse parameters
    let body: { 
      start_date?: string; 
      end_date?: string; 
      top_n_list?: number[];
      model_version?: string;
      batch_size?: number;
    } = {};
    
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    const modelVersion = body.model_version || 'v1_alpha';
    const topNList = body.top_n_list || TOP_N_VALUES;
    const batchSize = body.batch_size || 5; // Days per batch to avoid timeout

    // Default: last 30 days (adjustable)
    const today = new Date();
    const defaultEnd = new Date(today.getTime() - 24 * 60 * 60 * 1000); // Yesterday
    const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    const startDate = body.start_date || defaultStart.toISOString().slice(0, 10);
    const endDate = body.end_date || defaultEnd.toISOString().slice(0, 10);

    console.log(`Backfilling predictions from ${startDate} to ${endDate} for model ${modelVersion}...`);

    // Generate date range
    const dates: string[] = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }

    console.log(`Processing ${dates.length} dates in batches of ${batchSize}...`);

    // Check which dates already have predictions
    const { data: existingDates } = await supabase
      .from('asset_predictions')
      .select('snapshot_date')
      .eq('model_version', modelVersion)
      .in('snapshot_date', dates);

    const existingSet = new Set((existingDates || []).map(d => d.snapshot_date));
    const datesToProcess = dates.filter(d => !existingSet.has(d));

    console.log(`${datesToProcess.length} dates need processing (${existingSet.size} already exist)`);

    if (datesToProcess.length === 0) {
      // Just run grading for existing predictions
      console.log('All dates exist, running grading only...');
    }

    // Fetch signal_type_alpha for scoring
    const { data: alphaRows } = await supabase
      .from('signal_type_alpha')
      .select('signal_type, avg_forward_return, std_forward_return, sample_size')
      .eq('horizon', '1d');

    const alphaMap = new Map<string, { alpha: number; sd: number }>();
    for (const r of alphaRows || []) {
      alphaMap.set(r.signal_type, {
        alpha: Number(r.avg_forward_return ?? 0),
        sd: Number(r.std_forward_return ?? 0),
      });
    }

    console.log(`Loaded ${alphaMap.size} signal alphas`);

    // Fetch all assets
    const { data: assets } = await supabase
      .from('assets')
      .select('id, ticker, asset_class');

    const assetMap = new Map<string, { id: string; ticker: string; asset_class: string }>();
    const tickerToAssetId = new Map<string, string>();
    for (const a of assets || []) {
      assetMap.set(a.id, a);
      tickerToAssetId.set(a.ticker, a.id);
    }

    console.log(`Loaded ${assetMap.size} assets`);

    let totalPredictions = 0;
    let totalGraded = 0;
    let daysProcessed = 0;
    const errors: string[] = [];

    // Process in batches
    const batches: string[][] = [];
    for (let i = 0; i < datesToProcess.length; i += batchSize) {
      batches.push(datesToProcess.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      console.log(`Processing batch: ${batch[0]} to ${batch[batch.length - 1]}`);

      for (const dateStr of batch) {
        try {
          // Get signals observed on or before this date (within 30-day lookback)
          const lookbackStart = new Date(new Date(dateStr).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const dateEnd = `${dateStr}T23:59:59Z`;

          const { data: signals } = await supabase
            .from('signals')
            .select('asset_id, signal_type, magnitude, direction, observed_at')
            .gte('observed_at', lookbackStart)
            .lte('observed_at', dateEnd)
            .not('asset_id', 'is', null);

          if (!signals || signals.length === 0) {
            console.log(`No signals for ${dateStr}, skipping...`);
            continue;
          }

          // Get prices on this date for filtering
          const { data: prices } = await supabase
            .from('prices')
            .select('ticker, close')
            .eq('date', dateStr);

          const priceMap = new Map<string, number>();
          for (const p of prices || []) {
            priceMap.set(p.ticker, Number(p.close));
          }

          // Group signals by asset
          const signalsByAsset = new Map<string, any[]>();
          for (const s of signals) {
            if (!signalsByAsset.has(s.asset_id)) signalsByAsset.set(s.asset_id, []);
            signalsByAsset.get(s.asset_id)!.push(s);
          }

          // Score each asset as-of this date
          const assetScores: {
            asset_id: string;
            ticker: string;
            expected_return: number;
            confidence_score: number;
            confidence_label: string;
          }[] = [];

          const targetDate = new Date(dateStr);

          for (const [assetId, assetSignals] of signalsByAsset) {
            const asset = assetMap.get(assetId);
            if (!asset) continue;

            // Apply price filter
            const price = priceMap.get(asset.ticker);
            if (price !== undefined && price < MIN_PRICE_USD) continue;

            let expectedReturn = 0;
            let alphaStdPenalty = 0;
            let pos = 0;
            let neg = 0;

            for (const s of assetSignals) {
              const signalType = String(s.signal_type);
              const mag = Math.min(Number(s.magnitude ?? 1), 5);
              const observedAt = new Date(s.observed_at);
              const ageDays = (targetDate.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);

              const component = SIGNAL_TYPE_TO_COMPONENT[signalType];
              const halfLifeDays = component ? (HALF_LIFE_BY_CATEGORY[component] || 14) : 14;
              const decay = expDecay(ageDays, halfLifeDays);

              const alphaRec = alphaMap.get(signalType);
              const alpha = alphaRec ? alphaRec.alpha : 0;
              const dirMult = s.direction === 'up' ? 1 : (s.direction === 'down' ? -1 : 1);

              const contrib = decay * mag * alpha * dirMult;
              expectedReturn += contrib;

              if (alphaRec && alphaRec.sd > 0) {
                alphaStdPenalty += decay * Math.min(0.02, alphaRec.sd);
              }

              if (contrib > 0) pos += contrib;
              if (contrib < 0) neg += Math.abs(contrib);
            }

            // Calculate disagreement penalty
            let disagreementPenalty = 0;
            if (pos > 0 && neg > 0) {
              const ratio = Math.min(pos, neg) / Math.max(pos, neg);
              disagreementPenalty = ratio * 0.02;
            }

            const uncertainty = Math.max(0.005, alphaStdPenalty + disagreementPenalty);
            const confScore = expectedReturn !== 0 ? expectedReturn / uncertainty : 0;

            assetScores.push({
              asset_id: assetId,
              ticker: asset.ticker,
              expected_return: expectedReturn,
              confidence_score: confScore,
              confidence_label: confidenceLabel(confScore),
            });
          }

          // Sort by expected_return descending
          assetScores.sort((a, b) => b.expected_return - a.expected_return);

          // Create predictions for each top_n
          const predictions: {
            snapshot_date: string;
            asset_id: string;
            ticker: string;
            expected_return: number;
            confidence_score: number;
            confidence_label: string;
            rank: number;
            model_version: string;
            feature_snapshot: object;
            top_n: number;
          }[] = [];

          const maxN = Math.max(...topNList);
          const topAssets = assetScores.filter(a => a.expected_return > 0).slice(0, maxN);

          for (let i = 0; i < topAssets.length; i++) {
            const a = topAssets[i];
            const rank = i + 1;
            
            // Determine which top_n bucket this belongs to
            let topN = maxN;
            for (const n of topNList.sort((a, b) => a - b)) {
              if (rank <= n) {
                topN = n;
                break;
              }
            }

            predictions.push({
              snapshot_date: dateStr,
              asset_id: a.asset_id,
              ticker: a.ticker,
              expected_return: a.expected_return,
              confidence_score: a.confidence_score,
              confidence_label: a.confidence_label,
              rank,
              model_version: modelVersion,
              feature_snapshot: {
                expected_return: a.expected_return,
                confidence_score: a.confidence_score,
                signal_count: signalsByAsset.get(a.asset_id)?.length || 0,
              },
              top_n: topN,
            });
          }

          // Insert predictions
          if (predictions.length > 0) {
            const { error: insErr } = await supabase.from('asset_predictions').insert(predictions);
            if (insErr) {
              console.error(`Error inserting predictions for ${dateStr}:`, insErr.message);
              errors.push(`${dateStr}: ${insErr.message}`);
            } else {
              totalPredictions += predictions.length;
            }
          }

          daysProcessed++;
        } catch (e) {
          console.error(`Error processing ${dateStr}:`, e);
          errors.push(`${dateStr}: ${String(e)}`);
        }
      }
    }

    console.log(`Prediction backfill complete. Now grading...`);

    // Grade all predictions that don't have results
    const { data: ungradedPreds } = await supabase
      .from('asset_predictions')
      .select(`
        id,
        snapshot_date,
        ticker,
        expected_return,
        rank,
        top_n,
        asset_prediction_results!left(id)
      `)
      .eq('model_version', modelVersion)
      .is('asset_prediction_results.id', null);

    console.log(`Found ${ungradedPreds?.length || 0} ungraded predictions to grade`);

    if (ungradedPreds && ungradedPreds.length > 0) {
      // Group by snapshot_date
      const predsByDate = new Map<string, any[]>();
      for (const p of ungradedPreds) {
        if (!predsByDate.has(p.snapshot_date)) predsByDate.set(p.snapshot_date, []);
        predsByDate.get(p.snapshot_date)!.push(p);
      }

      for (const [snapDate, preds] of predsByDate) {
        // Get next day date
        const nextDate = new Date(new Date(snapDate).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        
        // Get tickers
        const tickers = [...new Set(preds.map(p => p.ticker))];

        // Fetch prices for snapshot date and next day
        const { data: pricesT0 } = await supabase
          .from('prices')
          .select('ticker, close')
          .in('ticker', tickers)
          .eq('date', snapDate);

        const { data: pricesT1 } = await supabase
          .from('prices')
          .select('ticker, close')
          .in('ticker', tickers)
          .eq('date', nextDate);

        const priceT0Map = new Map<string, number>();
        const priceT1Map = new Map<string, number>();
        for (const p of pricesT0 || []) priceT0Map.set(p.ticker, p.close);
        for (const p of pricesT1 || []) priceT1Map.set(p.ticker, p.close);

        const results: {
          prediction_id: string;
          horizon: string;
          realized_return: number;
          hit: boolean;
        }[] = [];

        for (const pred of preds) {
          const c0 = priceT0Map.get(pred.ticker);
          const c1 = priceT1Map.get(pred.ticker);

          if (!c0 || !c1 || c0 === 0) continue;

          let realizedReturn = (c1 / c0) - 1;
          realizedReturn = winsorize(realizedReturn, MAX_RETURN_WINSORIZE);

          const expectedDir = pred.expected_return > 0 ? 1 : -1;
          const realizedDir = realizedReturn > 0 ? 1 : -1;
          const hit = expectedDir === realizedDir;

          results.push({
            prediction_id: pred.id,
            horizon: '1d',
            realized_return: realizedReturn,
            hit,
          });
        }

        if (results.length > 0) {
          const { error: gradeErr } = await supabase.from('asset_prediction_results').insert(results);
          if (gradeErr) {
            console.error(`Error grading ${snapDate}:`, gradeErr.message);
          } else {
            totalGraded += results.length;
          }
        }
      }
    }

    console.log(`Grading complete. Computing daily metrics...`);

    // Compute model_daily_metrics
    const { data: allResults } = await supabase
      .from('asset_prediction_results')
      .select(`
        id,
        realized_return,
        hit,
        asset_predictions!inner(
          snapshot_date,
          rank,
          model_version,
          top_n
        )
      `)
      .eq('horizon', '1d')
      .eq('asset_predictions.model_version', modelVersion);

    // Group by date and top_n
    const metricGroups = new Map<string, { returns: number[]; hits: number; total: number }>();

    for (const r of allResults || []) {
      const pred = r.asset_predictions as any;
      const dateStr = pred.snapshot_date;
      const rank = pred.rank || 1;

      for (const topN of topNList) {
        if (rank <= topN) {
          const key = `${dateStr}|${topN}`;
          if (!metricGroups.has(key)) {
            metricGroups.set(key, { returns: [], hits: 0, total: 0 });
          }
          const group = metricGroups.get(key)!;
          group.returns.push(Number(r.realized_return));
          if (r.hit) group.hits++;
          group.total++;
        }
      }
    }

    console.log(`Computing metrics for ${metricGroups.size} date/topN combinations...`);

    let metricsInserted = 0;
    for (const [key, group] of metricGroups) {
      const [dateStr, topNStr] = key.split('|');
      const topN = parseInt(topNStr);
      const { returns, hits, total } = group;

      if (returns.length === 0) continue;

      const hitRate = total > 0 ? hits / total : 0;
      const meanRet = mean(returns);
      const medianRet = median(returns);
      const vol = std(returns);
      const p5 = percentile(returns, 5);
      const maxDD = computeMaxDrawdown(returns);
      const cumRet = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
      const objScore = computeObjectiveScore(hitRate, meanRet, p5, vol);

      const { error: metricErr } = await supabase
        .from('model_daily_metrics')
        .upsert({
          model_version: modelVersion,
          snapshot_date: dateStr,
          top_n: topN,
          hit_rate: hitRate,
          mean_return: meanRet,
          median_return: medianRet,
          volatility: vol,
          p5_return: p5,
          max_drawdown: maxDD,
          cumulative_return: cumRet,
          objective_score: objScore,
          predictions_count: total,
          graded_count: returns.length,
        }, { onConflict: 'model_version,snapshot_date,top_n' });

      if (!metricErr) metricsInserted++;
    }

    const duration = Date.now() - startTime;

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'backfill-predictions-and-grade',
      status: 'success',
      rows_inserted: totalPredictions + totalGraded + metricsInserted,
      duration_ms: duration,
      metadata: {
        start_date: startDate,
        end_date: endDate,
        model_version: modelVersion,
        days_processed: daysProcessed,
        predictions_created: totalPredictions,
        predictions_graded: totalGraded,
        metrics_computed: metricsInserted,
        errors: errors.slice(0, 10),
      },
    });

    console.log(`backfill-predictions-and-grade completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        start_date: startDate,
        end_date: endDate,
        model_version: modelVersion,
        days_processed: daysProcessed,
        predictions_created: totalPredictions,
        predictions_graded: totalGraded,
        metrics_computed: metricsInserted,
        duration_ms: duration,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('backfill-predictions-and-grade error:', e);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await supabase.from('function_status').insert({
        function_name: 'backfill-predictions-and-grade',
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
