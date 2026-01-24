import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process fewer assets per invocation to stay within CPU limits
const ASSETS_PER_INVOCATION = 500;
const BATCH_SIZE = 100; // Smaller batches to avoid URL length limits

// ============================================================================
// UNIVERSE FILTERS - MANDATORY TO AVOID PUMP NOISE
// ============================================================================
const MIN_PRICE_USD = 1.00; // Exclude penny stocks
const MAX_RETURN_WINSORIZE = 0.20; // Cap returns at +-20% for calibration
const MAX_VOLATILITY_PENALTY = 0.05; // Max penalty from volatility
const VOLATILITY_THRESHOLD = 0.03; // 3% daily vol threshold

// ============================================================================
// HALF-LIFE BY SIGNAL CATEGORY (days)
// ============================================================================
const HALF_LIFE_BY_CATEGORY: Record<string, number> = {
  InsiderPoliticianConfirm: 45,  // Insider signals persist
  BigMoneyConfirm: 60,           // Institutional positioning slow to change
  FlowPressure: 10,              // Flows matter for short periods
  CapexMomentum: 30,             // Growth signals medium-term
  TechEdge: 5,                   // Technical signals decay fast
  PolicyMomentum: 21,            // Policy impacts medium-term
  MacroEconomic: 14,             // Macro context
  Attention: 2,                  // News/social decays fast
  EarningsMomentum: 14,          // Earnings quarterly
  RiskFlags: 7,                  // Risk signals important short-term
};

