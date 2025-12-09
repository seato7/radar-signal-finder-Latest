import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ComponentScore {
  key: string;
  value: number;
  weight: number;
  description: string;
  dataSources: string[];
  signalCount: number;
  rawData: Record<string, number>;
}

export interface AssetScoreResult {
  score: number;
  scoreChange: number;
  componentScores: ComponentScore[];
  totalSignals: number;
  dataSourcesUsed: string[];
  loading: boolean;
  error: string | null;
}

// Component weights from backend/scoring.py spec
const COMPONENT_CONFIG = {
  TechnicalStrength: { 
    weight: 1.0, 
    description: "RSI, MACD, stochastic, MA crossovers, breakout signals from TwelveData & advanced technicals",
    sources: ["advanced_technicals", "prices", "forex_technicals", "pattern_recognition", "signals:technical_*"]
  },
  PatternRecognition: { 
    weight: 0.8, 
    description: "Chart patterns, Fibonacci levels, support/resistance from pattern recognition",
    sources: ["pattern_recognition", "signals:chart_pattern"]
  },
  SentimentScore: { 
    weight: 0.8, 
    description: "News sentiment, social buzz, search trends, Reddit, StockTwits",
    sources: ["news_sentiment_aggregate", "breaking_news", "social_signals", "search_trends", "forex_sentiment", "signals:sentiment_*"]
  },
  InstitutionalFlow: { 
    weight: 1.0, 
    description: "Dark pool activity, smart money flow, 13F filings, ETF flows",
    sources: ["dark_pool_activity", "smart_money_flow", "signals:smart_money_*", "signals:flow_*", "signals:13f_*"]
  },
  InsiderActivity: { 
    weight: 0.8, 
    description: "Form 4 insider trades, congressional trades, politician activity",
    sources: ["congressional_trades", "signals:insider_*", "signals:form4_*", "signals:politician_*"]
  },
  OptionsFlow: { 
    weight: 0.7, 
    description: "Unusual options activity, put/call ratios, premium flow",
    sources: ["options_flow", "short_interest"]
  },
  MacroEconomic: { 
    weight: 0.6, 
    description: "Economic indicators, FRED data, COT reports, interest rates",
    sources: ["economic_indicators", "cot_reports", "signals:economic_*", "signals:cot_*"]
  },
  CapexMomentum: { 
    weight: 0.6, 
    description: "Job postings, patents, supply chain signals, expansion indicators",
    sources: ["job_postings", "patent_filings", "supply_chain_signals", "signals:capex_*"]
  },
  CryptoOnchain: { 
    weight: 0.5, 
    description: "Whale activity, exchange flows, on-chain metrics (crypto only)",
    sources: ["crypto_onchain_metrics", "signals:crypto_*"]
  },
  EarningsMomentum: { 
    weight: 0.5, 
    description: "Earnings surprises, revenue beats, guidance changes",
    sources: ["earnings_sentiment"]
  }
};

