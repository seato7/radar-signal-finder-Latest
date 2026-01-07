import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process fewer assets per invocation to stay within CPU limits
const ASSETS_PER_INVOCATION = 2000;
const BATCH_SIZE = 500;

// ============================================================================
// SCORING WEIGHTS - PREDICTIVE FOCUS: Leading indicators weighted higher
// Leading indicators predict future moves, lagging indicators confirm past moves
// ============================================================================
const WEIGHTS = {
  // LEADING INDICATORS (HIGH WEIGHT) - These PREDICT future price moves
  InsiderPoliticianConfirm: 3.5, // Form4, congressional trades - insiders know before market
  BigMoneyConfirm: 3.0,          // 13F holdings, smart money - institutions position BEFORE moves
  FlowPressure: 2.5,             // ETF/Dark pool flows - capital direction before price
  CapexMomentum: 2.0,            // Jobs, patents - forward-looking growth signals
  
  // COINCIDENT INDICATORS (MEDIUM WEIGHT) - These signal current momentum
  TechEdge: 1.5,                 // Technical/options, patterns - timing signals
  PolicyMomentum: 1.2,           // Policy catalysts - can lead or lag
  MacroEconomic: 1.0,            // Economic indicators, COT - context
  
  // LAGGING INDICATORS (LOW WEIGHT) - These CONFIRM past moves, not predictive
  Attention: 0.3,                // News/social sentiment - retail follows price
  EarningsMomentum: 0.5,         // Earnings surprises - quarterly, delayed
  
  // PENALTY
  RiskFlags: -2.0,               // Short interest, volatility - risk signals
};

// Maximum contribution per component (for normalization)
const MAX_COMPONENT_VALUE = 10;

// Asset-class-specific weight modifiers
const CLASS_MODIFIERS: Record<string, Record<string, number>> = {
  stock: {},
  etf: { FlowPressure: 1.5 },
  crypto: { BigMoneyConfirm: 2.0, TechEdge: 1.3, FlowPressure: 1.3 },
  forex: { PolicyMomentum: 1.5, MacroEconomic: 1.5, TechEdge: 1.2 },
  commodity: { MacroEconomic: 2.0, PolicyMomentum: 1.3 },
};