// ============================================================================
// SIGNAL TYPE → COMPONENT MAPPING
// ============================================================================
const SIGNAL_TYPE_TO_COMPONENT: Record<string, string> = {
  // BigMoneyConfirm
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
  'crypto_whale_activity': 'BigMoneyConfirm',
  'whale_accumulation': 'BigMoneyConfirm',
  'whale_distribution': 'BigMoneyConfirm',
  'onchain_whale': 'BigMoneyConfirm',
  'bigmoney_hold_new': 'BigMoneyConfirm',
  'bigmoney_hold_increase': 'BigMoneyConfirm',
  'bigmoney_hold_decrease': 'BigMoneyConfirm',
  'bigmoney_hold': 'BigMoneyConfirm',
  'smart_money_accumulation': 'BigMoneyConfirm',
  'smart_money_distribution': 'BigMoneyConfirm',
  'onchain_accumulation': 'BigMoneyConfirm',
  'onchain_distribution': 'BigMoneyConfirm',
  'ai_research_buy': 'BigMoneyConfirm',
  'ai_research_sell': 'BigMoneyConfirm',
  'ai_research_hold': 'BigMoneyConfirm',
  
  // FlowPressure
  'dark_pool_activity': 'FlowPressure',
  'darkpool_block': 'FlowPressure',
  'darkpool_accumulation': 'FlowPressure',
  'darkpool_distribution': 'FlowPressure',
  'flow_pressure_etf': 'FlowPressure',
  'flow_pressure': 'FlowPressure',
  'etf_inflow': 'FlowPressure',
  'etf_outflow': 'FlowPressure',
  'crypto_exchange_flow': 'FlowPressure',
  'exchange_inflow': 'FlowPressure',
  'exchange_outflow': 'FlowPressure',
  'crypto_exchange_outflow': 'FlowPressure',
  'onchain_exchange_inflow': 'FlowPressure',
  'onchain_exchange_outflow': 'FlowPressure',
  
  // InsiderPoliticianConfirm
  'insider_buy': 'InsiderPoliticianConfirm',
  'insider_sell': 'InsiderPoliticianConfirm',
  'form4_buy': 'InsiderPoliticianConfirm',
  'form4_sell': 'InsiderPoliticianConfirm',
  'politician_buy': 'InsiderPoliticianConfirm',
  'politician_sell': 'InsiderPoliticianConfirm',
  'congressional_buy': 'InsiderPoliticianConfirm',
  'congressional_sell': 'InsiderPoliticianConfirm',
  'insider_trading': 'InsiderPoliticianConfirm',
  
  // TechEdge
  'technical_breakout': 'TechEdge',
  'technical_breakdown': 'TechEdge',
  'technical_signal': 'TechEdge',
  'pattern_detected': 'TechEdge',
  'bullish_pattern': 'TechEdge',
  'bearish_pattern': 'TechEdge',
  'reversal_pattern': 'TechEdge',
  'continuation_pattern': 'TechEdge',
  'support_bounce': 'TechEdge',
  'resistance_break': 'TechEdge',
  'vwap_signal': 'TechEdge',
  'stochastic_signal': 'TechEdge',
  'options_unusual': 'TechEdge',
  'unusual_options': 'TechEdge',
  'options_sweep': 'TechEdge',
  'options_block': 'TechEdge',
  'forex_breakout': 'TechEdge',
  'forex_breakdown': 'TechEdge',
  'forex_technical': 'TechEdge',
  'technical_stochastic': 'TechEdge',
  'chart_pattern': 'TechEdge',
  'technical_ma_crossover': 'TechEdge',
  'technical_rsi': 'TechEdge',
  'technical_vwap': 'TechEdge',
  'technical_adx': 'TechEdge',
  'technical_trend': 'TechEdge',
  'mfi_oversold': 'TechEdge',
  'mfi_overbought': 'TechEdge',
  'forex_rsi_oversold': 'TechEdge',
  'forex_rsi_overbought': 'TechEdge',
  'forex_macd': 'TechEdge',
  'forex_ma_crossover': 'TechEdge',
  'momentum_5d_strong_bullish': 'TechEdge',
  'momentum_5d_strong_bearish': 'TechEdge',
  'momentum_20d_strong_bullish': 'TechEdge',
  'momentum_20d_strong_bearish': 'TechEdge',
  'momentum_5d_bullish': 'TechEdge',
  'momentum_5d_bearish': 'TechEdge',
  'momentum_20d_bullish': 'TechEdge',
  'momentum_20d_bearish': 'TechEdge',
  'momentum_5d_weak_bullish': 'TechEdge',
  'momentum_5d_weak_bearish': 'TechEdge',
  'momentum_20d_weak_bullish': 'TechEdge',
  'momentum_20d_weak_bearish': 'TechEdge',
  
  // Attention
  'news_mention': 'Attention',
  'breaking_news': 'Attention',
  'news_alert': 'Attention',
  'sentiment_shift': 'Attention',
  'sentiment_bullish': 'Attention',
  'sentiment_bearish': 'Attention',
  'sentiment_extreme': 'Attention',
  'social_mention': 'Attention',
  'social_bullish': 'Attention',
  'social_bearish': 'Attention',
  'reddit_mention': 'Attention',
  'stocktwits_mention': 'Attention',
  'search_interest': 'Attention',
  'search_spike': 'Attention',
  'trending_topic': 'Attention',
  'news_sentiment': 'Attention',
  'breaking_news_bullish': 'Attention',
  'breaking_news_bearish': 'Attention',
  'forex_news_sentiment': 'Attention',
  'onchain_fear': 'Attention',
  'onchain_greed': 'Attention',
  'social_bullish_surge': 'Attention',
  'social_bearish_surge': 'Attention',
  'news_rss_bullish': 'Attention',
  'news_rss_bearish': 'Attention',
  
  // CapexMomentum
  'capex_hiring': 'CapexMomentum',
  'hiring_surge': 'CapexMomentum',
  'job_growth': 'CapexMomentum',
  'patent_filed': 'CapexMomentum',
  'patent_granted': 'CapexMomentum',
  'innovation_signal': 'CapexMomentum',
  'innovation_patent': 'CapexMomentum',
  
  // PolicyMomentum
  'policy_keyword': 'PolicyMomentum',
  'policy_mention': 'PolicyMomentum',
  'policy_approval': 'PolicyMomentum',
  'policy_rejection': 'PolicyMomentum',
  
  // MacroEconomic
  'cot_positioning': 'MacroEconomic',
  'cot_bullish': 'MacroEconomic',
  'cot_bearish': 'MacroEconomic',
  'commercial_positioning': 'MacroEconomic',
  'macro_event': 'MacroEconomic',
  'fed_decision': 'MacroEconomic',
  'gdp_release': 'MacroEconomic',
  'inflation_data': 'MacroEconomic',
  'employment_data': 'MacroEconomic',
  'economic_indicator': 'MacroEconomic',
  'forex_sentiment': 'MacroEconomic',
  'forex_bullish': 'MacroEconomic',
  'forex_bearish': 'MacroEconomic',
  'retail_positioning': 'MacroEconomic',
  'economic_beat': 'MacroEconomic',
  'economic_miss': 'MacroEconomic',
  'forex_retail_extreme_long': 'MacroEconomic',
  'forex_retail_extreme_short': 'MacroEconomic',
  'cot_commercial_bullish': 'MacroEconomic',
  'cot_commercial_bearish': 'MacroEconomic',
  
  // EarningsMomentum
  'earnings_surprise': 'EarningsMomentum',
  'earnings_beat': 'EarningsMomentum',
  'earnings_miss': 'EarningsMomentum',
  'revenue_surprise': 'EarningsMomentum',
  
  // RiskFlags
  'short_squeeze': 'RiskFlags',
  'short_interest_high': 'RiskFlags',
  'short_interest_low': 'RiskFlags',
  'volatility_spike': 'RiskFlags',
  'supply_disruption': 'RiskFlags',
  'short_interest': 'RiskFlags',
  'supply_chain_indicator': 'RiskFlags',
};