export function useAssetScore(ticker: string | null, assetId: string | null, assetClass: string | null): AssetScoreResult {
  const [result, setResult] = useState<AssetScoreResult>({
    score: 0,
    scoreChange: 0,
    componentScores: [],
    totalSignals: 0,
    dataSourcesUsed: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    if (!ticker || !assetId) {
      setResult(prev => ({ ...prev, loading: false }));
      return;
    }

    const fetchAllData = async () => {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Fetch ALL data sources in parallel
        const [
          signalsResult,
          advancedTechnicalsResult,
          pricesResult,
          patternRecognitionResult,
          newsSentimentResult,
          breakingNewsResult,
          socialSignalsResult,
          searchTrendsResult,
          darkPoolResult,
          smartMoneyResult,
          optionsFlowResult,
          shortInterestResult,
          congressionalResult,
          economicResult,
          cotReportsResult,
          jobPostingsResult,
          patentsResult,
          supplyChainResult,
          cryptoOnchainResult,
          earningsSentimentResult,
          forexSentimentResult,
          forexTechnicalsResult
        ] = await Promise.all([
          // 1. Signals table (aggregated from all ingestions)
          supabase
            .from('signals')
            .select('id, signal_type, magnitude, direction, observed_at, value_text')
            .eq('asset_id', assetId)
            .gte('observed_at', thirtyDaysAgo)
            .order('observed_at', { ascending: false })
            .limit(500),

          // 2. Advanced Technicals (TwelveData)
          supabase
            .from('advanced_technicals')
            .select('*')
            .eq('ticker', ticker)
            .order('timestamp', { ascending: false })
            .limit(10),

          // 3. Prices (TwelveData)
          supabase
            .from('prices')
            .select('*')
            .eq('ticker', ticker)
            .order('date', { ascending: false })
            .limit(30),

          // 4. Pattern Recognition
          supabase
            .from('pattern_recognition')
            .select('*')
            .eq('ticker', ticker)
            .gte('detected_at', thirtyDaysAgo)
            .order('detected_at', { ascending: false })
            .limit(50),

          // 5. News Sentiment Aggregate
          supabase
            .from('news_sentiment_aggregate')
            .select('*')
            .eq('ticker', ticker)
            .gte('date', sevenDaysAgo)
            .order('date', { ascending: false })
            .limit(14),

          // 6. Breaking News
          supabase
            .from('breaking_news')
            .select('*')
            .eq('ticker', ticker)
            .gte('published_at', sevenDaysAgo)
            .order('published_at', { ascending: false })
            .limit(20),

          // 7. Social Signals
          supabase
            .from('social_signals')
            .select('*')
            .eq('ticker', ticker)
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(30),

          // 8. Search Trends
          supabase
            .from('search_trends')
            .select('*')
            .eq('ticker', ticker)
            .gte('period_start', thirtyDaysAgo)
            .order('period_start', { ascending: false })
            .limit(30),

          // 9. Dark Pool Activity
          supabase
            .from('dark_pool_activity')
            .select('*')
            .eq('ticker', ticker)
            .gte('trade_date', thirtyDaysAgo)
            .order('trade_date', { ascending: false })
            .limit(30),

          // 10. Smart Money Flow
          supabase
            .from('smart_money_flow')
            .select('*')
            .eq('ticker', ticker)
            .gte('timestamp', thirtyDaysAgo)
            .order('timestamp', { ascending: false })
            .limit(30),

          // 11. Options Flow
          supabase
            .from('options_flow')
            .select('*')
            .eq('ticker', ticker)
            .gte('trade_date', thirtyDaysAgo)
            .order('trade_date', { ascending: false })
            .limit(50),

          // 12. Short Interest
          supabase
            .from('short_interest')
            .select('*')
            .eq('ticker', ticker)
            .gte('report_date', ninetyDaysAgo)
            .order('report_date', { ascending: false })
            .limit(10),

          // 13. Congressional Trades
          supabase
            .from('congressional_trades')
            .select('*')
            .eq('ticker', ticker)
            .gte('transaction_date', ninetyDaysAgo)
            .order('transaction_date', { ascending: false })
            .limit(20),

          // 14. Economic Indicators
          supabase
            .from('economic_indicators')
            .select('*')
            .gte('release_date', thirtyDaysAgo)
            .order('release_date', { ascending: false })
            .limit(30),

          // 15. COT Reports
          supabase
            .from('cot_reports')
            .select('*')
            .eq('ticker', ticker)
            .gte('report_date', ninetyDaysAgo)
            .order('report_date', { ascending: false })
            .limit(10),

          // 16. Job Postings
          supabase
            .from('job_postings')
            .select('*')
            .eq('ticker', ticker)
            .gte('posted_date', ninetyDaysAgo)
            .order('posted_date', { ascending: false })
            .limit(30),

          // 17. Patent Filings
          supabase
            .from('patent_filings')
            .select('*')
            .eq('ticker', ticker)
            .gte('filing_date', ninetyDaysAgo)
            .order('filing_date', { ascending: false })
            .limit(20),

          // 18. Supply Chain Signals
          supabase
            .from('supply_chain_signals')
            .select('*')
            .eq('ticker', ticker)
            .gte('report_date', ninetyDaysAgo)
            .order('report_date', { ascending: false })
            .limit(20),

          // 19. Crypto On-chain Metrics (if crypto)
          assetClass === 'crypto' ? supabase
            .from('crypto_onchain_metrics')
            .select('*')
            .eq('ticker', ticker)
            .order('timestamp', { ascending: false })
            .limit(10) : Promise.resolve({ data: [], error: null }),

          // 20. Earnings Sentiment
          supabase
            .from('earnings_sentiment')
            .select('*')
            .eq('ticker', ticker)
            .order('earnings_date', { ascending: false })
            .limit(4),

          // 21. Forex Sentiment (if forex)
          assetClass === 'forex' ? supabase
            .from('forex_sentiment')
            .select('*')
            .eq('ticker', ticker)
            .order('timestamp', { ascending: false })
            .limit(10) : Promise.resolve({ data: [], error: null }),

          // 22. Forex Technicals (if forex)
          assetClass === 'forex' ? supabase
            .from('forex_technicals')
            .select('*')
            .eq('ticker', ticker)
            .order('timestamp', { ascending: false })
            .limit(10) : Promise.resolve({ data: [], error: null })
        ]);

        // Extract data
        const signals = signalsResult.data || [];
        const advancedTechnicals = advancedTechnicalsResult.data || [];
        const prices = pricesResult.data || [];
        const patterns = patternRecognitionResult.data || [];
        const newsSentiment = newsSentimentResult.data || [];
        const breakingNews = breakingNewsResult.data || [];
        const socialSignals = socialSignalsResult.data || [];
        const searchTrends = searchTrendsResult.data || [];
        const darkPool = darkPoolResult.data || [];
        const smartMoney = smartMoneyResult.data || [];
        const optionsFlow = optionsFlowResult.data || [];
        const shortInterest = shortInterestResult.data || [];
        const congressional = congressionalResult.data || [];
        const economic = economicResult.data || [];
        const cotReports = cotReportsResult.data || [];
        const jobPostings = jobPostingsResult.data || [];
        const patents = patentsResult.data || [];
        const supplyChain = supplyChainResult.data || [];
        const cryptoOnchain = cryptoOnchainResult.data || [];
        const earningsSentiment = earningsSentimentResult.data || [];
        const forexSentiment = forexSentimentResult.data || [];
        const forexTechnicals = forexTechnicalsResult.data || [];

        // Track which data sources are being used
        const dataSourcesUsed: string[] = [];
        let totalSignalCount = signals.length;

        // Helper: filter signals by type pattern
        const getSignalsByType = (pattern: string) => 
          signals.filter(s => s.signal_type?.toLowerCase().includes(pattern.toLowerCase()));

        // Calculate each component score
        const components: ComponentScore[] = [];

        // ═══════════════════════════════════════════════════════════════════
        // 1. TECHNICAL STRENGTH (Weight: 1.0)
        // Sources: advanced_technicals, prices, forex_technicals, signals
        // ═══════════════════════════════════════════════════════════════════
        let technicalScore = 50;
        let technicalSignalCount = 0;
        const technicalRawData: Record<string, number> = {};
        const technicalSources: string[] = [];

        // From advanced_technicals (TwelveData)
        if (advancedTechnicals.length > 0) {
          const latest = advancedTechnicals[0];
          technicalSources.push('advanced_technicals');
          dataSourcesUsed.push('TwelveData Technicals');
          technicalSignalCount++;

          // Stochastic signal
          if (latest.stochastic_signal === 'oversold') {
            technicalScore += 15;
            technicalRawData.stochastic_oversold = 1;
          } else if (latest.stochastic_signal === 'overbought') {
            technicalScore -= 10;
            technicalRawData.stochastic_overbought = 1;
          }

          // Trend strength
          if (latest.trend_strength === 'strong_up') {
            technicalScore += 12;
            technicalRawData.trend_strong_up = 1;
          } else if (latest.trend_strength === 'strong_down') {
            technicalScore -= 12;
            technicalRawData.trend_strong_down = 1;
          }

          // Breakout signal
          if (latest.breakout_signal === 'bullish') {
            technicalScore += 10;
            technicalRawData.breakout_bullish = 1;
          } else if (latest.breakout_signal === 'bearish') {
            technicalScore -= 10;
            technicalRawData.breakout_bearish = 1;
          }

          // ADX trend strength
          if (latest.adx && latest.adx > 25) {
            technicalScore += 5;
            technicalRawData.adx = latest.adx;
          }

          // Price vs VWAP
          if (latest.price_vs_vwap_pct) {
            if (latest.price_vs_vwap_pct > 2) technicalScore += 5;
            else if (latest.price_vs_vwap_pct < -2) technicalScore -= 5;
            technicalRawData.price_vs_vwap = latest.price_vs_vwap_pct;
          }
        }

        // From prices (TwelveData) - price momentum
        if (prices.length >= 2) {
          technicalSources.push('prices');
          dataSourcesUsed.push('TwelveData Prices');
          const priceChange = ((prices[0].close - prices[prices.length - 1].close) / prices[prices.length - 1].close) * 100;
          if (priceChange > 5) technicalScore += 8;
          else if (priceChange < -5) technicalScore -= 8;
          technicalRawData.price_momentum = priceChange;
          technicalSignalCount++;
        }

        // From forex_technicals (if forex)
        if (forexTechnicals.length > 0) {
          const fx = forexTechnicals[0];
          technicalSources.push('forex_technicals');
          dataSourcesUsed.push('Forex Technicals');
          technicalSignalCount++;

          if (fx.rsi_signal === 'oversold') technicalScore += 10;
          else if (fx.rsi_signal === 'overbought') technicalScore -= 8;

          if (fx.macd_crossover === 'bullish') technicalScore += 8;
          else if (fx.macd_crossover === 'bearish') technicalScore -= 8;

          if (fx.ma_crossover === 'golden_cross') technicalScore += 10;
          else if (fx.ma_crossover === 'death_cross') technicalScore -= 10;

          technicalRawData.rsi = fx.rsi_14 || 50;
        }

        // From signals: technical_*
        const techSignals = getSignalsByType('technical');
        techSignals.forEach(s => {
          technicalScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 8 : s.direction === 'down' ? -8 : 0);
        });
        technicalSignalCount += techSignals.length;
        if (techSignals.length > 0) {
          technicalSources.push('signals:technical');
          dataSourcesUsed.push('Technical Signals');
        }

        technicalScore = Math.max(0, Math.min(100, technicalScore));
        components.push({
          key: 'TechnicalStrength',
          value: Math.round(technicalScore),
          weight: COMPONENT_CONFIG.TechnicalStrength.weight,
          description: COMPONENT_CONFIG.TechnicalStrength.description,
          dataSources: technicalSources,
          signalCount: technicalSignalCount,
          rawData: technicalRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 2. PATTERN RECOGNITION (Weight: 0.8)
        // Sources: pattern_recognition, signals:chart_pattern
        // ═══════════════════════════════════════════════════════════════════
        let patternScore = 50;
        let patternSignalCount = 0;
        const patternRawData: Record<string, number> = {};
        const patternSources: string[] = [];

        if (patterns.length > 0) {
          patternSources.push('pattern_recognition');
          dataSourcesUsed.push('Pattern Recognition');
          patternSignalCount = patterns.length;

          let bullishPatterns = 0;
          let bearishPatterns = 0;
          let totalConfidence = 0;

          patterns.forEach(p => {
            const conf = p.confidence_score || 0.5;
            totalConfidence += conf;
            if (p.pattern_category === 'bullish' || p.pattern_type?.includes('bullish')) {
              patternScore += conf * 10;
              bullishPatterns++;
            } else if (p.pattern_category === 'bearish' || p.pattern_type?.includes('bearish')) {
              patternScore -= conf * 10;
              bearishPatterns++;
            }
          });

          patternRawData.bullish_patterns = bullishPatterns;
          patternRawData.bearish_patterns = bearishPatterns;
          patternRawData.avg_confidence = totalConfidence / patterns.length;
        }

        const chartSignals = getSignalsByType('chart_pattern');
        chartSignals.forEach(s => {
          patternScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 8 : s.direction === 'down' ? -8 : 0);
        });
        patternSignalCount += chartSignals.length;
        if (chartSignals.length > 0) {
          patternSources.push('signals:chart_pattern');
        }

        patternScore = Math.max(0, Math.min(100, patternScore));
        components.push({
          key: 'PatternRecognition',
          value: Math.round(patternScore),
          weight: COMPONENT_CONFIG.PatternRecognition.weight,
          description: COMPONENT_CONFIG.PatternRecognition.description,
          dataSources: patternSources,
          signalCount: patternSignalCount,
          rawData: patternRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 3. SENTIMENT SCORE (Weight: 0.8)
        // Sources: news_sentiment_aggregate, breaking_news, social_signals, search_trends, forex_sentiment
        // ═══════════════════════════════════════════════════════════════════
        let sentimentScore = 50;
        let sentimentSignalCount = 0;
        const sentimentRawData: Record<string, number> = {};
        const sentimentSources: string[] = [];

        // News sentiment aggregate
        if (newsSentiment.length > 0) {
          sentimentSources.push('news_sentiment_aggregate');
          dataSourcesUsed.push('News Sentiment');
          sentimentSignalCount += newsSentiment.length;

          const avgSentiment = newsSentiment.reduce((acc, d) => acc + (d.sentiment_score || 0), 0) / newsSentiment.length;
          sentimentScore += avgSentiment * 30; // -1 to 1 range
          sentimentRawData.news_sentiment = avgSentiment;

          const avgBuzz = newsSentiment.reduce((acc, d) => acc + (d.buzz_score || 0), 0) / newsSentiment.length;
          if (avgBuzz > 0.5) sentimentScore += 5;
          sentimentRawData.buzz_score = avgBuzz;
        }

        // Breaking news sentiment
        if (breakingNews.length > 0) {
          sentimentSources.push('breaking_news');
          dataSourcesUsed.push('Breaking News');
          sentimentSignalCount += breakingNews.length;

          const avgNewsSent = breakingNews.reduce((acc, n) => acc + (n.sentiment_score || 0), 0) / breakingNews.length;
          sentimentScore += avgNewsSent * 15;
          sentimentRawData.breaking_news_sentiment = avgNewsSent;
        }

        // Social signals
        if (socialSignals.length > 0) {
          sentimentSources.push('social_signals');
          dataSourcesUsed.push('Social Media');
          sentimentSignalCount += socialSignals.length;

          const avgSocial = socialSignals.reduce((acc, s) => acc + (s.sentiment_score || 0), 0) / socialSignals.length;
          sentimentScore += avgSocial * 15;
          sentimentRawData.social_sentiment = avgSocial;
        }

        // Search trends
        if (searchTrends.length > 0) {
          sentimentSources.push('search_trends');
          dataSourcesUsed.push('Search Trends');
          sentimentSignalCount += searchTrends.length;

          // Increasing search interest is positive
          if (searchTrends.length >= 2) {
            const trend = searchTrends[0].search_volume - searchTrends[searchTrends.length - 1].search_volume;
            if (trend > 0) sentimentScore += 5;
            sentimentRawData.search_trend = trend;
          }
        }

        // Forex sentiment
        if (forexSentiment.length > 0) {
          sentimentSources.push('forex_sentiment');
          dataSourcesUsed.push('Forex Sentiment');
          sentimentSignalCount += forexSentiment.length;

          const fx = forexSentiment[0];
          if (fx.retail_sentiment === 'bullish') sentimentScore += 8;
          else if (fx.retail_sentiment === 'bearish') sentimentScore -= 8;

          const socialSent = fx.social_sentiment_score || 0;
          sentimentScore += socialSent * 10;
        }

        // Sentiment signals
        const sentSignals = getSignalsByType('sentiment');
        sentSignals.forEach(s => {
          sentimentScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 6 : s.direction === 'down' ? -6 : 0);
        });
        sentimentSignalCount += sentSignals.length;
        if (sentSignals.length > 0) {
          sentimentSources.push('signals:sentiment');
        }

        sentimentScore = Math.max(0, Math.min(100, sentimentScore));
        components.push({
          key: 'SentimentScore',
          value: Math.round(sentimentScore),
          weight: COMPONENT_CONFIG.SentimentScore.weight,
          description: COMPONENT_CONFIG.SentimentScore.description,
          dataSources: sentimentSources,
          signalCount: sentimentSignalCount,
          rawData: sentimentRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 4. INSTITUTIONAL FLOW (Weight: 1.0)
        // Sources: dark_pool_activity, smart_money_flow, signals
        // ═══════════════════════════════════════════════════════════════════
        let instScore = 50;
        let instSignalCount = 0;
        const instRawData: Record<string, number> = {};
        const instSources: string[] = [];

        // Dark pool activity
        if (darkPool.length > 0) {
          instSources.push('dark_pool_activity');
          dataSourcesUsed.push('Dark Pool Activity');
          instSignalCount += darkPool.length;

          const avgDpPct = darkPool.reduce((acc, d) => acc + (d.dark_pool_percentage || 0), 0) / darkPool.length;
          if (avgDpPct > 40) instScore += 12;
          else if (avgDpPct > 30) instScore += 8;
          instRawData.dark_pool_pct = avgDpPct;

          darkPool.forEach(d => {
            if (d.signal_type === 'accumulation') instScore += 8;
            else if (d.signal_type === 'distribution') instScore -= 8;
          });
        }

        // Smart money flow
        if (smartMoney.length > 0) {
          instSources.push('smart_money_flow');
          dataSourcesUsed.push('Smart Money Flow');
          instSignalCount += smartMoney.length;

          let netFlow = 0;
          smartMoney.forEach(s => {
            const flow = s.institutional_net_flow || 0;
            netFlow += flow;
            const strength = s.cmf_signal || '';
            if (strength === 'strong_accumulation') {
              instScore += 10;
            } else if (strength === 'accumulation') {
              instScore += 5;
            } else if (strength === 'distribution') {
              instScore -= 5;
            } else if (strength === 'strong_distribution') {
              instScore -= 10;
            }
          });
          instRawData.net_smart_money_flow = netFlow;
        }

        // Flow signals
        const flowSignals = [...getSignalsByType('smart_money'), ...getSignalsByType('flow'), ...getSignalsByType('13f')];
        flowSignals.forEach(s => {
          instScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 8 : s.direction === 'down' ? -8 : 0);
        });
        instSignalCount += flowSignals.length;
        if (flowSignals.length > 0) {
          instSources.push('signals:flow');
        }

        instScore = Math.max(0, Math.min(100, instScore));
        components.push({
          key: 'InstitutionalFlow',
          value: Math.round(instScore),
          weight: COMPONENT_CONFIG.InstitutionalFlow.weight,
          description: COMPONENT_CONFIG.InstitutionalFlow.description,
          dataSources: instSources,
          signalCount: instSignalCount,
          rawData: instRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 5. INSIDER ACTIVITY (Weight: 0.8)
        // Sources: congressional_trades, signals:insider/form4/politician
        // ═══════════════════════════════════════════════════════════════════
        let insiderScore = 50;
        let insiderSignalCount = 0;
        const insiderRawData: Record<string, number> = {};
        const insiderSources: string[] = [];

        // Congressional trades
        if (congressional.length > 0) {
          insiderSources.push('congressional_trades');
          dataSourcesUsed.push('Congressional Trades');
          insiderSignalCount += congressional.length;

          let buys = 0;
          let sells = 0;
          congressional.forEach(t => {
            const type = t.transaction_type?.toLowerCase() || '';
            if (type.includes('buy') || type.includes('purchase')) {
              insiderScore += 12;
              buys++;
            } else if (type.includes('sell') || type.includes('sale')) {
              insiderScore -= 8;
              sells++;
            }
          });
          insiderRawData.congressional_buys = buys;
          insiderRawData.congressional_sells = sells;
        }

        // Insider signals
        const insiderSignals = [...getSignalsByType('insider'), ...getSignalsByType('form4'), ...getSignalsByType('politician')];
        insiderSignals.forEach(s => {
          insiderScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 10 : s.direction === 'down' ? -10 : 0);
        });
        insiderSignalCount += insiderSignals.length;
        if (insiderSignals.length > 0) {
          insiderSources.push('signals:insider');
        }

        insiderScore = Math.max(0, Math.min(100, insiderScore));
        components.push({
          key: 'InsiderActivity',
          value: Math.round(insiderScore),
          weight: COMPONENT_CONFIG.InsiderActivity.weight,
          description: COMPONENT_CONFIG.InsiderActivity.description,
          dataSources: insiderSources,
          signalCount: insiderSignalCount,
          rawData: insiderRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 6. OPTIONS FLOW (Weight: 0.7)
        // Sources: options_flow, short_interest
        // ═══════════════════════════════════════════════════════════════════
        let optionsScore = 50;
        let optionsSignalCount = 0;
        const optionsRawData: Record<string, number> = {};
        const optionsSources: string[] = [];

        // Options flow
        if (optionsFlow.length > 0) {
          optionsSources.push('options_flow');
          dataSourcesUsed.push('Options Flow');
          optionsSignalCount += optionsFlow.length;

          let callPremium = 0;
          let putPremium = 0;
          optionsFlow.forEach(o => {
            const premium = o.premium || 0;
            if (o.option_type === 'call') callPremium += premium;
            else if (o.option_type === 'put') putPremium += premium;

            if (o.sentiment === 'bullish') optionsScore += 5;
            else if (o.sentiment === 'bearish') optionsScore -= 5;
          });

          const pcRatio = putPremium > 0 ? callPremium / putPremium : 1;
          if (pcRatio > 1.5) optionsScore += 10; // More calls = bullish
          else if (pcRatio < 0.7) optionsScore -= 10; // More puts = bearish
          optionsRawData.put_call_ratio = pcRatio;
        }

        // Short interest
        if (shortInterest.length > 0) {
          optionsSources.push('short_interest');
          dataSourcesUsed.push('Short Interest');
          optionsSignalCount += shortInterest.length;

          const latest = shortInterest[0];
          const floatPct = latest.float_percentage || 0;
          const dtc = latest.days_to_cover || 0;

          // High short interest with high days to cover = potential squeeze
          if (floatPct > 20 && dtc > 5) {
            optionsScore += 15; // Squeeze potential
            optionsRawData.squeeze_potential = 1;
          } else if (floatPct > 15) {
            optionsScore -= 5; // High shorting pressure
          }
          optionsRawData.short_float_pct = floatPct;
          optionsRawData.days_to_cover = dtc;
        }

        optionsScore = Math.max(0, Math.min(100, optionsScore));
        components.push({
          key: 'OptionsFlow',
          value: Math.round(optionsScore),
          weight: COMPONENT_CONFIG.OptionsFlow.weight,
          description: COMPONENT_CONFIG.OptionsFlow.description,
          dataSources: optionsSources,
          signalCount: optionsSignalCount,
          rawData: optionsRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 7. MACRO ECONOMIC (Weight: 0.6)
        // Sources: economic_indicators, cot_reports, signals
        // ═══════════════════════════════════════════════════════════════════
        let macroScore = 50;
        let macroSignalCount = 0;
        const macroRawData: Record<string, number> = {};
        const macroSources: string[] = [];

        // Economic indicators
        if (economic.length > 0) {
          macroSources.push('economic_indicators');
          dataSourcesUsed.push('Economic Indicators');
          macroSignalCount += economic.length;

          economic.forEach(e => {
            const beat = (e.value - (e.forecast_value || e.previous_value || e.value)) / Math.abs(e.forecast_value || e.previous_value || 1);
            if (e.impact === 'high') {
              macroScore += beat * 10;
            } else {
              macroScore += beat * 5;
            }
          });
        }

        // COT reports
        if (cotReports.length > 0) {
          macroSources.push('cot_reports');
          dataSourcesUsed.push('COT Reports');
          macroSignalCount += cotReports.length;

          const latest = cotReports[0];
          if (latest.sentiment === 'bullish') macroScore += 10;
          else if (latest.sentiment === 'bearish') macroScore -= 10;

          const netChange = latest.net_position_change || 0;
          if (netChange > 0) macroScore += 5;
          else if (netChange < 0) macroScore -= 5;
          macroRawData.cot_net_change = netChange;
        }

        // Economic signals
        const econSignals = [...getSignalsByType('economic'), ...getSignalsByType('cot')];
        econSignals.forEach(s => {
          macroScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 6 : s.direction === 'down' ? -6 : 0);
        });
        macroSignalCount += econSignals.length;
        if (econSignals.length > 0) {
          macroSources.push('signals:economic');
        }

        macroScore = Math.max(0, Math.min(100, macroScore));
        components.push({
          key: 'MacroEconomic',
          value: Math.round(macroScore),
          weight: COMPONENT_CONFIG.MacroEconomic.weight,
          description: COMPONENT_CONFIG.MacroEconomic.description,
          dataSources: macroSources,
          signalCount: macroSignalCount,
          rawData: macroRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 8. CAPEX MOMENTUM (Weight: 0.6)
        // Sources: job_postings, patent_filings, supply_chain_signals
        // ═══════════════════════════════════════════════════════════════════
        let capexScore = 50;
        let capexSignalCount = 0;
        const capexRawData: Record<string, number> = {};
        const capexSources: string[] = [];

        // Job postings
        if (jobPostings.length > 0) {
          capexSources.push('job_postings');
          dataSourcesUsed.push('Job Postings');
          capexSignalCount += jobPostings.length;

          const totalPostings = jobPostings.reduce((acc, j) => acc + (j.posting_count || 1), 0);
          const avgGrowth = jobPostings.reduce((acc, j) => acc + (j.growth_indicator || 0), 0) / jobPostings.length;
          
          if (avgGrowth > 0.1) capexScore += 12;
          else if (avgGrowth < -0.1) capexScore -= 8;
          capexRawData.job_postings = totalPostings;
          capexRawData.hiring_growth = avgGrowth;
        }

        // Patent filings
        if (patents.length > 0) {
          capexSources.push('patent_filings');
          dataSourcesUsed.push('Patent Filings');
          capexSignalCount += patents.length;

          capexScore += patents.length * 3; // Innovation signal
          capexRawData.recent_patents = patents.length;
        }

        // Supply chain signals
        if (supplyChain.length > 0) {
          capexSources.push('supply_chain_signals');
          dataSourcesUsed.push('Supply Chain');
          capexSignalCount += supplyChain.length;

          supplyChain.forEach(s => {
            const change = s.change_percentage || 0;
            if (change > 5) capexScore += 5;
            else if (change < -5) capexScore -= 5;
          });
        }

        // Capex signals
        const capexSignals = getSignalsByType('capex');
        capexSignals.forEach(s => {
          capexScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 8 : s.direction === 'down' ? -8 : 0);
        });
        capexSignalCount += capexSignals.length;
        if (capexSignals.length > 0) {
          capexSources.push('signals:capex');
        }

        capexScore = Math.max(0, Math.min(100, capexScore));
        components.push({
          key: 'CapexMomentum',
          value: Math.round(capexScore),
          weight: COMPONENT_CONFIG.CapexMomentum.weight,
          description: COMPONENT_CONFIG.CapexMomentum.description,
          dataSources: capexSources,
          signalCount: capexSignalCount,
          rawData: capexRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // 9. CRYPTO ON-CHAIN (Weight: 0.5) - Only for crypto assets
        // ═══════════════════════════════════════════════════════════════════
        if (assetClass === 'crypto') {
          let cryptoScore = 50;
          let cryptoSignalCount = 0;
          const cryptoRawData: Record<string, number> = {};
          const cryptoSources: string[] = [];

          if (cryptoOnchain.length > 0) {
            cryptoSources.push('crypto_onchain_metrics');
            dataSourcesUsed.push('Crypto On-chain');
            cryptoSignalCount += cryptoOnchain.length;

            const latest = cryptoOnchain[0];
            
            // Whale activity
            if (latest.whale_signal === 'accumulation') cryptoScore += 15;
            else if (latest.whale_signal === 'distribution') cryptoScore -= 15;

            // Exchange flows
            if (latest.exchange_flow_signal === 'bullish') cryptoScore += 10;
            else if (latest.exchange_flow_signal === 'bearish') cryptoScore -= 10;

            // Fear/greed
            const fg = latest.fear_greed_index || 50;
            if (fg < 25) cryptoScore += 10; // Extreme fear = buy signal
            else if (fg > 75) cryptoScore -= 8; // Extreme greed = caution
            cryptoRawData.fear_greed = fg;

            // Active addresses growth
            if (latest.active_addresses_change_pct && latest.active_addresses_change_pct > 5) {
              cryptoScore += 8;
            }
          }

          const cryptoSignals = getSignalsByType('crypto');
          cryptoSignals.forEach(s => {
            cryptoScore += (s.magnitude || 0.5) * (s.direction === 'up' ? 8 : s.direction === 'down' ? -8 : 0);
          });
          cryptoSignalCount += cryptoSignals.length;
          if (cryptoSignals.length > 0) {
            cryptoSources.push('signals:crypto');
          }

          cryptoScore = Math.max(0, Math.min(100, cryptoScore));
          components.push({
            key: 'CryptoOnchain',
            value: Math.round(cryptoScore),
            weight: COMPONENT_CONFIG.CryptoOnchain.weight,
            description: COMPONENT_CONFIG.CryptoOnchain.description,
            dataSources: cryptoSources,
            signalCount: cryptoSignalCount,
            rawData: cryptoRawData
          });
        }

        // ═══════════════════════════════════════════════════════════════════
        // 10. EARNINGS MOMENTUM (Weight: 0.5)
        // ═══════════════════════════════════════════════════════════════════
        let earningsScore = 50;
        let earningsSignalCount = 0;
        const earningsRawData: Record<string, number> = {};
        const earningsSources: string[] = [];

        if (earningsSentiment.length > 0) {
          earningsSources.push('earnings_sentiment');
          dataSourcesUsed.push('Earnings Data');
          earningsSignalCount += earningsSentiment.length;

          earningsSentiment.forEach(e => {
            const surprise = e.earnings_surprise || 0;
            const revSurprise = e.revenue_surprise || 0;
            
            earningsScore += surprise * 20; // Big beats matter
            earningsScore += revSurprise * 10;
          });

          const avgSurprise = earningsSentiment.reduce((acc, e) => acc + (e.earnings_surprise || 0), 0) / earningsSentiment.length;
          earningsRawData.avg_eps_surprise = avgSurprise;
        }

        earningsScore = Math.max(0, Math.min(100, earningsScore));
        components.push({
          key: 'EarningsMomentum',
          value: Math.round(earningsScore),
          weight: COMPONENT_CONFIG.EarningsMomentum.weight,
          description: COMPONENT_CONFIG.EarningsMomentum.description,
          dataSources: earningsSources,
          signalCount: earningsSignalCount,
          rawData: earningsRawData
        });

        // ═══════════════════════════════════════════════════════════════════
        // FINAL SCORE CALCULATION
        // ═══════════════════════════════════════════════════════════════════
        let totalWeight = 0;
        let weightedSum = 0;
        
        // Only include components that have data
        components.forEach(c => {
          if (c.signalCount > 0 || c.dataSources.length > 0) {
            weightedSum += c.value * c.weight;
            totalWeight += c.weight;
            totalSignalCount += c.signalCount;
          }
        });

        const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

        // Calculate 24h change
        const recentSignals = signals.filter(s => new Date(s.observed_at) > new Date(oneDayAgo));
        const olderSignals = signals.filter(s => {
          const date = new Date(s.observed_at);
          return date <= new Date(oneDayAgo) && date > new Date(Date.now() - 48 * 60 * 60 * 1000);
        });

        let scoreChange = 0;
        if (recentSignals.length > 0 && olderSignals.length > 0) {
          const recentAvg = recentSignals.reduce((acc, s) => acc + (s.magnitude || 0), 0) / recentSignals.length;
          const olderAvg = olderSignals.reduce((acc, s) => acc + (s.magnitude || 0), 0) / olderSignals.length;
          scoreChange = Math.round((recentAvg - olderAvg) * 15 * 10) / 10;
        }

        setResult({
          score: finalScore,
          scoreChange,
          componentScores: components.filter(c => c.signalCount > 0 || c.dataSources.length > 0),
          totalSignals: totalSignalCount,
          dataSourcesUsed: [...new Set(dataSourcesUsed)],
          loading: false,
          error: null
        });

      } catch (error) {
        console.error('Error calculating asset score:', error);
        setResult(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to calculate score'
        }));
      }
    };

    fetchAllData();
  }, [ticker, assetId, assetClass]);

  return result;
}