// ============================================================================
// SIGNAL TYPE → COMPONENT MAPPING (matches signals table signal_type values)
// ============================================================================
const SIGNAL_TYPE_TO_COMPONENT: Record<string, { component: string; multiplier: number }> = {
  // === BigMoneyConfirm ===
  'filing_13f_new': { component: 'BigMoneyConfirm', multiplier: 5.0 },
  'filing_13f_increase': { component: 'BigMoneyConfirm', multiplier: 3.0 },
  'filing_13f_decrease': { component: 'BigMoneyConfirm', multiplier: -2.0 },
  '13f_new_position': { component: 'BigMoneyConfirm', multiplier: 5.0 },
  '13f_increase': { component: 'BigMoneyConfirm', multiplier: 3.0 },
  '13f_decrease': { component: 'BigMoneyConfirm', multiplier: -2.0 },
  'smart_money': { component: 'BigMoneyConfirm', multiplier: 4.0 },
  'smart_money_flow': { component: 'BigMoneyConfirm', multiplier: 4.0 },
  'institutional_buying': { component: 'BigMoneyConfirm', multiplier: 4.0 },
  'institutional_selling': { component: 'BigMoneyConfirm', multiplier: -3.0 },
  'crypto_whale_activity': { component: 'BigMoneyConfirm', multiplier: 5.0 },
  'whale_accumulation': { component: 'BigMoneyConfirm', multiplier: 5.0 },
  'whale_distribution': { component: 'BigMoneyConfirm', multiplier: -4.0 },
  'onchain_whale': { component: 'BigMoneyConfirm', multiplier: 5.0 },
  
  // === FlowPressure ===
  'dark_pool_activity': { component: 'FlowPressure', multiplier: 3.0 },
  'darkpool_block': { component: 'FlowPressure', multiplier: 3.0 },
  'darkpool_accumulation': { component: 'FlowPressure', multiplier: 4.0 },
  'darkpool_distribution': { component: 'FlowPressure', multiplier: -3.0 },
  'flow_pressure_etf': { component: 'FlowPressure', multiplier: 3.0 },
  'flow_pressure': { component: 'FlowPressure', multiplier: 3.0 },
  'etf_inflow': { component: 'FlowPressure', multiplier: 3.0 },
  'etf_outflow': { component: 'FlowPressure', multiplier: -2.5 },
  'crypto_exchange_flow': { component: 'FlowPressure', multiplier: 4.0 },
  'exchange_inflow': { component: 'FlowPressure', multiplier: -3.0 },
  'exchange_outflow': { component: 'FlowPressure', multiplier: 4.0 },
  
  // === InsiderPoliticianConfirm ===
  'insider_buy': { component: 'InsiderPoliticianConfirm', multiplier: 4.0 },
  'insider_sell': { component: 'InsiderPoliticianConfirm', multiplier: -2.5 },
  'form4_buy': { component: 'InsiderPoliticianConfirm', multiplier: 4.0 },
  'form4_sell': { component: 'InsiderPoliticianConfirm', multiplier: -2.5 },
  'politician_buy': { component: 'InsiderPoliticianConfirm', multiplier: 5.0 },
  'politician_sell': { component: 'InsiderPoliticianConfirm', multiplier: -3.0 },
  'congressional_buy': { component: 'InsiderPoliticianConfirm', multiplier: 5.0 },
  'congressional_sell': { component: 'InsiderPoliticianConfirm', multiplier: -3.0 },
  
  // === TechEdge ===
  'technical_breakout': { component: 'TechEdge', multiplier: 3.0 },
  'technical_breakdown': { component: 'TechEdge', multiplier: -2.5 },
  'technical_signal': { component: 'TechEdge', multiplier: 2.0 },
  'pattern_detected': { component: 'TechEdge', multiplier: 2.5 },
  'bullish_pattern': { component: 'TechEdge', multiplier: 3.0 },
  'bearish_pattern': { component: 'TechEdge', multiplier: -2.5 },
  'reversal_pattern': { component: 'TechEdge', multiplier: 2.0 },
  'continuation_pattern': { component: 'TechEdge', multiplier: 2.0 },
  'support_bounce': { component: 'TechEdge', multiplier: 2.5 },
  'resistance_break': { component: 'TechEdge', multiplier: 3.0 },
  'vwap_signal': { component: 'TechEdge', multiplier: 2.0 },
  'stochastic_signal': { component: 'TechEdge', multiplier: 2.0 },
  'options_unusual': { component: 'TechEdge', multiplier: 3.0 },
  'unusual_options': { component: 'TechEdge', multiplier: 3.0 },
  'options_sweep': { component: 'TechEdge', multiplier: 3.5 },
  'options_block': { component: 'TechEdge', multiplier: 3.0 },
  'forex_breakout': { component: 'TechEdge', multiplier: 3.0 },
  'forex_breakdown': { component: 'TechEdge', multiplier: -2.5 },
  'forex_technical': { component: 'TechEdge', multiplier: 2.0 },
  
  // === Attention ===
  'news_mention': { component: 'Attention', multiplier: 2.0 },
  'breaking_news': { component: 'Attention', multiplier: 3.0 },
  'news_alert': { component: 'Attention', multiplier: 2.5 },
  'sentiment_shift': { component: 'Attention', multiplier: 2.0 },
  'sentiment_bullish': { component: 'Attention', multiplier: 3.0 },
  'sentiment_bearish': { component: 'Attention', multiplier: -2.5 },
  'sentiment_extreme': { component: 'Attention', multiplier: 3.0 },
  'social_mention': { component: 'Attention', multiplier: 2.0 },
  'social_bullish': { component: 'Attention', multiplier: 3.0 },
  'social_bearish': { component: 'Attention', multiplier: -2.5 },
  'reddit_mention': { component: 'Attention', multiplier: 2.0 },
  'stocktwits_mention': { component: 'Attention', multiplier: 2.0 },
  'search_interest': { component: 'Attention', multiplier: 2.0 },
  'search_spike': { component: 'Attention', multiplier: 3.0 },
  'trending_topic': { component: 'Attention', multiplier: 2.5 },
  
  // === CapexMomentum ===
  'capex_hiring': { component: 'CapexMomentum', multiplier: 4.0 },
  'hiring_surge': { component: 'CapexMomentum', multiplier: 4.0 },
  'job_growth': { component: 'CapexMomentum', multiplier: 3.0 },
  'patent_filed': { component: 'CapexMomentum', multiplier: 3.0 },
  'patent_granted': { component: 'CapexMomentum', multiplier: 4.0 },
  'innovation_signal': { component: 'CapexMomentum', multiplier: 3.0 },
  
  // === PolicyMomentum ===
  'policy_keyword': { component: 'PolicyMomentum', multiplier: 3.0 },
  'policy_mention': { component: 'PolicyMomentum', multiplier: 2.5 },
  'policy_approval': { component: 'PolicyMomentum', multiplier: 4.0 },
  'policy_rejection': { component: 'PolicyMomentum', multiplier: -3.0 },
  
  // === MacroEconomic ===
  'cot_positioning': { component: 'MacroEconomic', multiplier: 3.0 },
  'cot_bullish': { component: 'MacroEconomic', multiplier: 3.5 },
  'cot_bearish': { component: 'MacroEconomic', multiplier: -3.0 },
  'commercial_positioning': { component: 'MacroEconomic', multiplier: 3.0 },
  'macro_event': { component: 'MacroEconomic', multiplier: 2.0 },
  'fed_decision': { component: 'MacroEconomic', multiplier: 4.0 },
  'gdp_release': { component: 'MacroEconomic', multiplier: 3.0 },
  'inflation_data': { component: 'MacroEconomic', multiplier: 3.0 },
  'employment_data': { component: 'MacroEconomic', multiplier: 3.0 },
  'economic_indicator': { component: 'MacroEconomic', multiplier: 2.5 },
  'forex_sentiment': { component: 'MacroEconomic', multiplier: 2.5 },
  'forex_bullish': { component: 'MacroEconomic', multiplier: 3.0 },
  'forex_bearish': { component: 'MacroEconomic', multiplier: -2.5 },
  'retail_positioning': { component: 'MacroEconomic', multiplier: 2.0 },
  
  // === EarningsMomentum ===
  'earnings_surprise': { component: 'EarningsMomentum', multiplier: 4.0 },
  'earnings_beat': { component: 'EarningsMomentum', multiplier: 4.0 },
  'earnings_miss': { component: 'EarningsMomentum', multiplier: -3.5 },
  'revenue_surprise': { component: 'EarningsMomentum', multiplier: 3.0 },
  
  // === RiskFlags ===
  'short_squeeze': { component: 'RiskFlags', multiplier: 2.0 },
  'short_interest_high': { component: 'RiskFlags', multiplier: 3.0 },
  'short_interest_low': { component: 'RiskFlags', multiplier: -1.0 },
  'volatility_spike': { component: 'RiskFlags', multiplier: 2.0 },
  'supply_disruption': { component: 'RiskFlags', multiplier: 2.5 },
  'short_interest': { component: 'RiskFlags', multiplier: 2.5 },              // 828 signals!
  'supply_chain_indicator': { component: 'RiskFlags', multiplier: 2.0 },
  
  // === MISSING SIGNAL TYPES (83,584 signals!) ===
  // TechEdge - 82,130 signals were not being matched
  'technical_stochastic': { component: 'TechEdge', multiplier: 2.0 },         // 48,516 signals
  'chart_pattern': { component: 'TechEdge', multiplier: 2.5 },                // 33,077 signals
  'technical_ma_crossover': { component: 'TechEdge', multiplier: 3.0 },       // 439 signals
  'technical_rsi': { component: 'TechEdge', multiplier: 2.0 },                // 98 signals
  
  // BigMoneyConfirm - 956 signals
  'bigmoney_hold_new': { component: 'BigMoneyConfirm', multiplier: 5.0 },
  'bigmoney_hold_increase': { component: 'BigMoneyConfirm', multiplier: 3.0 },
  'bigmoney_hold_decrease': { component: 'BigMoneyConfirm', multiplier: -2.0 },
  'bigmoney_hold': { component: 'BigMoneyConfirm', multiplier: 2.0 },
  
  // FlowPressure - 161 signals
  'crypto_exchange_outflow': { component: 'FlowPressure', multiplier: 4.0 },
  
  // Attention - 659 signals
  'news_sentiment': { component: 'Attention', multiplier: 2.5 },
  
  // CapexMomentum - 30 signals
  'innovation_patent': { component: 'CapexMomentum', multiplier: 3.0 },
  
  // === NEW SIGNAL TYPES FROM 12 NEW GENERATORS ===
  
  // From generate-signals-from-technicals (advanced_technicals 3.3M rows)
  'technical_vwap': { component: 'TechEdge', multiplier: 2.5 },
  'technical_adx': { component: 'TechEdge', multiplier: 2.0 },
  'technical_trend': { component: 'TechEdge', multiplier: 2.5 },
  
  // From generate-signals-from-patterns (pattern_recognition 494K rows)
  // Already have 'bullish_pattern', 'bearish_pattern', 'chart_pattern'
  
  // From generate-signals-from-smart-money (smart_money_flow 101K rows)
  'smart_money_accumulation': { component: 'BigMoneyConfirm', multiplier: 4.0 },
  'smart_money_distribution': { component: 'BigMoneyConfirm', multiplier: -3.0 },
  'mfi_oversold': { component: 'TechEdge', multiplier: 3.0 },
  'mfi_overbought': { component: 'TechEdge', multiplier: -2.5 },
  
  // From generate-signals-from-forex-technicals (forex_technicals 85K rows)
  'forex_rsi_oversold': { component: 'TechEdge', multiplier: 3.0 },
  'forex_rsi_overbought': { component: 'TechEdge', multiplier: -2.5 },
  'forex_macd': { component: 'TechEdge', multiplier: 2.5 },
  'forex_ma_crossover': { component: 'TechEdge', multiplier: 3.0 },
  
  // From generate-signals-from-breaking-news (breaking_news 38K rows)
  'breaking_news_bullish': { component: 'Attention', multiplier: 3.5 },
  'breaking_news_bearish': { component: 'Attention', multiplier: -3.0 },
  
  // From generate-signals-from-economic (economic_indicators 14.5K rows)
  'economic_beat': { component: 'MacroEconomic', multiplier: 3.0 },
  'economic_miss': { component: 'MacroEconomic', multiplier: -2.5 },
  
  // From generate-signals-from-forex-sentiment (forex_sentiment 4.3K rows)
  'forex_retail_extreme_long': { component: 'MacroEconomic', multiplier: -2.0 }, // Contrarian
  'forex_retail_extreme_short': { component: 'MacroEconomic', multiplier: 2.0 }, // Contrarian
  'forex_news_sentiment': { component: 'Attention', multiplier: 2.5 },
  
  // From generate-signals-from-crypto-onchain (crypto_onchain_metrics 353 rows)
  'onchain_accumulation': { component: 'BigMoneyConfirm', multiplier: 4.0 },
  'onchain_distribution': { component: 'BigMoneyConfirm', multiplier: -3.0 },
  'onchain_exchange_inflow': { component: 'FlowPressure', multiplier: -3.0 },
  'onchain_exchange_outflow': { component: 'FlowPressure', multiplier: 4.0 },
  'onchain_fear': { component: 'Attention', multiplier: 2.0 }, // Contrarian buy
  'onchain_greed': { component: 'Attention', multiplier: -1.5 }, // Contrarian sell
  
  // From generate-signals-from-momentum (prices 549K rows)
  'momentum_5d_bullish': { component: 'TechEdge', multiplier: 3.0 },
  'momentum_5d_bearish': { component: 'TechEdge', multiplier: -2.5 },
  'momentum_20d_bullish': { component: 'TechEdge', multiplier: 2.5 },
  'momentum_20d_bearish': { component: 'TechEdge', multiplier: -2.0 },
  
  // From generate-signals-from-ai-research (ai_research_reports 431 rows)
  'ai_research_buy': { component: 'BigMoneyConfirm', multiplier: 3.5 },
  'ai_research_sell': { component: 'BigMoneyConfirm', multiplier: -3.0 },
  'ai_research_hold': { component: 'BigMoneyConfirm', multiplier: 0.5 },
  
  // From generate-signals-from-social-aggregated (social_signals 41K rows)
  'social_bullish_surge': { component: 'Attention', multiplier: 3.0 },
  'social_bearish_surge': { component: 'Attention', multiplier: -2.5 },
  
  // From generate-signals-from-news-rss (news_rss_articles 3.2K rows)
  'news_rss_bullish': { component: 'Attention', multiplier: 2.5 },
  'news_rss_bearish': { component: 'Attention', multiplier: -2.0 },
  
  // From generate-signals-from-cot (cot_reports)
  'cot_commercial_bullish': { component: 'MacroEconomic', multiplier: 3.5 },
  'cot_commercial_bearish': { component: 'MacroEconomic', multiplier: -3.0 },
  
  // Insider trading signal from generate-signals-from-form4
  'insider_trading': { component: 'InsiderPoliticianConfirm', multiplier: 3.0 },
};

