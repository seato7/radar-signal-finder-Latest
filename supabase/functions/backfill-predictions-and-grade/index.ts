// redeployed 2026-03-17
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
const NEUTRAL_ALPHA_FALLBACK = 0.002; // 0.2% for uncalibrated signals
const HALF_LIFE_DEFAULT = 14;

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

// Signal type to component mapping
const SIGNAL_TYPE_TO_COMPONENT: Record<string, string> = {
  'filing_13f_new': 'BigMoneyConfirm',
  'filing_13f_increase': 'BigMoneyConfirm',
  'filing_13f_decrease': 'BigMoneyConfirm',
  '13f_new_position': 'BigMoneyConfirm',
  '13f_increase': 'BigMoneyConfirm',
  '13f_decrease': 'BigMoneyConfirm',
  'smart_money': 'BigMoneyConfirm',
  'smart_money_flow': 'BigMoneyConfirm',
  'institutional_buying': 'BigMoneyConfirm',
  'institutional_selling': 'BigMoneyConfirm',
  'dark_pool_activity': 'FlowPressure',
  'darkpool_block': 'FlowPressure',
  'flow_pressure_etf': 'FlowPressure',
  'flow_pressure': 'FlowPressure',
  'etf_inflow': 'FlowPressure',
  'etf_outflow': 'FlowPressure',
  'insider_buy': 'InsiderPoliticianConfirm',
  'insider_sell': 'InsiderPoliticianConfirm',
  'form4_buy': 'InsiderPoliticianConfirm',
  'form4_sell': 'InsiderPoliticianConfirm',
  'politician_buy': 'InsiderPoliticianConfirm',
  'politician_sell': 'InsiderPoliticianConfirm',
  'technical_breakout': 'TechEdge',
  'technical_breakdown': 'TechEdge',
  'pattern_detected': 'TechEdge',
  'momentum_5d_bullish': 'TechEdge',
  'momentum_5d_bearish': 'TechEdge',
  'momentum_5d_strong_bullish': 'TechEdge',
  'momentum_5d_strong_bearish': 'TechEdge',
  'momentum_20d_bullish': 'TechEdge',
  'momentum_20d_bearish': 'TechEdge',
  'unusual_options': 'TechEdge',
  'options_sweep': 'TechEdge',
  'news_mention': 'Attention',
  'news_sentiment': 'Attention',
  'sentiment_bullish': 'Attention',
  'sentiment_bearish': 'Attention',
  'breaking_news': 'Attention',
  'cot_positioning': 'MacroEconomic',
  'cot_bullish': 'MacroEconomic',
  'cot_bearish': 'MacroEconomic',
  'economic_indicator': 'MacroEconomic',
  'short_interest': 'RiskFlags',
  'short_interest_high': 'RiskFlags',
  'short_squeeze': 'RiskFlags',
  'earnings_surprise': 'EarningsMomentum',
  'earnings_beat': 'EarningsMomentum',
  'earnings_miss': 'EarningsMomentum',
  'capex_hiring': 'CapexMomentum',
  'patent_filed': 'CapexMomentum',
  'policy_keyword': 'PolicyMomentum',
  'policy_mention': 'PolicyMomentum',
};