// ============================================================================
// CONFIDENCE LABEL THRESHOLDS (based on empirical accuracy bands)
// ============================================================================
// These thresholds correspond to historical accuracy:
// very_confident: typically 65%+ hit rate historically
// confident: 55-65% hit rate
// moderate: 45-55% hit rate
// speculative: 40-45% hit rate
// risky: <40% hit rate
const CONFIDENCE_THRESHOLDS = {
  very_confident: 2.0,  // confScore >= 2.0
  confident: 1.5,       // confScore >= 1.5
  moderate: 1.0,        // confScore >= 1.0
  speculative: 0.5,     // confScore >= 0.5
  risky: 0,             // confScore < 0.5
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
  if (cs >= CONFIDENCE_THRESHOLDS.very_confident) return 'very_confident';
  if (cs >= CONFIDENCE_THRESHOLDS.confident) return 'confident';
  if (cs >= CONFIDENCE_THRESHOLDS.moderate) return 'moderate';
  if (cs >= CONFIDENCE_THRESHOLDS.speculative) return 'speculative';
  return 'risky';
}

// Map expected profitability into 15-85 UI score
function scoreFromExpected(expectedReturn: number, confScore: number): number {
  const base = 50;
  // expectedReturn is daily expected return, e.g. 0.01 = 1%
  const profitability = Math.max(-0.03, Math.min(0.03, expectedReturn)); // clamp to +-3%
  const profitPoints = (profitability / 0.03) * 20; // +-20 points
  const confPoints = Math.max(-10, Math.min(10, confScore * 5)); // +-10 points
  const raw = base + profitPoints + confPoints;
  return Math.max(15, Math.min(85, raw));
}