// Helper: Logarithmic magnitude scaling for large numbers
function magnitudeScale(value: number, divisor: number, maxScore: number): number {
  if (value === 0) return 0;
  const sign = value > 0 ? 1 : -1;
  const magnitude = Math.log10(1 + Math.abs(value) / divisor);
  return sign * Math.min(magnitude * 5, maxScore);
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
      // No body provided, will auto-determine offset
    }

    let startOffset = body.offset ?? 0;

    // If no offset provided, find assets that need scoring (oldest scored first)
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

    console.log(`Starting asset score computation at offset ${startOffset}...`);

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

      const tickers = assets.map(a => a.ticker);
      const assetIds = assets.map(a => a.id);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // ========================================================================
      // FETCH ALL DATA SOURCES IN PARALLEL (24 tables + signals)
      // ========================================================================
      const [
        // Original 13 data sources
        technicals,
        darkPool,
        form4,
        holdings13f,
        congressionalTrades,
        newsSentiment,
        optionsFlow,
        shortInterest,
        earningsSentiment,
        etfFlows,
        cryptoOnchain,
        forexSentiment,
        economicIndicators,
        // NEW: Aggregated signals table (from all 48 functions)
        signals,
        // NEW: Pattern recognition (493K rows)
        patternRecognition,
        // NEW: Smart money flow (16K rows)
        smartMoneyFlow,
        // NEW: Social signals (5K rows)
        socialSignals,
        // NEW: Breaking news (24K rows)
        breakingNews,
        // NEW: Job postings (4.7K rows)
        jobPostings,
        // NEW: COT reports (124 rows)
        cotReports,
        // NEW: Policy feeds
        policyFeeds,
        // NEW: Patent filings
        patentFilings,
        // NEW: Forex technicals
        forexTechnicals,
        // NEW: Search trends (132,830 rows!)
        searchTrends,
      ] = await Promise.all([
        // Original queries
        supabase.from('advanced_technicals').select('ticker, stochastic_k, stochastic_d, breakout_signal, trend_strength, stochastic_signal, adx, price_vs_vwap_pct').in('ticker', tickers),
        supabase.from('dark_pool_activity').select('ticker, dark_pool_percentage, signal_strength, signal_type').in('ticker', tickers),
        supabase.from('form4_insider_trades').select('ticker, transaction_type, total_value, filing_date').in('ticker', tickers).gte('filing_date', thirtyDaysAgo.split('T')[0]),
        supabase.from('holdings_13f').select('ticker, change_shares, value, change_type').in('ticker', tickers),
        supabase.from('congressional_trades').select('ticker, transaction_type, transaction_date, amount_min, amount_max').in('ticker', tickers).gte('transaction_date', thirtyDaysAgo.split('T')[0]),
        supabase.from('news_sentiment_aggregate').select('ticker, sentiment_score, buzz_score, sentiment_label').in('ticker', tickers),
        supabase.from('options_flow').select('ticker, sentiment, premium, flow_type').in('ticker', tickers),
        supabase.from('short_interest').select('ticker, float_percentage, days_to_cover').in('ticker', tickers),
        supabase.from('earnings_sentiment').select('ticker, earnings_surprise, revenue_surprise, sentiment_score').in('ticker', tickers),
        supabase.from('etf_flows').select('ticker, net_flow, inflow, outflow').in('ticker', tickers),
        supabase.from('crypto_onchain_metrics').select('ticker, whale_signal, exchange_flow_signal, fear_greed_index, mvrv_ratio, active_addresses_change_pct').in('ticker', tickers),
        supabase.from('forex_sentiment').select('ticker, retail_sentiment, retail_long_pct, news_sentiment_score, social_sentiment_score').in('ticker', tickers),
        supabase.from('economic_indicators').select('impact, indicator_type').order('release_date', { ascending: false }).limit(50),
        // NEW: Signals table query (the aggregated layer from all 48 functions)
        supabase.from('signals').select('asset_id, signal_type, magnitude, direction, composite_score').in('asset_id', assetIds).gte('observed_at', thirtyDaysAgo),
        // NEW: Pattern recognition
        supabase.from('pattern_recognition').select('ticker, pattern_type, pattern_category, confidence_score, risk_reward_ratio, status').in('ticker', tickers).eq('status', 'confirmed'),
        // NEW: Smart money flow
        supabase.from('smart_money_flow').select('ticker, smart_money_signal, institutional_net_flow, retail_net_flow, mfi_signal, mfi').in('ticker', tickers),
        // NEW: Social signals
        supabase.from('social_signals').select('ticker, sentiment_score, bullish_count, bearish_count, platform').in('ticker', tickers),
        // NEW: Breaking news
        supabase.from('breaking_news').select('ticker, sentiment_score, relevance_score').in('ticker', tickers),
        // NEW: Job postings
        supabase.from('job_postings').select('ticker, posting_count, growth_indicator').in('ticker', tickers),
        // NEW: COT reports
        supabase.from('cot_reports').select('ticker, sentiment, commercial_net, noncommercial_net, net_position_change').in('ticker', tickers),
        // NEW: Policy feeds
        supabase.from('policy_feeds').select('ticker, sentiment, relevance_score').in('ticker', tickers),
        // NEW: Patent filings
        supabase.from('patent_filings').select('ticker, technology_category, innovation_score').in('ticker', tickers),
        // NEW: Forex technicals
        supabase.from('forex_technicals').select('ticker, rsi_14, rsi_signal, macd_crossover, ma_crossover').in('ticker', tickers),
        // NEW: Search trends (132,830 rows!)
        supabase.from('search_trends').select('ticker, search_volume, trend_change').in('ticker', tickers).order('period_start', { ascending: false }).limit(2000),
      ]);

      // ========================================================================
      // BUILD LOOKUP MAPS FOR ALL DATA SOURCES
      // ========================================================================
      const techMap = new Map((technicals.data || []).map(t => [t.ticker, t]));
      
      const darkPoolMap = new Map<string, { avgPct: number; signalStrength: string; signalType: string }>();
      (darkPool.data || []).forEach(d => {
        const existing = darkPoolMap.get(d.ticker);
        if (!existing || (d.dark_pool_percentage || 0) > existing.avgPct) {
          darkPoolMap.set(d.ticker, { 
            avgPct: d.dark_pool_percentage || 0, 
            signalStrength: d.signal_strength || 'weak',
            signalType: d.signal_type || ''
          });
        }
      });
      
      const form4Map = new Map<string, any[]>();
      (form4.data || []).forEach(f => {
        if (!form4Map.has(f.ticker)) form4Map.set(f.ticker, []);
        form4Map.get(f.ticker)!.push(f);
      });
      
      const holdings13fMap = new Map<string, { shares: number; value: number; hasNew: boolean }>();
      (holdings13f.data || []).forEach(h => {
        const current = holdings13fMap.get(h.ticker) || { shares: 0, value: 0, hasNew: false };
        holdings13fMap.set(h.ticker, {
          shares: current.shares + (h.change_shares || 0),
          value: current.value + (h.value || 0),
          hasNew: current.hasNew || h.change_type === 'new_position',
        });
      });
      
      const congressMap = new Map<string, { buys: number; sells: number; totalValue: number }>();
      (congressionalTrades.data || []).forEach(c => {
        const isPurchase = c.transaction_type?.toLowerCase().includes('purchase');
        const current = congressMap.get(c.ticker) || { buys: 0, sells: 0, totalValue: 0 };
        const avgValue = ((c.amount_min || 0) + (c.amount_max || 0)) / 2;
        congressMap.set(c.ticker, {
          buys: current.buys + (isPurchase ? 1 : 0),
          sells: current.sells + (isPurchase ? 0 : 1),
          totalValue: current.totalValue + (isPurchase ? avgValue : -avgValue),
        });
      });
      
      const newsSentMap = new Map((newsSentiment.data || []).map(n => [n.ticker, n]));
      
      const optionsMap = new Map<string, { bullish: number; bearish: number; totalPremium: number }>();
      (optionsFlow.data || []).forEach(o => {
        if (!optionsMap.has(o.ticker)) optionsMap.set(o.ticker, { bullish: 0, bearish: 0, totalPremium: 0 });
        const entry = optionsMap.get(o.ticker)!;
        entry.totalPremium += o.premium || 0;
        if (o.sentiment === 'bullish') entry.bullish++;
        else if (o.sentiment === 'bearish') entry.bearish++;
      });
      
      const shortMap = new Map((shortInterest.data || []).map(s => [s.ticker, { floatPct: s.float_percentage, daysToCover: s.days_to_cover }]));
      const earningsMap = new Map((earningsSentiment.data || []).map(e => [e.ticker, e]));
      
      const etfMap = new Map<string, { netFlow: number; inflow: number; outflow: number }>();
      (etfFlows.data || []).forEach(e => {
        const current = etfMap.get(e.ticker) || { netFlow: 0, inflow: 0, outflow: 0 };
        etfMap.set(e.ticker, {
          netFlow: current.netFlow + (e.net_flow || 0),
          inflow: current.inflow + (e.inflow || 0),
          outflow: current.outflow + (e.outflow || 0),
        });
      });
      
      const cryptoMap = new Map((cryptoOnchain.data || []).map(c => [c.ticker, c]));
      const forexSentMap = new Map((forexSentiment.data || []).map(f => [f.ticker, f]));
      
      // NEW: Signals map (by asset_id)
      const signalsMap = new Map<string, any[]>();
      (signals.data || []).forEach(s => {
        if (!signalsMap.has(s.asset_id)) signalsMap.set(s.asset_id, []);
        signalsMap.get(s.asset_id)!.push(s);
      });
      
      // NEW: Pattern recognition map
      const patternMap = new Map<string, any[]>();
      (patternRecognition.data || []).forEach(p => {
        if (!patternMap.has(p.ticker)) patternMap.set(p.ticker, []);
        patternMap.get(p.ticker)!.push(p);
      });
      
      // NEW: Smart money flow map
      const smartMoneyMap = new Map((smartMoneyFlow.data || []).map(s => [s.ticker, s]));
      
      // NEW: Social signals map
      const socialMap = new Map<string, { score: number; bullish: number; bearish: number }>();
      (socialSignals.data || []).forEach(s => {
        const current = socialMap.get(s.ticker) || { score: 0, bullish: 0, bearish: 0 };
        socialMap.set(s.ticker, {
          score: current.score + (s.sentiment_score || 0),
          bullish: current.bullish + (s.bullish_count || 0),
          bearish: current.bearish + (s.bearish_count || 0),
        });
      });
      
      // NEW: Breaking news map
      const breakingNewsMap = new Map<string, { avgSentiment: number; count: number }>();
      (breakingNews.data || []).forEach(b => {
        const current = breakingNewsMap.get(b.ticker) || { avgSentiment: 0, count: 0 };
        breakingNewsMap.set(b.ticker, {
          avgSentiment: (current.avgSentiment * current.count + (b.sentiment_score || 0)) / (current.count + 1),
          count: current.count + 1,
        });
      });
      
      // NEW: Job postings map
      const jobsMap = new Map<string, { totalPostings: number; avgGrowth: number }>();
      (jobPostings.data || []).forEach(j => {
        const current = jobsMap.get(j.ticker) || { totalPostings: 0, avgGrowth: 0 };
        jobsMap.set(j.ticker, {
          totalPostings: current.totalPostings + (j.posting_count || 1),
          avgGrowth: (current.avgGrowth + (j.growth_indicator || 0)) / 2,
        });
      });
      
      // NEW: COT reports map
      const cotMap = new Map((cotReports.data || []).map(c => [c.ticker, c]));
      
      // NEW: Policy feeds map
      const policyMap = new Map<string, { sentiment: string; count: number }>();
      (policyFeeds.data || []).forEach(p => {
        if (!policyMap.has(p.ticker)) {
          policyMap.set(p.ticker, { sentiment: p.sentiment || 'neutral', count: 1 });
        } else {
          policyMap.get(p.ticker)!.count++;
        }
      });
      
      // NEW: Patent filings map
      const patentMap = new Map<string, number>();
      (patentFilings.data || []).forEach(p => {
        patentMap.set(p.ticker, (patentMap.get(p.ticker) || 0) + 1);
      });
      
      // NEW: Forex technicals map
      const forexTechMap = new Map((forexTechnicals.data || []).map(f => [f.ticker, f]));
      
      // NEW: Search trends map (132,830 rows!)
      const searchTrendsMap = new Map<string, { volume: number; change: number }>();
      (searchTrends.data || []).forEach(s => {
        // Only keep the first (most recent) entry per ticker
        if (!searchTrendsMap.has(s.ticker)) {
          searchTrendsMap.set(s.ticker, { 
            volume: s.search_volume || 0, 
            change: s.trend_change || 0 
          });
        }
      });

      // Macro score (same for all)
      const econ = economicIndicators.data || [];
      const positiveImpact = econ.filter(e => e.impact === 'positive').length;
      const negativeImpact = econ.filter(e => e.impact === 'negative').length;
      const macroBoost = positiveImpact > negativeImpact ? 2.0 : (negativeImpact > positiveImpact ? -1.5 : 0);

      // ========================================================================
      // COMPUTE SCORES FOR EACH ASSET
      // ========================================================================
      const updates: { id: string; score: number; breakdown: Record<string, number> }[] = [];

      for (const asset of assets) {
        const components: Record<string, number> = {
          BigMoneyConfirm: 0,
          FlowPressure: 0,
          InsiderPoliticianConfirm: 0,
          CapexMomentum: 0,
          PolicyMomentum: 0,
          TechEdge: 0,
          Attention: 0,
          MacroEconomic: macroBoost,
          EarningsMomentum: 0,
          RiskFlags: 0,
        };

        const ticker = asset.ticker;
        const assetClass = asset.asset_class || 'stock';
        const classModifier = CLASS_MODIFIERS[assetClass] || {};

        // ======================================================================
        // PROCESS SIGNALS FROM AGGREGATED SIGNALS TABLE (NEW!)
        // ======================================================================
        const assetSignals = signalsMap.get(asset.id) || [];
        for (const signal of assetSignals) {
          const mapping = SIGNAL_TYPE_TO_COMPONENT[signal.signal_type];
          if (mapping) {
            const directionMult = signal.direction === 'up' ? 1 : (signal.direction === 'down' ? -1 : 0.5);
            const magnitude = signal.magnitude || 1.0;
            const contribution = mapping.multiplier * Math.min(magnitude, 5) * directionMult;
            components[mapping.component] = (components[mapping.component] || 0) + contribution;
          }
        }

        // ======================================================================
        // PROCESS PATTERN RECOGNITION (NEW!)
        // ======================================================================
        const patterns = patternMap.get(ticker) || [];
        for (const pattern of patterns) {
          const confidence = (pattern.confidence_score || 50) / 100;
          const riskReward = Math.min(pattern.risk_reward_ratio || 1, 5);
          
          if (pattern.pattern_category === 'bullish' || pattern.pattern_type?.toLowerCase().includes('bottom')) {
            components.TechEdge += confidence * riskReward * 3.0;
          } else if (pattern.pattern_category === 'bearish' || pattern.pattern_type?.toLowerCase().includes('top')) {
            components.TechEdge -= confidence * riskReward * 2.0;
          } else {
            components.TechEdge += confidence * 1.0; // Neutral patterns still contribute
          }
        }

        // ======================================================================
        // PROCESS SMART MONEY FLOW (NEW!)
        // ======================================================================
        const smartMoney = smartMoneyMap.get(ticker);
        if (smartMoney) {
          if (smartMoney.smart_money_signal === 'strong_buy') components.BigMoneyConfirm += 6.0;
          else if (smartMoney.smart_money_signal === 'buy') components.BigMoneyConfirm += 3.0;
          else if (smartMoney.smart_money_signal === 'strong_sell') components.BigMoneyConfirm -= 4.0;
          else if (smartMoney.smart_money_signal === 'sell') components.BigMoneyConfirm -= 2.0;
          
          // Institutional vs retail flow differential
          const instFlow = smartMoney.institutional_net_flow || 0;
          const retailFlow = smartMoney.retail_net_flow || 0;
          const netDiff = instFlow - retailFlow;
          components.FlowPressure += magnitudeScale(netDiff, 100000, 5.0);
          
          // MFI signal
          if (smartMoney.mfi_signal === 'oversold') components.TechEdge += 2.5;
          else if (smartMoney.mfi_signal === 'overbought') components.TechEdge -= 2.0;
          
          // MFI value directly
          if (smartMoney.mfi !== null && smartMoney.mfi !== undefined) {
            if (smartMoney.mfi < 20) components.TechEdge += 2.0;
            else if (smartMoney.mfi > 80) components.TechEdge -= 1.5;
          }
        }

        // ======================================================================
        // PROCESS SOCIAL SIGNALS (NEW!)
        // ======================================================================
        const social = socialMap.get(ticker);
        if (social) {
          // Net sentiment from bullish/bearish counts
          const netSocial = social.bullish - social.bearish;
          components.Attention += Math.min(netSocial * 0.5, 5.0);
          
          // Sentiment score contribution
          if (social.score !== 0) {
            components.Attention += social.score * 3.0;
          }
        }

        // ======================================================================
        // PROCESS SEARCH TRENDS (NEW! 132,830 rows!)
        // ======================================================================
        const trends = searchTrendsMap.get(ticker);
        if (trends) {
          // Volume spike indicates attention
          if (trends.volume > 1000) {
            components.Attention += Math.min(Math.log10(trends.volume / 100) * 1.5, 3.0);
          } else if (trends.volume > 100) {
            components.Attention += Math.min(Math.log10(trends.volume / 10) * 0.5, 1.5);
          }
          // Trend change direction
          if (trends.change > 50) components.Attention += 2.5;
          else if (trends.change > 20) components.Attention += 1.5;
          else if (trends.change > 0) components.Attention += 0.5;
          else if (trends.change < -20) components.Attention -= 1.0;
          else if (trends.change < -50) components.Attention -= 2.0;
        }

        // ======================================================================
        const news = breakingNewsMap.get(ticker);
        if (news && news.count > 0) {
          // News volume contributes to attention
          components.Attention += Math.min(news.count * 0.5, 3.0);
          // Sentiment contribution
          components.Attention += news.avgSentiment * 4.0;
        }

        // ======================================================================
        // PROCESS JOB POSTINGS (NEW!)
        // ======================================================================
        const jobs = jobsMap.get(ticker);
        if (jobs) {
          // Job posting volume indicates growth
          components.CapexMomentum += Math.min(Math.log10(1 + jobs.totalPostings) * 2.0, 4.0);
          // Growth indicator
          if (jobs.avgGrowth > 0) {
            components.CapexMomentum += Math.min(jobs.avgGrowth * 3.0, 4.0);
          }
        }

        // ======================================================================
        // PROCESS PATENT FILINGS (NEW!)
        // ======================================================================
        const patentCount = patentMap.get(ticker) || 0;
        if (patentCount > 0) {
          components.CapexMomentum += Math.min(Math.log10(1 + patentCount) * 3.0, 5.0);
        }

        // ======================================================================
        // PROCESS COT REPORTS (NEW!)
        // ======================================================================
        const cot = cotMap.get(ticker);
        if (cot) {
          if (cot.sentiment === 'bullish') components.MacroEconomic += 3.0;
          else if (cot.sentiment === 'bearish') components.MacroEconomic -= 2.5;
          
          // Commercial vs non-commercial positioning
          const commNet = cot.commercial_net || 0;
          const nonCommNet = cot.noncommercial_net || 0;
          
          // Commercials are hedgers, non-commercials are speculators
          // Speculators lead trends
          if (nonCommNet > 0) {
            components.MacroEconomic += magnitudeScale(nonCommNet, 10000, 3.0);
          } else {
            components.MacroEconomic += magnitudeScale(nonCommNet, 10000, 2.5);
          }
          
          // Position change momentum
          if (cot.net_position_change) {
            components.FlowPressure += magnitudeScale(cot.net_position_change, 5000, 3.0);
          }
        }

        // ======================================================================
        // PROCESS POLICY FEEDS (NEW!)
        // ======================================================================
        const policy = policyMap.get(ticker);
        if (policy) {
          if (policy.sentiment === 'positive' || policy.sentiment === 'bullish') {
            components.PolicyMomentum += 3.0 + Math.min(policy.count * 0.5, 2.0);
          } else if (policy.sentiment === 'negative' || policy.sentiment === 'bearish') {
            components.PolicyMomentum -= 2.5;
          } else {
            components.PolicyMomentum += Math.min(policy.count * 0.3, 1.5);
          }
        }

        // ======================================================================
        // ORIGINAL DATA SOURCE PROCESSING (enhanced)
        // ======================================================================
        
        // Technical signals
        const tech = techMap.get(ticker);
        if (tech) {
          // Stochastic momentum
          if (tech.stochastic_k !== null && tech.stochastic_k !== undefined) {
            if (tech.stochastic_k < 20) {
              const extremity = (20 - tech.stochastic_k) / 20;
              components.TechEdge += 3.0 + extremity * 3.0;
            } else if (tech.stochastic_k > 80) {
              const extremity = (tech.stochastic_k - 80) / 20;
              components.TechEdge -= 2.0 + extremity * 2.0;
            }
          }
          
          // Breakout signals
          if (tech.breakout_signal === 'resistance_break') components.TechEdge += 4.0;
          else if (tech.breakout_signal === 'support_break') components.TechEdge -= 3.0;
          
          // Trend strength
          if (tech.trend_strength === 'strong_uptrend') components.TechEdge += 2.5;
          else if (tech.trend_strength === 'strong_downtrend') components.TechEdge -= 2.0;
          else if (tech.trend_strength === 'weak_uptrend') components.TechEdge += 0.5;
          else if (tech.trend_strength === 'weak_downtrend') components.TechEdge -= 0.5;
          
          // Stochastic signal
          if (tech.stochastic_signal === 'oversold') components.TechEdge += 2.5;
          else if (tech.stochastic_signal === 'overbought') components.TechEdge -= 2.0;
          
          // ADX (trend strength indicator)
          if (tech.adx !== null && tech.adx !== undefined) {
            if (tech.adx > 25) components.TechEdge += 1.5; // Strong trend
            else if (tech.adx < 15) components.TechEdge -= 0.5; // Weak trend
          }
          
          // VWAP deviation
          if (tech.price_vs_vwap_pct !== null && tech.price_vs_vwap_pct !== undefined) {
            if (tech.price_vs_vwap_pct < -5) components.TechEdge += 2.0; // Below VWAP = potential buy
            else if (tech.price_vs_vwap_pct > 5) components.TechEdge -= 1.5; // Above VWAP = extended
          }
        }

        // Forex technicals
        const forexTech = forexTechMap.get(ticker);
        if (forexTech && assetClass === 'forex') {
          if (forexTech.rsi_14 !== null) {
            if (forexTech.rsi_14 < 30) components.TechEdge += 3.0;
            else if (forexTech.rsi_14 > 70) components.TechEdge -= 2.5;
          }
          if (forexTech.rsi_signal === 'oversold') components.TechEdge += 2.0;
          else if (forexTech.rsi_signal === 'overbought') components.TechEdge -= 1.5;
          
          if (forexTech.macd_crossover === 'bullish') components.TechEdge += 2.5;
          else if (forexTech.macd_crossover === 'bearish') components.TechEdge -= 2.0;
          
          if (forexTech.ma_crossover === 'golden_cross') components.TechEdge += 3.0;
          else if (forexTech.ma_crossover === 'death_cross') components.TechEdge -= 2.5;
        }

        // Dark pool - enhanced
        const dp = darkPoolMap.get(ticker);
        if (dp) {
          const avgDpPct = dp.avgPct;
          if (avgDpPct > 30) {
            const dpScore = Math.min((avgDpPct - 30) / 10 * 3.0, 9.0);
            components.FlowPressure += dpScore;
            components.BigMoneyConfirm += dpScore * 0.6;
          }
          // Signal strength bonus
          if (dp.signalStrength === 'strong') {
            components.BigMoneyConfirm += 2.0;
          }
          // Signal type
          if (dp.signalType === 'accumulation') {
            components.BigMoneyConfirm += 3.0;
          } else if (dp.signalType === 'distribution') {
            components.BigMoneyConfirm -= 2.0;
          }
        }

        // Form 4 insider trades - enhanced
        const f4Trades = form4Map.get(ticker) || [];
        const netInsider = f4Trades.reduce((sum, f) => {
          const mult = f.transaction_type?.toLowerCase().includes('purchase') ? 1 : -1;
          return sum + mult * (f.total_value || 0);
        }, 0);
        const insiderContrib = magnitudeScale(netInsider, 100000, MAX_COMPONENT_VALUE);
        components.InsiderPoliticianConfirm += insiderContrib;
        
        // Count of insider buys as bonus
        const insiderBuys = f4Trades.filter(f => f.transaction_type?.toLowerCase().includes('purchase')).length;
        if (insiderBuys >= 3) components.InsiderPoliticianConfirm += 2.0;

        // 13F holdings - enhanced
        const h13fData = holdings13fMap.get(ticker);
        if (h13fData) {
          const valueContrib = magnitudeScale(h13fData.value, 1000000, MAX_COMPONENT_VALUE);
          const sharesContrib = magnitudeScale(h13fData.shares, 100000, MAX_COMPONENT_VALUE);
          components.BigMoneyConfirm += Math.max(valueContrib, sharesContrib * 0.5);
          
          // New position bonus
          if (h13fData.hasNew) {
            components.BigMoneyConfirm += 2.0;
          }
        }

        // Congressional trades - enhanced
        const congData = congressMap.get(ticker);
        if (congData) {
          const netCong = congData.buys - congData.sells;
          if (netCong > 0) {
            const buyCountScore = Math.min(netCong * 2.5, 6.0);
            const valueScore = magnitudeScale(congData.totalValue, 50000, 4.0);
            components.InsiderPoliticianConfirm += buyCountScore + valueScore;
          } else if (netCong < 0) {
            components.InsiderPoliticianConfirm -= Math.min(Math.abs(netCong) * 1.5, 4.0);
          }
        }

        // News sentiment - enhanced
        const newsSent = newsSentMap.get(ticker);
        if (newsSent) {
          const sentimentContrib = (newsSent.sentiment_score || 0) * 6.0;
          components.Attention += sentimentContrib;
          
          if (newsSent.buzz_score) {
            const buzzBonus = Math.min((newsSent.buzz_score / 100) * 4.0, 4.0);
            components.Attention += buzzBonus;
          }
          
          // Sentiment label bonus
          if (newsSent.sentiment_label === 'bullish' || newsSent.sentiment_label === 'positive') {
            components.Attention += 2.0;
          } else if (newsSent.sentiment_label === 'bearish' || newsSent.sentiment_label === 'negative') {
            components.Attention -= 1.5;
          }
        }

        // Options flow - enhanced
        const opts = optionsMap.get(ticker);
        if (opts) {
          const netSentiment = opts.bullish - opts.bearish;
          if (netSentiment > 0) {
            const optScore = Math.min(netSentiment * 1.5, 6.0);
            components.TechEdge += optScore;
            components.FlowPressure += optScore * 0.5;
            const premiumBonus = magnitudeScale(opts.totalPremium, 1000000, 4.0);
            components.FlowPressure += premiumBonus;
          } else if (netSentiment < 0) {
            components.TechEdge -= Math.min(Math.abs(netSentiment) * 1.0, 4.0);
          }
        }

        // Short interest - enhanced risk
        const si = shortMap.get(ticker);
        if (si) {
          if (si.floatPct !== undefined && si.floatPct > 0) {
            const siRisk = Math.min((si.floatPct / 10) * 1.5, MAX_COMPONENT_VALUE);
            components.RiskFlags += siRisk;
          }
          // Days to cover adds to risk
          if (si.daysToCover !== undefined && si.daysToCover > 5) {
            components.RiskFlags += Math.min(si.daysToCover * 0.2, 2.0);
          }
        }

        // Earnings - enhanced
        const earnings = earningsMap.get(ticker);
        if (earnings) {
          if (earnings.earnings_surprise !== undefined) {
            const earnContrib = magnitudeScale(earnings.earnings_surprise * 100, 10, 6.0);
            components.EarningsMomentum += earnContrib;
          }
          if (earnings.revenue_surprise !== undefined) {
            const revContrib = magnitudeScale(earnings.revenue_surprise * 100, 10, 4.0);
            components.EarningsMomentum += revContrib;
          }
          if (earnings.sentiment_score !== undefined) {
            components.EarningsMomentum += earnings.sentiment_score * 2.0;
          }
        }

        // ETF flows - enhanced
        const etf = etfMap.get(ticker);
        if (etf) {
          const flowContrib = magnitudeScale(etf.netFlow, 10000000, 8.0);
          components.FlowPressure += flowContrib;
          
          // Inflow/outflow ratio
          if (etf.inflow > 0 && etf.outflow > 0) {
            const ratio = etf.inflow / etf.outflow;
            if (ratio > 2) components.FlowPressure += 2.0;
            else if (ratio < 0.5) components.FlowPressure -= 1.5;
          }
        }

        // Crypto-specific - enhanced
        if (assetClass === 'crypto') {
          const crypto = cryptoMap.get(ticker);
          if (crypto) {
            if (crypto.whale_signal === 'accumulation') components.BigMoneyConfirm += 5.0;
            else if (crypto.whale_signal === 'distribution') components.BigMoneyConfirm -= 3.0;
            
            if (crypto.exchange_flow_signal === 'outflow') components.FlowPressure += 4.0;
            else if (crypto.exchange_flow_signal === 'inflow') components.FlowPressure -= 2.0;
            
            if (crypto.fear_greed_index !== null) {
              if (crypto.fear_greed_index < 25) {
                components.TechEdge += (25 - crypto.fear_greed_index) / 25 * 5.0;
              } else if (crypto.fear_greed_index > 75) {
                components.RiskFlags += (crypto.fear_greed_index - 75) / 25 * 3.0;
              }
            }
            
            if (crypto.mvrv_ratio !== null) {
              if (crypto.mvrv_ratio < 1) {
                components.BigMoneyConfirm += (1 - crypto.mvrv_ratio) * 6.0;
              } else if (crypto.mvrv_ratio > 3) {
                components.RiskFlags += Math.min((crypto.mvrv_ratio - 3) * 2.0, 6.0);
              }
            }
            
            // Active addresses change
            if (crypto.active_addresses_change_pct !== null) {
              if (crypto.active_addresses_change_pct > 10) {
                components.Attention += 2.0;
              } else if (crypto.active_addresses_change_pct < -10) {
                components.Attention -= 1.5;
              }
            }
          }
        }

        // Forex-specific - enhanced
        if (assetClass === 'forex') {
          const fxData = forexSentMap.get(ticker);
          if (fxData) {
            if (fxData.retail_sentiment === 'bullish') components.Attention += 3.0;
            else if (fxData.retail_sentiment === 'bearish') components.Attention -= 2.0;
            
            // Contrarian retail positioning
            if (fxData.retail_long_pct !== null) {
              if (fxData.retail_long_pct > 75) {
                components.RiskFlags += 2.0;
                components.TechEdge -= 1.0; // Contrarian signal
              } else if (fxData.retail_long_pct < 25) {
                components.TechEdge += 2.0;
              }
            }
            
            // News and social sentiment
            if (fxData.news_sentiment_score !== null) {
              components.Attention += fxData.news_sentiment_score * 3.0;
            }
            if (fxData.social_sentiment_score !== null) {
              components.Attention += fxData.social_sentiment_score * 2.0;
            }
          }
        }

        // ======================================================================
        // APPLY ASSET-CLASS MODIFIERS AND NORMALIZE
        // ======================================================================
        
        // Apply asset-class-specific weight modifiers
        for (const [key, modifier] of Object.entries(classModifier)) {
          if (components[key] !== undefined) {
            components[key] *= modifier;
          }
        }

        // Cap each component to MAX_COMPONENT_VALUE
        for (const key of Object.keys(components)) {
          if (key === 'RiskFlags') {
            components[key] = Math.max(0, Math.min(components[key], MAX_COMPONENT_VALUE));
          } else {
            components[key] = Math.max(-MAX_COMPONENT_VALUE, Math.min(components[key], MAX_COMPONENT_VALUE));
          }
        }

        // Compute weighted score with normalization
        let rawScore = 0;
        let activeComponentsMax = 0;
        
        for (const [key, weight] of Object.entries(WEIGHTS)) {
          const componentValue = components[key] || 0;
          rawScore += weight * componentValue;
          
          // Track max possible from active components
          if (componentValue !== 0 || key === 'MacroEconomic') {
            activeComponentsMax += Math.abs(weight) * MAX_COMPONENT_VALUE;
          }
        }

        // Normalize relative to active components (prevents sparse data from clustering at 50)
        const effectiveMax = Math.max(activeComponentsMax, 3.0 * MAX_COMPONENT_VALUE);
        const normalizedRaw = rawScore / effectiveMax;
        
        // Map to 15-85 range, centered at 50
        const finalScore = Math.max(15, Math.min(85, 50 + normalizedRaw * 35));
        
        updates.push({ 
          id: asset.id, 
          score: Math.round(finalScore * 10) / 10,
          breakdown: { ...components },
        });
        processedCount++;
      }

      // Batch update scores (bulk upsert for performance)
      const now = new Date().toISOString();
      const upsertRows = updates.map((update) => ({
        id: update.id,
        computed_score: update.score,
        score_computed_at: now,
        metadata: { score_breakdown: update.breakdown },
      }));

      const { error: upsertError } = await supabase
        .from('assets')
        .upsert(upsertRows, { onConflict: 'id' });

      if (upsertError) {
        console.error('Error bulk-updating asset scores:', upsertError);
        break;
      }

      console.log(`Updated ${updates.length} asset scores`);
      offset += batchSize;
    }

    // Calculate next offset for continuation
    const nextOffset = offset >= (totalAssets || 0) ? 0 : offset;

    const duration = Date.now() - startTime;
    console.log(`Score computation complete. Processed ${processedCount} assets in ${duration}ms. Next offset: ${nextOffset}`);

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'compute-asset-scores',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: processedCount,
      metadata: { 
        start_offset: startOffset,
        end_offset: offset,
        next_offset: nextOffset,
        total_assets: totalAssets,
        data_sources_queried: 23,
        signal_types_mapped: Object.keys(SIGNAL_TYPE_TO_COMPONENT).length,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount, 
        duration_ms: duration,
        next_offset: nextOffset,
        total_assets: totalAssets,
        start_offset: startOffset,
        end_offset: offset,
        data_sources_queried: 23,
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
