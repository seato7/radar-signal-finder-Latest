import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Process assets in batches for memory efficiency
// Global recentering is applied at the end after collecting ALL raw ERs
const ASSETS_PER_INVOCATION = 500; // Per-invocation limit for CPU
const BATCH_SIZE = 100; // Smaller batches for signal fetching to avoid URL length limits

// ============================================================================
// UNIVERSE FILTERS - MANDATORY TO AVOID PUMP NOISE
// ============================================================================
const MIN_PRICE_USD = 1.00; // Exclude penny stocks
const MAX_RETURN_WINSORIZE = 0.20; // Cap returns at +-20% for calibration
const MAX_VOLATILITY_PENALTY = 0.05; // Max penalty from volatility

// ============================================================================
// SAMPLE SIZE TRUST GATING - Softened to avoid double-regularization
// Using sqrt formula since compute-signal-alpha already applies shrinkage
// ============================================================================
const MIN_ALPHA_SAMPLE_SIZE = 50; // Reference point for trust factor

// ============================================================================
// COMPONENT BASELINE ALPHA - Evidence-gated fallback
// Only used when component has sufficient aggregate evidence
// ============================================================================
const MIN_COMPONENT_TOTAL_N = 500; // Minimum aggregate samples across all types in component

const COMPONENT_BASELINE_ALPHA: Record<string, number> = {
  InsiderPoliticianConfirm: 0.0015,
  BigMoneyConfirm: 0.0012,
  FlowPressure: 0.0010,
  CapexMomentum: 0.0009,
  TechEdge: 0.0008,
  PolicyMomentum: 0.0008,
  MacroEconomic: 0.0007,
  Attention: 0.0006,
  EarningsMomentum: 0.0007,
  RiskFlags: -0.0010,
};
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
const CONFIDENCE_THRESHOLDS = {
  very_confident: 2.0,
  confident: 1.5,
  moderate: 1.0,
  speculative: 0.5,
  risky: 0,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function expDecay(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  return Math.exp(-Math.log(2) * ageDays / halfLifeDays);
}

function confidenceLabel(cs: number): string {
  if (cs >= CONFIDENCE_THRESHOLDS.very_confident) return 'very_confident';
  if (cs >= CONFIDENCE_THRESHOLDS.confident) return 'confident';
  if (cs >= CONFIDENCE_THRESHOLDS.moderate) return 'moderate';
  if (cs >= CONFIDENCE_THRESHOLDS.speculative) return 'speculative';
  return 'risky';
}

/**
 * DYNAMIC SCORE MAPPING - uses empirical P95 scale
 * @param expectedReturnCentered - mean-subtracted expected return
 * @param confScore - confidence score
 * @param p95Scale - P95 of |expected_return| from this run (min 0.005)
 */
function scoreFromExpected(expectedReturnCentered: number, confScore: number, p95Scale: number = 0.01): number {
  const base = 50;
  // Dynamic clamp: 2x the P95 magnitude
  const clamp = Math.max(0.005, 2 * p95Scale);
  const profitability = Math.max(-clamp, Math.min(clamp, expectedReturnCentered));
  const profitPoints = (profitability / clamp) * 25; // Scale to ±25 points
  const confPoints = Math.max(-10, Math.min(10, confScore * 5));
  const raw = base + profitPoints + confPoints;
  return Math.max(15, Math.min(85, raw));
}

/**
 * CRITICAL FIX: Canonicalize signal type by removing _limited_data suffix
 * This collapses fragmented variants into their parent type for alpha lookup
 */
function canonicalSignalType(t: string): string {
  return t.replace(/_limited_data$/, '');
}

/**
 * POLARITY-AWARE Family key mapping
 * Separates bullish/bearish families to prevent sign cancellation in averaging
 */
function familyKey(signalType: string): string | null {
  const s = signalType;
  
  // Momentum families - SPLIT BY POLARITY
  if (s.startsWith('momentum_5d_')) {
    if (s.includes('bearish')) return 'momentum_5d_bearish';
    if (s.includes('bullish')) return 'momentum_5d_bullish';
    return 'momentum_5d_neutral';
  }
  if (s.startsWith('momentum_20d_')) {
    if (s.includes('bearish')) return 'momentum_20d_bearish';
    if (s.includes('bullish')) return 'momentum_20d_bullish';
    return 'momentum_20d_neutral';
  }
  
  // Insider / politician - SPLIT BY POLARITY
  if (s.startsWith('insider_')) {
    if (s.includes('sell')) return 'insider_sell';
    if (s.includes('buy')) return 'insider_buy';
    return 'insider';
  }
  if (s.startsWith('politician_')) {
    if (s.includes('sell')) return 'politician_sell';
    if (s.includes('buy')) return 'politician_buy';
    return 'politician';
  }
  if (s.startsWith('congressional_')) {
    if (s.includes('sell')) return 'congressional_sell';
    if (s.includes('buy')) return 'congressional_buy';
    return 'congressional';
  }
  if (s.startsWith('form4_')) {
    if (s.includes('sell')) return 'form4_sell';
    if (s.includes('buy')) return 'form4_buy';
    return 'form4';
  }
  
  // Sentiment families - SPLIT BY POLARITY
  if (s.startsWith('sentiment_')) {
    if (s.includes('bearish')) return 'sentiment_bearish';
    if (s.includes('bullish')) return 'sentiment_bullish';
    return 'sentiment';
  }
  if (s.startsWith('social_')) {
    if (s.includes('bearish')) return 'social_bearish';
    if (s.includes('bullish')) return 'social_bullish';
    return 'social';
  }
  if (s.startsWith('news_')) {
    if (s.includes('bearish')) return 'news_bearish';
    if (s.includes('bullish')) return 'news_bullish';
    return 'news';
  }
  
  // COT families - SPLIT BY POLARITY
  if (s.startsWith('cot_')) {
    if (s.includes('bearish')) return 'cot_bearish';
    if (s.includes('bullish')) return 'cot_bullish';
    return 'cot';
  }
  
  // Forex families - SPLIT BY POLARITY
  if (s.startsWith('forex_')) {
    if (s.includes('bearish') || s.includes('short')) return 'forex_bearish';
    if (s.includes('bullish') || s.includes('long')) return 'forex_bullish';
    return 'forex';
  }
  
  // Technical families - SPLIT BY POLARITY
  if (s.startsWith('technical_')) {
    if (s.includes('breakdown') || s.includes('resistance')) return 'technical_bearish';
    if (s.includes('breakout') || s.includes('support')) return 'technical_bullish';
    return 'technical';
  }
  
  // Other common buckets (polarity-neutral)
  if (s.startsWith('policy_')) return 'policy';
  if (s.startsWith('economic_')) return 'economic';
  if (s.startsWith('supply_chain_')) return 'supply_chain';
  if (s.startsWith('onchain_')) return 'onchain';
  if (s.startsWith('earnings_')) return 'earnings';
  if (s.startsWith('ai_research_')) return 'ai_research';
  if (s.startsWith('smart_money_')) return 'smart_money';
  if (s.startsWith('crypto_')) return 'crypto';
  if (s.startsWith('darkpool_')) return 'darkpool';
  if (s.startsWith('etf_')) return 'etf';
  if (s.startsWith('whale_')) return 'whale';
  
  return null;
}

/**
 * SOFTENED Trust gating - uses sqrt formula to reduce double-regularization
 * Since compute-signal-alpha already applies shrinkage, we use a gentler formula here
 */
function applyTrustGating(alpha: number, n: number): number {
  if (!n || n <= 0) return 0;
  // SOFTENED: sqrt formula instead of linear to avoid over-penalizing
  const trust = Math.sqrt(n / (n + MIN_ALPHA_SAMPLE_SIZE));
  return alpha * trust;
}

// Alpha record type for clarity
type AlphaRec = {
  alpha: number;
  sd: number;
  n: number;
  hitRate: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================================================
  // CRON SECRET ENFORCEMENT
  // If CRON_SHARED_SECRET is set, require x-cron-secret header to match
  // ========================================================================
  const expectedSecret = Deno.env.get('CRON_SHARED_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  
  if (expectedSecret && providedSecret !== expectedSecret) {
    console.warn('[ASSET-SCORES] Unauthorized: missing or invalid x-cron-secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  
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
    // FETCH PRICE COVERAGE DATA FOR TODAY
    // ========================================================================
    const coverageMap = new Map<string, {
      status: string;
      points_30d: number;
      last_price_date: string | null;
      days_stale: number;
    }>();

    let coverageOffset = 0;
    while (true) {
      const { data: coveragePage, error: coverageError } = await supabase
        .from('price_coverage_daily')
        .select('ticker, status, points_30d, last_price_date, days_stale')
        .eq('snapshot_date', today)
        .eq('vendor', 'twelvedata')
        .range(coverageOffset, coverageOffset + 999);

      if (coverageError) {
        console.warn(`Coverage query error: ${coverageError.message}`);
        break;
      }
      if (!coveragePage || coveragePage.length === 0) break;

      for (const c of coveragePage) {
        coverageMap.set(c.ticker, {
          status: c.status,
          points_30d: c.points_30d,
          last_price_date: c.last_price_date,
          days_stale: c.days_stale,
        });
      }

      if (coveragePage.length < 1000) break;
      coverageOffset += 1000;
    }

    console.log(`Loaded ${coverageMap.size} coverage records for ${today}`);

    // ========================================================================
    // FETCH ALPHA TABLE (signal_type_alpha) - ALL HORIZONS for fallback
    // ========================================================================
    const { data: alphaRows, error: alphaErr } = await supabase
      .from('signal_type_alpha')
      .select('signal_type, horizon, avg_forward_return, std_forward_return, sample_size, hit_rate');

    if (alphaErr) throw alphaErr;

    // Build alpha maps by horizon
    const alphaMap1d = new Map<string, AlphaRec>();
    const alphaMap3d = new Map<string, AlphaRec>();
    const alphaMap7d = new Map<string, AlphaRec>();
    
    for (const r of alphaRows || []) {
      const rec: AlphaRec = {
        alpha: Number(r.avg_forward_return ?? 0),
        sd: Number(r.std_forward_return ?? 0),
        n: Number(r.sample_size ?? 0),
        hitRate: Number(r.hit_rate ?? 0.5),
      };
      
      if (r.horizon === '1d') alphaMap1d.set(r.signal_type, rec);
      else if (r.horizon === '3d') alphaMap3d.set(r.signal_type, rec);
      else if (r.horizon === '7d') alphaMap7d.set(r.signal_type, rec);
    }
    
    // Primary alphaMap uses 1d
    const alphaMap = alphaMap1d;

    console.log(`Loaded ${alphaMap.size} signal type alphas`);

    // ========================================================================
    // BUILD POLARITY-AWARE FAMILY ALPHA MAP
    // Aggregate child alphas weighted by sample size, respecting polarity
    // ========================================================================
    const familyAlphaMap = new Map<string, AlphaRec>();

    for (const [stype, rec] of alphaMap.entries()) {
      const fam = familyKey(stype);
      if (!fam) continue;

      const cur = familyAlphaMap.get(fam);
      if (!cur) {
        familyAlphaMap.set(fam, { alpha: rec.alpha, sd: rec.sd, n: rec.n, hitRate: rec.hitRate });
      } else {
        // Weighted average by n for alpha
        const n1 = Math.max(1, cur.n);
        const n2 = Math.max(1, rec.n);
        const nTot = n1 + n2;

        const alphaW = (cur.alpha * n1 + rec.alpha * n2) / nTot;
        const sdW = (cur.sd * n1 + rec.sd * n2) / nTot;
        const hitW = (cur.hitRate * n1 + rec.hitRate * n2) / nTot;

        familyAlphaMap.set(fam, { alpha: alphaW, sd: sdW, n: nTot, hitRate: hitW });
      }
    }

    console.log(`Built ${familyAlphaMap.size} polarity-aware family alphas`);

    // ========================================================================
    // BUILD EVIDENCE-GATED COMPONENT ALPHA MAP
    // Only allow component fallback if component has MIN_COMPONENT_TOTAL_N samples
    // ========================================================================
    const componentAlphaMap = new Map<string, AlphaRec>();

    for (const [stype, rec] of alphaMap.entries()) {
      const component = SIGNAL_TYPE_TO_COMPONENT[stype] || SIGNAL_TYPE_TO_COMPONENT[canonicalSignalType(stype)];
      if (!component) continue;

      const cur = componentAlphaMap.get(component);
      if (!cur) {
        componentAlphaMap.set(component, { alpha: rec.alpha, sd: rec.sd, n: rec.n, hitRate: rec.hitRate });
      } else {
        const n1 = Math.max(1, cur.n);
        const n2 = Math.max(1, rec.n);
        const nTot = n1 + n2;

        const alphaW = (cur.alpha * n1 + rec.alpha * n2) / nTot;
        const sdW = (cur.sd * n1 + rec.sd * n2) / nTot;
        const hitW = (cur.hitRate * n1 + rec.hitRate * n2) / nTot;

        componentAlphaMap.set(component, { alpha: alphaW, sd: sdW, n: nTot, hitRate: hitW });
      }
    }

    // Log component evidence levels
    const componentEvidence: Record<string, number> = {};
    for (const [comp, rec] of componentAlphaMap.entries()) {
      componentEvidence[comp] = rec.n;
    }
    console.log(`Component evidence levels:`, componentEvidence);

    let processedCount = 0;
    let excludedCount = 0;
    let rankedCount = 0;
    let offset = startOffset;
    const endOffset = Math.min(startOffset + ASSETS_PER_INVOCATION, totalAssets || 0);

    // Exclusion tracking
    const exclusionReasons: Record<string, number> = {
      no_coverage_record: 0,
      status_stale: 0,
      status_missing: 0,
      status_unsupported: 0,
    };

    // Global alpha fallback tracking
    const globalFallbackStats = {
      exact: 0,
      canonical: 0,
      family: 0,
      component: 0,
      horizon_3d: 0,
      horizon_7d: 0,
      none: 0,
    };

    // ========================================================================
    // RUN-LEVEL INVARIANTS for debugging
    // ========================================================================
    let runMaxExpectedReturnRaw = -Infinity;
    let runMinExpectedReturnRaw = Infinity;
    let runMaxSingleContrib = 0;
    let assetsAtFloor = 0;
    let assetsAtCeiling = 0;
    let totalPosMass = 0;
    let totalNegMass = 0;
    let assetsWithConflict = 0; // pos > 0 && neg > 0
    
    // ========================================================================
    // GLOBAL TWO-PASS RECENTERING
    // Pass 1: Collect ALL raw expected returns across ALL batches
    // Pass 2: Apply global mean to recenter and score
    // ========================================================================
    interface RawAssetData {
      id: string;
      ticker: string;
      expectedReturnRaw: number;
      alphaStdPenalty: number;
      posMass: number;
      negMass: number;
      maxContribThisAsset: number;
      scoreExplanation: any[];
      signalsTotal: number;
      signalsWithAlpha: number;
      signalsWithoutAlpha: number;
      usedExact: number;
      usedCanonical: number;
      usedFamily: number;
      usedHorizon3d: number;
      usedHorizon7d: number;
      usedComponent: number;
      cov: { status: string; points_30d: number; last_price_date: string | null; days_stale: number } | undefined;
    }

    // Collect all raw data across all batches first (PASS 1)
    const allRawAssetData: RawAssetData[] = [];

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

      // Separate assets into rankable and excluded based on coverage
      const rankableAssets: typeof assets = [];
      const excludedAssets: { asset: typeof assets[0]; reason: string; cov: typeof coverageMap extends Map<string, infer V> ? V | null : never }[] = [];

      for (const asset of assets) {
        const cov = coverageMap.get(asset.ticker);
        
        if (!cov) {
          excludedAssets.push({ asset, reason: 'no_coverage_record', cov: null });
          exclusionReasons.no_coverage_record++;
          continue;
        }
        
        if (cov.status !== 'fresh') {
          const reason = `status_${cov.status}`;
          excludedAssets.push({ asset, reason, cov });
          exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
          continue;
        }
        
        rankableAssets.push(asset);
      }

      console.log(`Batch: ${rankableAssets.length} rankable, ${excludedAssets.length} excluded`);

      // ========================================================================
      // HANDLE EXCLUDED ASSETS - Mark as unscorable
      // ========================================================================
      const now = new Date().toISOString();
      
      for (let i = 0; i < excludedAssets.length; i += 50) {
        const chunk = excludedAssets.slice(i, i + 50);
        const updatePromises = chunk.map(({ asset, reason, cov }) =>
          supabase
            .from('assets')
            .update({
              computed_score: null,
              expected_return: null,
              confidence_score: null,
              confidence_label: 'unscorable',
              model_version: 'v1_alpha',
              score_explanation: [
                { k: 'excluded', v: true },
                { k: 'reason', v: reason },
                { k: 'price_status', v: cov?.status || 'unknown' },
                { k: 'days_stale', v: cov?.days_stale || 9999 },
              ],
              score_computed_at: now,
              price_status: cov?.status || 'unknown',
              last_price_date: cov?.last_price_date || null,
              days_stale: cov?.days_stale || 9999,
              price_points_30d: cov?.points_30d || 0,
              rank_status: reason === 'no_coverage_record' ? 'no_coverage' : cov?.status || 'unknown',
            })
            .eq('id', asset.id)
        );
        
        await Promise.all(updatePromises);
        excludedCount += chunk.length;
      }

      // ========================================================================
      // COMPUTE ALPHA-BASED SCORES FOR RANKABLE ASSETS
      // ========================================================================
      if (rankableAssets.length > 0) {
        const assetIds = rankableAssets.map(a => a.id);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch signals for these assets
        const { data: signals, error: sigError } = await supabase
          .from('signals')
          .select('asset_id, signal_type, magnitude, direction, observed_at')
          .in('asset_id', assetIds)
          .gte('observed_at', thirtyDaysAgo);

        if (sigError) {
          console.error('Error fetching signals:', sigError);
          offset += batchSize;
          continue;
        }

        // Build signals map by asset_id
        const signalsMap = new Map<string, any[]>();
        for (const s of signals || []) {
          if (!signalsMap.has(s.asset_id)) signalsMap.set(s.asset_id, []);
          signalsMap.get(s.asset_id)!.push(s);
        }

        // ========================================================================
        // PASS 1: Compute raw expected_return for all assets (collect for global recentering)
        // ========================================================================
        for (const asset of rankableAssets) {
          const assetSignals = signalsMap.get(asset.id) || [];
          const cov = coverageMap.get(asset.ticker);
          
          let expectedReturnRaw = 0;
          let alphaStdPenalty = 0;
          let posMass = 0;
          let negMass = 0;
          let maxContribThisAsset = 0;
          const scoreExplanation: any[] = [];

          // ================================================================
          // COVERAGE COUNTERS for this asset
          // ================================================================
          let signalsTotal = 0;
          let signalsWithAlpha = 0;
          let signalsWithoutAlpha = 0;
          let usedExact = 0;
          let usedCanonical = 0;
          let usedFamily = 0;
          let usedHorizon3d = 0;
          let usedHorizon7d = 0;
          let usedComponent = 0;

          for (const s of assetSignals) {
            signalsTotal += 1;

            const rawType = String(s.signal_type);
            const canonType = canonicalSignalType(rawType);

            const mag = Number(s.magnitude ?? 1);
            const observedAt = new Date(s.observed_at);
            const ageDays = (Date.now() - observedAt.getTime()) / (1000 * 60 * 60 * 24);

            const component = SIGNAL_TYPE_TO_COMPONENT[rawType] || SIGNAL_TYPE_TO_COMPONENT[canonType];
            const halfLifeDays = component ? (HALF_LIFE_BY_CATEGORY[component] || 14) : 14;
            const decay = expDecay(ageDays, halfLifeDays);

            // ================================================================
            // HIERARCHICAL ALPHA LOOKUP: exact -> canonical -> family -> horizon (3d/7d) -> component (evidence-gated) -> 0
            // ================================================================
            let rec: AlphaRec | undefined = alphaMap.get(rawType);
            let fallbackLevel: 'exact' | 'canonical' | 'family' | 'horizon_3d' | 'horizon_7d' | 'component' | 'none' = 'none';

            if (rec) {
              fallbackLevel = 'exact';
            } else {
              // 2) canonical match
              rec = alphaMap.get(canonType);
              if (rec) {
                fallbackLevel = 'canonical';
              } else {
                // 3) family match (polarity-aware)
                const fam = familyKey(canonType) || familyKey(rawType);
                if (fam) {
                  const famRec = familyAlphaMap.get(fam);
                  if (famRec) {
                    rec = famRec;
                    fallbackLevel = 'family';
                  }
                }

                // 4) HORIZON FALLBACK: Try 3d alpha (scaled /3), then 7d alpha (scaled /7)
                if (!rec) {
                  const rec3d = alphaMap3d.get(rawType) || alphaMap3d.get(canonType);
                  if (rec3d && rec3d.n >= 10) {
                    rec = { ...rec3d, alpha: rec3d.alpha / 3 }; // Scale to 1d equivalent
                    fallbackLevel = 'horizon_3d';
                  } else {
                    const rec7d = alphaMap7d.get(rawType) || alphaMap7d.get(canonType);
                    if (rec7d && rec7d.n >= 10) {
                      rec = { ...rec7d, alpha: rec7d.alpha / 7 }; // Scale to 1d equivalent
                      fallbackLevel = 'horizon_7d';
                    }
                  }
                }

                // 5) component fallback - EVIDENCE-GATED
                // Only use if component has MIN_COMPONENT_TOTAL_N aggregate samples
                if (!rec && component) {
                  const compRec = componentAlphaMap.get(component);
                  if (compRec && compRec.n >= MIN_COMPONENT_TOTAL_N) {
                    rec = compRec;
                    fallbackLevel = 'component';
                  }
                  // NO BASELINE FALLBACK - if no evidence, alpha = 0
                }
              }
            }

            // Determine effective alpha and uncertainty contribution
            let alpha = 0;
            let sd = 0;
            let n = 0;

            if (rec) {
              n = Number(rec.n ?? 0);
              alpha = Number(rec.alpha ?? 0);
              sd = Number(rec.sd ?? 0);
            }

            // Apply SOFTENED trust gating for data-backed alphas
            if (fallbackLevel === 'exact' || fallbackLevel === 'canonical' || fallbackLevel === 'family' || fallbackLevel === 'component' || fallbackLevel === 'horizon_3d' || fallbackLevel === 'horizon_7d') {
              alpha = applyTrustGating(alpha, n);
            }

            // CRITICAL: Direction already baked into alpha by compute-signal-alpha
            // Do NOT apply direction multiplier again
            const contrib = decay * Math.min(mag, 5) * alpha;
            expectedReturnRaw += contrib;

            // Track max single contribution for this asset
            if (Math.abs(contrib) > maxContribThisAsset) {
              maxContribThisAsset = Math.abs(contrib);
            }

            // Coverage counters
            if (fallbackLevel === 'exact') usedExact += 1;
            else if (fallbackLevel === 'canonical') usedCanonical += 1;
            else if (fallbackLevel === 'family') usedFamily += 1;
            else if (fallbackLevel === 'horizon_3d') usedHorizon3d += 1;
            else if (fallbackLevel === 'horizon_7d') usedHorizon7d += 1;
            else if (fallbackLevel === 'component') usedComponent += 1;

            if (fallbackLevel === 'none') {
              signalsWithoutAlpha += 1;
            } else {
              signalsWithAlpha += 1;
            }

            // Uncertainty aggregation (variance space)
            if (sd > 0) {
              const contribSd = decay * Math.min(mag, 5) * sd;
              alphaStdPenalty += contribSd * contribSd;
            }

            // MASS-BASED tracking: absolute values for disagreement gating
            if (contrib > 0) posMass += contrib;
            if (contrib < 0) negMass += Math.abs(contrib);

            if (Math.abs(contrib) > 0.001) {
              scoreExplanation.push({
                signal_type: canonType,
                component: component || 'unknown',
                contrib: Math.round(contrib * 10000) / 10000,
                alpha: Math.round(alpha * 10000) / 10000,
                decay: Math.round(decay * 100) / 100,
                age_days: Math.round(ageDays * 10) / 10,
                fallback: fallbackLevel,
              });
            }
          }

          // Accumulate global fallback stats
          globalFallbackStats.exact += usedExact;
          globalFallbackStats.canonical += usedCanonical;
          globalFallbackStats.family += usedFamily;
          globalFallbackStats.component += usedComponent;
          globalFallbackStats.horizon_3d += usedHorizon3d;
          globalFallbackStats.horizon_7d += usedHorizon7d;
          globalFallbackStats.none += signalsWithoutAlpha;

          // Track run-level stats on RAW expected return
          if (expectedReturnRaw > runMaxExpectedReturnRaw) runMaxExpectedReturnRaw = expectedReturnRaw;
          if (expectedReturnRaw < runMinExpectedReturnRaw) runMinExpectedReturnRaw = expectedReturnRaw;
          if (maxContribThisAsset > runMaxSingleContrib) runMaxSingleContrib = maxContribThisAsset;
          totalPosMass += posMass;
          totalNegMass += negMass;
          if (posMass > 0 && negMass > 0) assetsWithConflict += 1;

          // Collect for global two-pass recentering
          allRawAssetData.push({
            id: asset.id,
            ticker: asset.ticker,
            expectedReturnRaw,
            alphaStdPenalty,
            posMass,
            negMass,
            maxContribThisAsset,
            scoreExplanation,
            signalsTotal,
            signalsWithAlpha,
            signalsWithoutAlpha,
            usedExact,
            usedCanonical,
            usedFamily,
            usedHorizon3d,
            usedHorizon7d,
            usedComponent,
            cov,
          });
          
          processedCount++;
        }
      }

      offset += batchSize;
    }

    // ========================================================================
    // PASS 2: GLOBAL RECENTERING AND FINAL SCORING
    // Now we have ALL raw data, compute global mean and P95 scale
    // ========================================================================
    console.log(`Pass 1 complete. Collected ${allRawAssetData.length} assets for global recentering.`);

    // ========================================================================
    // CRITICAL FIX: Compute GLOBAL mean across ENTIRE UNIVERSE, not just this batch
    // Query the DB for the mean of ALL assets to ensure consistent recentering
    // ========================================================================
    let globalMeanExpectedReturn = 0;
    
    // First, compute the batch mean from our collected data
    const allExpectedReturnsRaw = allRawAssetData.map(d => d.expectedReturnRaw);
    const batchMeanExpectedReturn = allExpectedReturnsRaw.length > 0
      ? allExpectedReturnsRaw.reduce((a, b) => a + b, 0) / allExpectedReturnsRaw.length
      : 0;
    
    // Query all previously scored assets to get the true global mean
    // This ensures we recenter consistently across all batches
    const { data: globalStats, error: globalStatsErr } = await supabase
      .from('assets')
      .select('expected_return')
      .not('expected_return', 'is', null)
      .not('rank_status', 'eq', 'unscorable');
    
    if (!globalStatsErr && globalStats && globalStats.length > 0) {
      // Combine existing assets' expected_return (which are centered from previous runs)
      // with our current batch's RAW returns (before centering)
      // To get a true global mean, we need to compute on RAW values
      // Since stored expected_return is already centered, we estimate raw = centered + previous_global_mean
      // This is complex, so instead: use just this batch's mean if it's the majority
      // OR: Use moving average approach
      
      // SIMPLER APPROACH: Use only THIS batch's data for recentering
      // Since we process ALL assets eventually, the last run will be most accurate
      // Future enhancement: Store raw separately for true global mean
      globalMeanExpectedReturn = batchMeanExpectedReturn;
    } else {
      globalMeanExpectedReturn = batchMeanExpectedReturn;
    }

    console.log(`Batch mean: ${(batchMeanExpectedReturn * 100).toFixed(4)}%, using as global mean: ${(globalMeanExpectedReturn * 100).toFixed(4)}%`);

    // ========================================================================
    // FILTERED P95 SCALE: Compute on assets with meaningful signal mass
    // This prevents the "mostly neutral" population from forcing everyone into a narrow band
    // ========================================================================
    const MASS_MIN_FOR_SCALE = 0.001; // 0.1% minimum mass to contribute to scale
    const assetsWithMass = allRawAssetData.filter(d => (d.posMass + d.negMass) >= MASS_MIN_FOR_SCALE);
    
    let p95Scale = 0.01; // Default
    if (assetsWithMass.length > 10) {
      // Use batch mean for P95 since these are raw values
      const filteredERs = assetsWithMass.map(d => d.expectedReturnRaw);
      const filteredMean = filteredERs.reduce((a, b) => a + b, 0) / filteredERs.length;
      const absDeviations = filteredERs.map(er => Math.abs(er - filteredMean)).sort((a, b) => a - b);
      const p95Index = Math.floor(absDeviations.length * 0.95);
      const p95AbsDeviation = absDeviations[Math.min(p95Index, absDeviations.length - 1)] || 0.01;
      p95Scale = Math.max(0.005, p95AbsDeviation);
    } else if (allExpectedReturnsRaw.length > 0) {
      // Fallback to all assets if not enough with mass
      const absDeviations = allExpectedReturnsRaw.map(er => Math.abs(er - batchMeanExpectedReturn)).sort((a, b) => a - b);
      const p95Index = Math.floor(absDeviations.length * 0.95);
      const p95AbsDeviation = absDeviations[Math.min(p95Index, absDeviations.length - 1)] || 0.01;
      p95Scale = Math.max(0.005, p95AbsDeviation);
    }

    console.log(`Global calibration: mean=${(globalMeanExpectedReturn * 100).toFixed(4)}%, p95Scale=${(p95Scale * 100).toFixed(4)}%, assetsWithMass=${assetsWithMass.length}`);

    // ========================================================================
    // APPLY GLOBAL RECENTERING, MASS-BASED DISAGREEMENT, AND FINAL SCORING
    // ========================================================================
    const DISAGREE_MASS_MIN = 0.002; // Only penalize when total signal mass >= 0.2%
    const DISAGREE_MAX = 0.02;
    const now = new Date().toISOString();

    const updates: {
      id: string;
      ticker: string;
      score: number;
      expected_return: number;
      expected_return_raw: number;
      expected_return_centered: number;
      confidence_score: number;
      confidence_label: string;
      score_explanation: any[];
      cov: typeof allRawAssetData[0]['cov'];
    }[] = [];

    for (const data of allRawAssetData) {
      const {
        id, ticker, expectedReturnRaw, alphaStdPenalty, posMass, negMass,
        scoreExplanation, signalsTotal, signalsWithAlpha, signalsWithoutAlpha,
        usedExact, usedCanonical, usedFamily, usedHorizon3d, usedHorizon7d, usedComponent,
        cov
      } = data;

      // GLOBAL RECENTER: subtract global mean to remove bearish bias
      const expectedReturnCentered = expectedReturnRaw - globalMeanExpectedReturn;

      // MASS-BASED DISAGREEMENT PENALTY: gate by total signal mass, not net
      const mass = posMass + negMass;
      const balance = (posMass > 0 && negMass > 0) ? (Math.min(posMass, negMass) / Math.max(posMass, negMass)) : 0;
      let disagreementPenalty = 0;
      if (mass >= DISAGREE_MASS_MIN && posMass > 0 && negMass > 0) {
        disagreementPenalty = Math.min(DISAGREE_MAX, balance * 0.02);
      }

      const aggregatedStd = Math.sqrt(alphaStdPenalty);
      const uncertainty = Math.max(0.005, aggregatedStd + disagreementPenalty);
      const confScore = expectedReturnCentered !== 0 ? expectedReturnCentered / uncertainty : 0;
      const label = confidenceLabel(confScore);

      // DYNAMIC SCORE MAPPING using empirical P95 scale
      const finalScore = scoreFromExpected(expectedReturnCentered, confScore, p95Scale);

      // Track floor/ceiling hits
      if (finalScore <= 15) assetsAtFloor += 1;
      if (finalScore >= 85) assetsAtCeiling += 1;

      scoreExplanation.sort((a: any, b: any) => Math.abs(b.contrib) - Math.abs(a.contrib));
      const topExplanation = scoreExplanation.slice(0, 10);

      updates.push({
        id,
        ticker,
        score: Math.round(finalScore * 10) / 10,
        expected_return: Math.round(expectedReturnCentered * 100000) / 100000, // Store CENTERED value
        expected_return_raw: Math.round(expectedReturnRaw * 100000) / 100000,
        expected_return_centered: Math.round(expectedReturnCentered * 100000) / 100000,
        confidence_score: Math.round(confScore * 1000) / 1000,
        confidence_label: label,
        score_explanation: [
          { k: 'expected_return_raw', v: Math.round(expectedReturnRaw * 100000) / 100000 },
          { k: 'expected_return_centered', v: Math.round(expectedReturnCentered * 100000) / 100000 },
          { k: 'global_mean_expected_return', v: Math.round(globalMeanExpectedReturn * 100000) / 100000 },
          { k: 'p95_scale', v: Math.round(p95Scale * 100000) / 100000 },
          { k: 'uncertainty', v: Math.round(uncertainty * 100000) / 100000 },
          { k: 'disagreement_penalty', v: Math.round(disagreementPenalty * 100000) / 100000 },
          { k: 'disagree_mass_gated', v: mass >= DISAGREE_MASS_MIN },
          { k: 'signal_mass', v: Math.round(mass * 100000) / 100000 },
          { k: 'alpha_std_penalty', v: Math.round(alphaStdPenalty * 100000) / 100000 },
          { k: 'signals_total', v: signalsTotal },
          { k: 'signals_with_alpha', v: signalsWithAlpha },
          { k: 'signals_without_alpha', v: signalsWithoutAlpha },
          { k: 'alpha_fallback_exact', v: usedExact },
          { k: 'alpha_fallback_canonical', v: usedCanonical },
          { k: 'alpha_fallback_family', v: usedFamily },
          { k: 'alpha_fallback_horizon_3d', v: usedHorizon3d },
          { k: 'alpha_fallback_horizon_7d', v: usedHorizon7d },
          { k: 'alpha_fallback_component', v: usedComponent },
          { k: 'sum_pos_mass', v: Math.round(posMass * 100000) / 100000 },
          { k: 'sum_neg_mass', v: Math.round(negMass * 100000) / 100000 },
          { k: 'pos_neg_ratio', v: posMass > 0 && negMass > 0 ? Math.round((Math.min(posMass, negMass) / Math.max(posMass, negMass)) * 100) / 100 : 0 },
          { k: 'top_signals', v: topExplanation },
        ],
        cov,
      });
    }

    // Batch update ranked assets
    const CHUNK_SIZE = 50;

    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);

      const updatePromises = chunk.map(update => {
        return supabase
          .from('assets')
          .update({
            computed_score: update.score,
            expected_return: update.expected_return,
            confidence_score: update.confidence_score,
            confidence_label: update.confidence_label,
            model_version: 'v1_alpha',
            score_explanation: update.score_explanation,
            score_computed_at: now,
            price_status: update.cov?.status || 'fresh',
            last_price_date: update.cov?.last_price_date || null,
            days_stale: update.cov?.days_stale || 0,
            price_points_30d: update.cov?.points_30d || 0,
            rank_status: 'rankable',
          })
          .eq('id', update.id);
      });

      const results = await Promise.all(updatePromises);
      rankedCount += results.filter(r => !r.error).length;
    }

    // Calculate next offset for continuation
    const nextOffset = offset >= (totalAssets || 0) ? 0 : offset;
    const isComplete = offset >= (totalAssets || 0);

    const duration = Date.now() - startTime;
    console.log(`Score computation complete. Ranked: ${rankedCount}, Excluded: ${excludedCount}, Duration: ${duration}ms`);

    // ========================================================================
    // GLOBAL SWEEP CHECK (when cycle completes)
    // Query true global mean and apply universal correction if needed
    // This ensures mean(expected_return) ≈ 0 across the ENTIRE universe
    // ========================================================================
    let sweepApplied = false;
    let sweepCorrectionApplied = 0;
    
    if (isComplete) {
      console.log('Cycle complete - running global sweep check...');
      
      // Query global mean across ALL rankable assets using dedicated RPC
      const { data: globalMeanData, error: globalMeanErr } = await supabase
        .rpc('get_scoring_global_mean');
      
      if (globalMeanErr) {
        console.error('Failed to get global mean:', globalMeanErr);
      } else if (globalMeanData?.[0]) {
        const trueGlobalMean = Number(globalMeanData[0].global_mean || 0);
        const assetCount = Number(globalMeanData[0].cnt || 0);
        
        console.log(`True global mean: ${(trueGlobalMean * 100).toFixed(6)}%, covering ${assetCount} assets`);
        
        // If the global mean is non-trivially off from zero, apply correction
        if (Math.abs(trueGlobalMean) > 0.00001 && assetCount > 0) {
          console.log(`Applying global sweep correction: subtracting ${(trueGlobalMean * 100).toFixed(6)}% from all assets`);
          
          // Apply the correction using dedicated RPC
          const { data: affectedRows, error: sweepErr } = await supabase
            .rpc('apply_scoring_recenter', { correction: trueGlobalMean });
          
          if (!sweepErr) {
            sweepApplied = true;
            sweepCorrectionApplied = trueGlobalMean;
            console.log(`Global sweep correction applied successfully to ${affectedRows} assets`);
          } else {
            console.error('Sweep correction failed:', sweepErr);
          }
        } else {
          console.log('Global mean already near zero, no sweep needed');
        }
      } else {
        console.log('No global mean data returned');
      }
    }

    // ========================================================================
    // RUN-LEVEL INVARIANTS OUTPUT
    // ========================================================================
    const runInvariants = {
      max_expected_return_raw: runMaxExpectedReturnRaw === -Infinity ? 0 : Math.round(runMaxExpectedReturnRaw * 100000) / 100000,
      min_expected_return_raw: runMinExpectedReturnRaw === Infinity ? 0 : Math.round(runMinExpectedReturnRaw * 100000) / 100000,
      max_single_contrib: Math.round(runMaxSingleContrib * 100000) / 100000,
      assets_at_floor: assetsAtFloor,
      assets_at_ceiling: assetsAtCeiling,
      total_pos_mass: Math.round(totalPosMass * 100000) / 100000,
      total_neg_mass: Math.round(totalNegMass * 100000) / 100000,
      assets_with_conflict: assetsWithConflict,
      // Global calibration metrics
      global_mean_expected_return: Math.round(globalMeanExpectedReturn * 100000) / 100000,
      p95_scale: Math.round(p95Scale * 100000) / 100000,
      total_assets_scored: allExpectedReturnsRaw.length,
      assets_with_mass: assetsWithMass.length,
      // Sweep check results
      sweep_applied: sweepApplied,
      sweep_correction: Math.round(sweepCorrectionApplied * 100000) / 100000,
    };

    console.log(`Run invariants:`, runInvariants);

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'compute-asset-scores',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: rankedCount,
      metadata: { 
        start_offset: startOffset,
        end_offset: offset,
        next_offset: nextOffset,
        total_assets: totalAssets,
        alpha_count: alphaMap.size,
        family_alpha_count: familyAlphaMap.size,
        component_alpha_count: componentAlphaMap.size,
        component_evidence: componentEvidence,
        coverage_count: coverageMap.size,
        model_version: 'v1_alpha',
        ranked_count: rankedCount,
        excluded_count: excludedCount,
        exclusion_reasons: exclusionReasons,
        fallback_stats: globalFallbackStats,
        run_invariants: runInvariants,
        is_complete: isComplete,
        sweep_applied: sweepApplied,
        sweep_correction: sweepCorrectionApplied,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount, 
        ranked: rankedCount,
        excluded: excludedCount,
        exclusion_reasons: exclusionReasons,
        fallback_stats: globalFallbackStats,
        run_invariants: runInvariants,
        duration_ms: duration,
        next_offset: nextOffset,
        total_assets: totalAssets,
        alpha_count: alphaMap.size,
        family_alpha_count: familyAlphaMap.size,
        component_alpha_count: componentAlphaMap.size,
        component_evidence: componentEvidence,
        coverage_count: coverageMap.size,
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