// V0 legacy weights for baseline comparison
const V0_WEIGHTS: Record<string, number> = {
  BigMoneyConfirm: 1.5,
  FlowPressure: 1.4,
  InsiderPoliticianConfirm: 1.2,
  CapexMomentum: 1.0,
  PolicyMomentum: 0.8,
  TechEdge: 0.7,
  Attention: 0.6,
  MacroEconomic: 0.5,
  EarningsMomentum: 0.6,
  RiskFlags: -2.0,
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

// Seeded pseudo-random for deterministic random baseline
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

interface SignalData {
  asset_id: string;
  signal_type: string;
  magnitude: number | null;
  direction: string | null;
  observed_at: string;
}

interface AlphaRecord {
  alpha: number;
  sd: number;
}

// V1_ALPHA: profitability-calibrated scoring
function computeV1AlphaScore(
  signals: SignalData[],
  asOfDate: Date,
  alphaMap: Map<string, AlphaRecord>
): { expected_return: number; confidence_score: number } {
  let expectedReturn = 0;
  let alphaStdPenalty = 0;
  let pos = 0;
  let neg = 0;

  for (const s of signals) {
    const signalType = String(s.signal_type);
    const mag = Math.min(Number(s.magnitude ?? 1), 5);
    const observedAt = new Date(s.observed_at);
    const ageDays = (asOfDate.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);

    const component = SIGNAL_TYPE_TO_COMPONENT[signalType];
    const halfLifeDays = component ? (HALF_LIFE_BY_CATEGORY[component] || HALF_LIFE_DEFAULT) : HALF_LIFE_DEFAULT;
    const decay = expDecay(ageDays, halfLifeDays);

    // Use calibrated alpha or neutral fallback
    const alphaRec = alphaMap.get(signalType);
    const alpha = alphaRec ? alphaRec.alpha : NEUTRAL_ALPHA_FALLBACK;
    const dirMult = s.direction === 'up' ? 1 : (s.direction === 'down' ? -1 : 1);

    const contrib = decay * mag * alpha * dirMult;
    expectedReturn += contrib;

    if (alphaRec && alphaRec.sd > 0) {
      alphaStdPenalty += decay * Math.min(0.02, alphaRec.sd);
    }

    if (contrib > 0) pos += contrib;
    if (contrib < 0) neg += Math.abs(contrib);
  }

  let disagreementPenalty = 0;
  if (pos > 0 && neg > 0) {
    const ratio = Math.min(pos, neg) / Math.max(pos, neg);
    disagreementPenalty = ratio * 0.02;
  }

  const uncertainty = Math.max(0.005, alphaStdPenalty + disagreementPenalty);
  const confScore = expectedReturn !== 0 ? expectedReturn / uncertainty : 0;

  return { expected_return: expectedReturn, confidence_score: confScore };
}

// V0_WEIGHTS: legacy static weight scoring
function computeV0WeightsScore(
  signals: SignalData[],
  asOfDate: Date
): { expected_return: number; confidence_score: number } {
  const componentScores: Record<string, number> = {};
  for (const key of Object.keys(V0_WEIGHTS)) {
    componentScores[key] = 0;
  }

  for (const s of signals) {
    const signalType = String(s.signal_type);
    const mag = Number(s.magnitude ?? 1);
    const observedAt = new Date(s.observed_at);
    const ageDays = (asOfDate.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decay = expDecay(ageDays, HALF_LIFE_DEFAULT);

    const component = SIGNAL_TYPE_TO_COMPONENT[signalType];
    if (component && componentScores[component] !== undefined) {
      const dirMult = s.direction === 'up' ? 1 : (s.direction === 'down' ? -1 : 1);
      componentScores[component] += mag * decay * dirMult;
    }
  }

  // Compute weighted sum
  let rawScore = 0;
  let activeWeight = 0;
  for (const [comp, val] of Object.entries(componentScores)) {
    const weight = V0_WEIGHTS[comp] || 0;
    // Normalize using log scale
    const normalized = val > 0 ? Math.log10(1 + val) * 30 : (val < 0 ? -Math.log10(1 + Math.abs(val)) * 30 : 0);
    const capped = Math.max(-100, Math.min(100, normalized));
    rawScore += weight * capped;
    if (Math.abs(capped) > 0.1 && weight > 0) {
      activeWeight += weight * 100;
    }
  }

  // Convert to pseudo expected_return (-0.03 to +0.03)
  const normalizedScore = activeWeight > 0 ? rawScore / activeWeight : 0;
  const expectedReturn = (normalizedScore / 100) * 0.03;
  const confScore = Math.abs(normalizedScore) / 50;

  return { expected_return: expectedReturn, confidence_score: confScore };
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
      model_versions?: string[];
      batch_size?: number;
    } = {};
    
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    const modelVersions = body.model_versions || ['v1_alpha', 'v0_weights', 'random'];
    const topNList = body.top_n_list || TOP_N_VALUES;
    const batchSize = body.batch_size || 3; // Days per batch

    // Default: last 30 days (but end_date must be <= yesterday so we have D+1 for grading)
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const defaultStart = new Date(yesterday.getTime() - 30 * 24 * 60 * 60 * 1000);

    const startDate = body.start_date || defaultStart.toISOString().slice(0, 10);
    const endDate = body.end_date || yesterday.toISOString().slice(0, 10);

    console.log(`Backfilling predictions from ${startDate} to ${endDate} for models: ${modelVersions.join(', ')}...`);

    // Generate date range
    const dates: string[] = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }

    console.log(`Processing ${dates.length} dates in batches of ${batchSize}...`);

    // Fetch signal_type_alpha for v1_alpha scoring
    const { data: alphaRows } = await supabase
      .from('signal_type_alpha')
      .select('signal_type, avg_forward_return, std_forward_return')
      .eq('horizon', '1d');

    const alphaMap = new Map<string, AlphaRecord>();
    for (const r of alphaRows || []) {
      alphaMap.set(r.signal_type, {
        alpha: Number(r.avg_forward_return ?? 0),
        sd: Number(r.std_forward_return ?? 0),
      });
    }

    console.log(`Loaded ${alphaMap.size} signal alphas`);

    // Fetch all assets (paginated to overcome 1000 row limit)
    const assetMap = new Map<string, { id: string; ticker: string; asset_class: string }>();
    const tickerToAssetId = new Map<string, string>();
    
    let assetOffset = 0;
    const assetPageSize = 1000;
    while (true) {
      const { data: assetPage } = await supabase
        .from('assets')
        .select('id, ticker, asset_class')
        .range(assetOffset, assetOffset + assetPageSize - 1);
      
      if (!assetPage || assetPage.length === 0) break;
      
      for (const a of assetPage) {
        assetMap.set(a.id, a);
        tickerToAssetId.set(a.ticker, a.id);
      }
      
      if (assetPage.length < assetPageSize) break;
      assetOffset += assetPageSize;
    }

    console.log(`Loaded ${assetMap.size} assets`);

    let totalPredictions = 0;
    let totalGraded = 0;
    let daysProcessed = 0;
    const errors: string[] = [];
    const diagnosticsToInsert: { snapshot_date: string; excluded_reason: string; count: number; sample_tickers: string[] }[] = [];

    // Process each date
    for (const dateStr of dates) {
      try {
        const targetDate = new Date(dateStr);
        const nextDateStr = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        // ======================================================================
        // STEP 1: BUILD ELIGIBLE UNIVERSE FOR DATE D
        // Requirements:
        // - Has price close on D
        // - Has price close on D+1 (for grading)
        // - Price >= MIN_PRICE_USD
        // ======================================================================
        
        // Fetch prices for D and D+1 (paginated)
        const priceMapD = new Map<string, number>();
        const priceMapD1 = new Map<string, number>();
        
        // Fetch D prices
        let priceOffset = 0;
        while (true) {
          const { data: pricePage } = await supabase
            .from('prices')
            .select('ticker, close')
            .eq('date', dateStr)
            .range(priceOffset, priceOffset + 999);
          
          if (!pricePage || pricePage.length === 0) break;
          for (const p of pricePage) priceMapD.set(p.ticker, Number(p.close));
          if (pricePage.length < 1000) break;
          priceOffset += 1000;
        }
        
        // Fetch D+1 prices
        priceOffset = 0;
        while (true) {
          const { data: pricePage } = await supabase
            .from('prices')
            .select('ticker, close')
            .eq('date', nextDateStr)
            .range(priceOffset, priceOffset + 999);
          
          if (!pricePage || pricePage.length === 0) break;
          for (const p of pricePage) priceMapD1.set(p.ticker, Number(p.close));
          if (pricePage.length < 1000) break;
          priceOffset += 1000;
        }

        // Determine eligible assets
        const eligibleAssets: { id: string; ticker: string; priceD: number; priceD1: number }[] = [];
        const excluded = {
          no_price_d: { count: 0, samples: [] as string[] },
          no_price_d1: { count: 0, samples: [] as string[] },
          price_too_low: { count: 0, samples: [] as string[] },
        };

        for (const [id, asset] of assetMap) {
          const priceD = priceMapD.get(asset.ticker);
          const priceD1 = priceMapD1.get(asset.ticker);

          if (priceD === undefined) {
            excluded.no_price_d.count++;
            if (excluded.no_price_d.samples.length < 10) excluded.no_price_d.samples.push(asset.ticker);
            continue;
          }

          if (priceD1 === undefined) {
            excluded.no_price_d1.count++;
            if (excluded.no_price_d1.samples.length < 10) excluded.no_price_d1.samples.push(asset.ticker);
            continue;
          }

          if (priceD < MIN_PRICE_USD) {
            excluded.price_too_low.count++;
            if (excluded.price_too_low.samples.length < 10) excluded.price_too_low.samples.push(asset.ticker);
            continue;
          }

          eligibleAssets.push({ id, ticker: asset.ticker, priceD, priceD1 });
        }

        // Log diagnostics
        for (const [reason, data] of Object.entries(excluded)) {
          if (data.count > 0) {
            diagnosticsToInsert.push({
              snapshot_date: dateStr,
              excluded_reason: reason,
              count: data.count,
              sample_tickers: data.samples,
            });
          }
        }

        if (eligibleAssets.length === 0) {
          console.log(`No eligible assets for ${dateStr}, skipping...`);
          continue;
        }

        console.log(`Date ${dateStr}: ${eligibleAssets.length} eligible assets`);

        // ======================================================================
        // STEP 2: FETCH SIGNALS OBSERVED <= D (30-day window)
        // ======================================================================
        const lookbackStart = new Date(targetDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const dateEnd = `${dateStr}T23:59:59.999Z`;

        const eligibleAssetIds = eligibleAssets.map(a => a.id);
        
        // Fetch signals in chunks to avoid URL length limits
        const allSignals: SignalData[] = [];
        const chunkSize = 200;
        
        for (let i = 0; i < eligibleAssetIds.length; i += chunkSize) {
          const chunk = eligibleAssetIds.slice(i, i + chunkSize);
          const { data: signals } = await supabase
            .from('signals')
            .select('asset_id, signal_type, magnitude, direction, observed_at')
            .in('asset_id', chunk)
            .gte('observed_at', lookbackStart)
            .lte('observed_at', dateEnd);
          
          if (signals) allSignals.push(...signals);
        }

        // Group signals by asset_id
        const signalsByAsset = new Map<string, SignalData[]>();
        for (const s of allSignals) {
          if (!signalsByAsset.has(s.asset_id)) signalsByAsset.set(s.asset_id, []);
          signalsByAsset.get(s.asset_id)!.push(s);
        }

        // ======================================================================
        // STEP 3: COMPUTE SCORES FOR EACH MODEL VERSION
        // ======================================================================
        for (const modelVersion of modelVersions) {
          // Check if predictions already exist for this date/model
          const { data: existing } = await supabase
            .from('asset_predictions')
            .select('id')
            .eq('snapshot_date', dateStr)
            .eq('model_version', modelVersion)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log(`Skipping ${dateStr}/${modelVersion} - already exists`);
            continue;
          }

          // Score each eligible asset
          const assetScores: {
            asset_id: string;
            ticker: string;
            expected_return: number;
            confidence_score: number;
            priceD: number;
            priceD1: number;
          }[] = [];

          if (modelVersion === 'random') {
            // Random baseline: seeded by date for determinism
            const dateSeed = parseInt(dateStr.replace(/-/g, ''), 10);
            const rng = seededRandom(dateSeed);
            
            for (const asset of eligibleAssets) {
              assetScores.push({
                asset_id: asset.id,
                ticker: asset.ticker,
                expected_return: rng() - 0.5, // Random -0.5 to +0.5
                confidence_score: rng(),
                priceD: asset.priceD,
                priceD1: asset.priceD1,
              });
            }
          } else {
            // v1_alpha or v0_weights
            for (const asset of eligibleAssets) {
              const signals = signalsByAsset.get(asset.id) || [];
              
              let score: { expected_return: number; confidence_score: number };
              
              if (modelVersion === 'v1_alpha') {
                score = computeV1AlphaScore(signals, targetDate, alphaMap);
              } else {
                score = computeV0WeightsScore(signals, targetDate);
              }

              assetScores.push({
                asset_id: asset.id,
                ticker: asset.ticker,
                expected_return: score.expected_return,
                confidence_score: score.confidence_score,
                priceD: asset.priceD,
                priceD1: asset.priceD1,
              });
            }
          }

          // ======================================================================
          // STEP 4: RANK AND SELECT TOP N (DO NOT FILTER BY expected_return > 0)
          // ======================================================================
          // Sort by expected_return DESC, then confidence_score DESC
          assetScores.sort((a, b) => {
            if (b.expected_return !== a.expected_return) {
              return b.expected_return - a.expected_return;
            }
            return b.confidence_score - a.confidence_score;
          });

          const maxN = Math.max(...topNList);
          const universeSize = assetScores.length;

          // For each top_n, insert exactly N predictions (or all if universe < N)
          const predictions: any[] = [];
          const gradingResults: any[] = [];

          for (const topN of topNList) {
            const actualN = Math.min(topN, universeSize);
            
            for (let i = 0; i < actualN; i++) {
              const a = assetScores[i];
              const rank = i + 1;

              const predId = crypto.randomUUID();
              
              predictions.push({
                id: predId,
                snapshot_date: dateStr,
                asset_id: a.asset_id,
                ticker: a.ticker,
                expected_return: a.expected_return,
                confidence_score: a.confidence_score,
                confidence_label: confidenceLabel(a.confidence_score),
                rank,
                model_version: modelVersion,
                top_n: topN,
                feature_snapshot: {
                  expected_return: a.expected_return,
                  confidence_score: a.confidence_score,
                  signal_count: signalsByAsset.get(a.asset_id)?.length || 0,
                  universe_size: universeSize,
                },
              });

              // Grade immediately using D and D+1 prices
              const realizedReturn = winsorize((a.priceD1 / a.priceD) - 1, MAX_RETURN_WINSORIZE);
              const expectedDir = a.expected_return > 0 ? 1 : (a.expected_return < 0 ? -1 : 0);
              const realizedDir = realizedReturn > 0 ? 1 : (realizedReturn < 0 ? -1 : 0);
              const hit = expectedDir !== 0 && expectedDir === realizedDir;

              gradingResults.push({
                prediction_id: predId,
                horizon: '1d',
                realized_return: realizedReturn,
                hit,
              });
            }
          }

          // Insert predictions
          if (predictions.length > 0) {
            // Insert in chunks
            for (let i = 0; i < predictions.length; i += 500) {
              const chunk = predictions.slice(i, i + 500);
              const { error: insErr } = await supabase.from('asset_predictions').insert(chunk);
              if (insErr) {
                console.error(`Error inserting predictions for ${dateStr}/${modelVersion}:`, insErr.message);
                errors.push(`${dateStr}/${modelVersion}: ${insErr.message}`);
              } else {
                totalPredictions += chunk.length;
              }
            }

            // Insert grading results
            for (let i = 0; i < gradingResults.length; i += 500) {
              const chunk = gradingResults.slice(i, i + 500);
              const { error: gradeErr } = await supabase.from('asset_prediction_results').insert(chunk);
              if (gradeErr) {
                console.error(`Error grading ${dateStr}/${modelVersion}:`, gradeErr.message);
              } else {
                totalGraded += chunk.length;
              }
            }
          }
        }

        daysProcessed++;
      } catch (e) {
        console.error(`Error processing ${dateStr}:`, e);
        errors.push(`${dateStr}: ${String(e)}`);
      }
    }

    // Insert diagnostics
    if (diagnosticsToInsert.length > 0) {
      for (const diag of diagnosticsToInsert) {
        await supabase.from('backtest_diagnostics').upsert(diag, {
          onConflict: 'snapshot_date,excluded_reason',
        });
      }
    }

    console.log(`Prediction backfill complete. Computing daily metrics...`);

    // ======================================================================
    // STEP 5: COMPUTE MODEL_DAILY_METRICS FOR EACH MODEL/DATE/TOP_N
    // ======================================================================
    for (const modelVersion of modelVersions) {
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
        const topN = pred.top_n || 100;

        // Only include if rank <= top_n
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

      // Upsert metrics
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

        await supabase
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
      }
    }

    const duration = Date.now() - startTime;

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'backfill-predictions-and-grade',
      status: 'success',
      rows_inserted: totalPredictions + totalGraded,
      duration_ms: duration,
      metadata: {
        start_date: startDate,
        end_date: endDate,
        model_versions: modelVersions,
        days_processed: daysProcessed,
        predictions_created: totalPredictions,
        predictions_graded: totalGraded,
        errors: errors.slice(0, 10),
      },
    });

    console.log(`backfill-predictions-and-grade completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        start_date: startDate,
        end_date: endDate,
        model_versions: modelVersions,
        days_processed: daysProcessed,
        predictions_created: totalPredictions,
        predictions_graded: totalGraded,
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