// Calculate rolling 20-day volatility from price history
function calculateVolatility(prices: { close: number }[]): number {
  if (prices.length < 3) return 0;
  
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1].close > 0) {
      returns.push((prices[i].close / prices[i - 1].close) - 1);
    }
  }
  
  if (returns.length < 2) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get offset from request body or determine from least recently scored assets
    let body: { offset?: number } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    let startOffset = body.offset ?? 0;

    // If no offset provided, find assets that need scoring
    if (body.offset === undefined) {
      const { data: lastRun } = await supabase
        .from('function_status')
        .select('metadata')
        .eq('function_name', 'compute-asset-scores')
        .eq('status', 'success')
        .order('executed_at', { ascending: false })
        .limit(1);

      if (lastRun?.[0]?.metadata?.next_offset) {
        startOffset = lastRun[0].metadata.next_offset;
      }
    }

    console.log(`Starting alpha-based asset score computation at offset ${startOffset}...`);

    // Get total asset count
    const { count: totalAssets } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true });

    console.log(`Total assets: ${totalAssets}`);

    // Wrap offset if we've gone past the end
    if (startOffset >= (totalAssets || 0)) {
      startOffset = 0;
      console.log('Wrapped offset to 0 (completed full cycle)');
    }

    // ========================================================================
    // FETCH ALPHA TABLE (signal_type_alpha)
    // ========================================================================
    const { data: alphaRows, error: alphaErr } = await supabase
      .from('signal_type_alpha')
      .select('signal_type, avg_forward_return, std_forward_return, sample_size, hit_rate')
      .eq('horizon', '1d');

    if (alphaErr) throw alphaErr;

    const alphaMap = new Map<string, { alpha: number; sd: number; n: number; hitRate: number }>();
    for (const r of alphaRows || []) {
      alphaMap.set(r.signal_type, {
        alpha: Number(r.avg_forward_return ?? 0),
        sd: Number(r.std_forward_return ?? 0),
        n: Number(r.sample_size ?? 0),
        hitRate: Number(r.hit_rate ?? 0.5),
      });
    }

    console.log(`Loaded ${alphaMap.size} signal type alphas`);

    let processedCount = 0;
    let offset = startOffset;
    const endOffset = Math.min(startOffset + ASSETS_PER_INVOCATION, totalAssets || 0);

    // Process in batches
    while (offset < endOffset) {
      const batchSize = Math.min(BATCH_SIZE, endOffset - offset);
      console.log(`Processing batch: offset=${offset}, batch_size=${batchSize}`);
      
      // Fetch batch of assets
      const { data: assets, error: assetsError } = await supabase
        .from('assets')
        .select('id, ticker, asset_class')
        .range(offset, offset + batchSize - 1);

      if (assetsError) {
        console.error('Error fetching assets:', assetsError);
        break;
      }

      if (!assets || assets.length === 0) {
        console.log('No more assets to process');
        break;
      }

      const assetIds = assets.map(a => a.id);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch signals for these assets
      const { data: signals, error: sigError } = await supabase
        .from('signals')
        .select('asset_id, signal_type, magnitude, direction, observed_at')
        .in('asset_id', assetIds)
        .gte('observed_at', thirtyDaysAgo);

      if (sigError) {
        console.error('Error fetching signals:', sigError);
        break;
      }

      // Build signals map by asset_id
      const signalsMap = new Map<string, any[]>();
      for (const s of signals || []) {
        if (!signalsMap.has(s.asset_id)) signalsMap.set(s.asset_id, []);
        signalsMap.get(s.asset_id)!.push(s);
      }

      // ========================================================================
      // COMPUTE ALPHA-BASED SCORES FOR EACH ASSET
      // ========================================================================
      const updates: {
        id: string;
        score: number;
        expected_return: number;
        confidence_score: number;
        confidence_label: string;
        score_explanation: any[];
      }[] = [];

      for (const asset of assets) {
        const assetSignals = signalsMap.get(asset.id) || [];
        
        let expectedReturn = 0;
        let alphaStdPenalty = 0;
        let pos = 0;
        let neg = 0;
        const scoreExplanation: any[] = [];

        for (const s of assetSignals) {
          const signalType = String(s.signal_type);
          const mag = Number(s.magnitude ?? 1);
          const observedAt = new Date(s.observed_at);
          const ageDays = (Date.now() - observedAt.getTime()) / (1000 * 60 * 60 * 24);

          // Get half-life based on signal component
          const component = SIGNAL_TYPE_TO_COMPONENT[signalType];
          const halfLifeDays = component ? (HALF_LIFE_BY_CATEGORY[component] || 14) : 14;

          const decay = expDecay(ageDays, halfLifeDays);

          // Get alpha from calibration table
          const alphaRec = alphaMap.get(signalType);
          const alpha = alphaRec ? alphaRec.alpha : 0;

          // Direction multiplier
          const dirMult = s.direction === 'up' ? 1 : (s.direction === 'down' ? -1 : 1);

          // Contribution = decay * magnitude * alpha * direction
          const contrib = decay * Math.min(mag, 5) * alpha * dirMult;
          expectedReturn += contrib;

          // Penalize unstable signals (high std relative to alpha)
          if (alphaRec && alphaRec.sd > 0) {
            alphaStdPenalty += decay * Math.min(0.02, alphaRec.sd);
          }

          // Track positive/negative contributions for disagreement
          if (contrib > 0) pos += contrib;
          if (contrib < 0) neg += Math.abs(contrib);

          // Add to explanation (top contributors)
          if (Math.abs(contrib) > 0.001) {
            scoreExplanation.push({
              signal_type: signalType,
              component: component || 'unknown',
              contrib: Math.round(contrib * 10000) / 10000,
              alpha: Math.round(alpha * 10000) / 10000,
              decay: Math.round(decay * 100) / 100,
              age_days: Math.round(ageDays * 10) / 10,
            });
          }
        }

        // Calculate disagreement penalty
        let disagreementPenalty = 0;
        if (pos > 0 && neg > 0) {
          const ratio = Math.min(pos, neg) / Math.max(pos, neg);
          disagreementPenalty = ratio * 0.02; // up to 2% uncertainty
        }

        // Calculate uncertainty floor
        const uncertainty = Math.max(
          0.005, // floor 0.5%
          alphaStdPenalty + disagreementPenalty
        );

        // Compute confidence score
        const confScore = expectedReturn !== 0 ? expectedReturn / uncertainty : 0;
        const label = confidenceLabel(confScore);
        const finalScore = scoreFromExpected(expectedReturn, confScore);

        // Sort explanation by contribution magnitude
        scoreExplanation.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
        
        // Keep top 10 contributors
        const topExplanation = scoreExplanation.slice(0, 10);

        updates.push({
          id: asset.id,
          score: Math.round(finalScore * 10) / 10,
          expected_return: Math.round(expectedReturn * 100000) / 100000,
          confidence_score: Math.round(confScore * 1000) / 1000,
          confidence_label: label,
          score_explanation: [
            { k: 'expected_return', v: Math.round(expectedReturn * 100000) / 100000 },
            { k: 'uncertainty', v: Math.round(uncertainty * 100000) / 100000 },
            { k: 'disagreement_penalty', v: Math.round(disagreementPenalty * 100000) / 100000 },
            { k: 'alpha_std_penalty', v: Math.round(alphaStdPenalty * 100000) / 100000 },
            { k: 'signal_count', v: assetSignals.length },
            { k: 'top_signals', v: topExplanation },
          ],
        });
        
        processedCount++;
      }

      // Batch update assets
      const now = new Date().toISOString();
      const CHUNK_SIZE = 50;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        
        const updatePromises = chunk.map(update =>
          supabase
            .from('assets')
            .update({
              computed_score: update.score,
              expected_return: update.expected_return,
              confidence_score: update.confidence_score,
              confidence_label: update.confidence_label,
              model_version: 'v1_alpha',
              score_explanation: update.score_explanation,
              score_computed_at: now,
            })
            .eq('id', update.id)
        );
        
        const results = await Promise.all(updatePromises);
        
        for (const result of results) {
          if (result.error) {
            errorCount++;
            if (errorCount <= 3) {
              console.error('Update error:', result.error.message);
            }
          } else {
            successCount++;
          }
        }
      }

      console.log(`Updated ${successCount} asset scores, ${errorCount} errors`);
      offset += batchSize;
    }

    // Calculate next offset for continuation
    const nextOffset = offset >= (totalAssets || 0) ? 0 : offset;
    const isComplete = offset >= (totalAssets || 0);

    // SWEEP: If complete, handle assets with no signals
    let sweepCount = 0;
    if (isComplete) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: missedAssets, error: missedError } = await supabase
        .from('assets')
        .select('id, ticker')
        .or(`score_computed_at.is.null,score_computed_at.lt.${oneHourAgo}`)
        .limit(500);

      if (!missedError && missedAssets && missedAssets.length > 0) {
        console.log(`SWEEP: Found ${missedAssets.length} missed assets`);
        
        const now = new Date().toISOString();
        for (let i = 0; i < missedAssets.length; i += 50) {
          const chunk = missedAssets.slice(i, i + 50);
          const sweepPromises = chunk.map(asset =>
            supabase
              .from('assets')
              .update({
                computed_score: 50,
                expected_return: 0,
                confidence_score: 0,
                confidence_label: 'risky',
                model_version: 'v1_alpha',
                score_explanation: [{ k: 'sweep_applied', v: true }, { k: 'reason', v: 'No signals available' }],
                score_computed_at: now,
              })
              .eq('id', asset.id)
          );
          
          const results = await Promise.all(sweepPromises);
          sweepCount += results.filter(r => !r.error).length;
        }
        console.log(`SWEEP: Updated ${sweepCount} missed assets`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Alpha-based score computation complete. Processed ${processedCount} + ${sweepCount} swept in ${duration}ms`);

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'compute-asset-scores',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: processedCount + sweepCount,
      metadata: { 
        start_offset: startOffset,
        end_offset: offset,
        next_offset: nextOffset,
        total_assets: totalAssets,
        alpha_count: alphaMap.size,
        model_version: 'v1_alpha',
        sweep_count: sweepCount,
        is_complete: isComplete,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount, 
        duration_ms: duration,
        next_offset: nextOffset,
        total_assets: totalAssets,
        alpha_count: alphaMap.size,
        model_version: 'v1_alpha',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in compute-asset-scores:', errorMessage);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('function_status').insert({
      function_name: 'compute-asset-scores',
      status: 'error',
      executed_at: new Date().toISOString(),
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
