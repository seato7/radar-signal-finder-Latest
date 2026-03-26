import { supabase } from "@/integrations/supabase/client";

/**
 * Compute scores for a batch of assets using the same logic as useAssetScore hook.
 * This ensures consistency between listing pages and detail pages.
 * 
 * Uses all 22 data sources for comprehensive scoring.
 */
export async function computeAssetScoresBatch(
  assets: Array<{ id: string; ticker: string; asset_class: string | null }>
): Promise<Map<string, number>> {
  const scoreMap = new Map<string, number>();
  
  if (assets.length === 0) {
    return scoreMap;
  }

  const tickers = assets.map(a => a.ticker);
  const assetIds = assets.map(a => a.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Check if we have any forex assets for conditional queries
  const hasForexAssets = assets.some(a => a.asset_class === 'forex');

  try {
    // Fetch all 22 data sources in parallel for all tickers
    const [
      advancedTechnicalsResult,
      pricesResult,
      darkPoolResult,
      signalsResult,
      patternRecognitionResult,
      newsSentimentResult,
      optionsFlowResult,
      congressionalResult,
      smartMoneyResult,
      cryptoOnchainResult,
      // NEW: 12 additional data sources
      shortInterestResult,
      earningsSentimentResult,
      jobPostingsResult,
      patentFilingsResult,
      supplyChainResult,
      cotReportsResult,
      economicIndicatorsResult,
      etfFlowsResult,
      breakingNewsResult,
      form4InsiderResult,
      forexSentimentResult,
      forexTechnicalsResult
    ] = await Promise.all([
      // 1. Advanced technicals (most recent per ticker)
      supabase
        .from('advanced_technicals')
        .select('ticker, stochastic_signal, trend_strength, breakout_signal, adx, price_vs_vwap_pct')
        .in('ticker', tickers)
        .order('timestamp', { ascending: false }),

      // 2. Prices for momentum
      supabase
        .from('prices')
        .select('ticker, close, date')
        .in('ticker', tickers)
        .order('date', { ascending: false }),

      // 3. Dark pool activity
      supabase
        .from('dark_pool_activity')
        .select('ticker, signal_strength, signal_type')
        .in('ticker', tickers)
        .gte('trade_date', thirtyDaysAgo)
        .order('trade_date', { ascending: false }),

      // 4. Signals
      supabase
        .from('signals')
        .select('asset_id, signal_type, magnitude, direction')
        .in('asset_id', assetIds)
        .gte('observed_at', thirtyDaysAgo)
        .order('observed_at', { ascending: false })
        .limit(2000),

      // 5. Pattern recognition
      supabase
        .from('pattern_recognition')
        .select('ticker, pattern_type, confidence_score, pattern_category')
        .in('ticker', tickers)
        .gte('detected_at', thirtyDaysAgo)
        .order('detected_at', { ascending: false }),

      // 6. News sentiment
      supabase
        .from('news_sentiment_aggregate')
        .select('ticker, sentiment_score, sentiment_label, buzz_score')
        .in('ticker', tickers)
        .gte('date', sevenDaysAgo)
        .order('date', { ascending: false }),

      // 7. Options flow
      supabase
        .from('options_flow')
        .select('ticker, sentiment, flow_type, volume, premium')
        .in('ticker', tickers)
        .gte('trade_date', thirtyDaysAgo)
        .order('trade_date', { ascending: false }),

      // 8. Congressional trades
      supabase
        .from('congressional_trades')
        .select('ticker, transaction_type, amount_min')
        .in('ticker', tickers)
        .gte('transaction_date', ninetyDaysAgo)
        .order('transaction_date', { ascending: false }),

      // 9. Smart money flow
      supabase
        .from('smart_money_flow')
        .select('ticker, smart_money_signal, institutional_net_flow, smart_money_index')
        .in('ticker', tickers)
        .gte('timestamp', thirtyDaysAgo)
        .order('timestamp', { ascending: false }),

      // 10. Crypto onchain
      supabase
        .from('crypto_onchain_metrics')
        .select('ticker, whale_signal, exchange_flow_signal, fear_greed_index')
        .in('ticker', tickers)
        .order('timestamp', { ascending: false }),

      // ═══════════════════════════════════════════════════════════════════
      // NEW DATA SOURCES (11-22)
      // ═══════════════════════════════════════════════════════════════════

      // 11. Short interest
      supabase
        .from('short_interest')
        .select('ticker, float_percentage, days_to_cover, short_volume')
        .in('ticker', tickers)
        .gte('report_date', ninetyDaysAgo)
        .order('report_date', { ascending: false }),

      // 12. Earnings sentiment
      supabase
        .from('earnings_sentiment')
        .select('ticker, earnings_surprise, revenue_surprise, sentiment_score')
        .in('ticker', tickers)
        .order('earnings_date', { ascending: false }),

      // 13. Job postings
      supabase
        .from('job_postings')
        .select('ticker, posting_count, growth_indicator')
        .in('ticker', tickers)
        .gte('posted_date', ninetyDaysAgo)
        .order('posted_date', { ascending: false }),

      // 14. Patent filings
      supabase
        .from('patent_filings')
        .select('ticker, technology_category')
        .in('ticker', tickers)
        .gte('filing_date', ninetyDaysAgo),

      // 15. Supply chain signals
      supabase
        .from('supply_chain_signals')
        .select('ticker, change_percentage, indicator, signal_type')
        .in('ticker', tickers)
        .gte('report_date', ninetyDaysAgo)
        .order('report_date', { ascending: false }),

      // 16. COT reports
      supabase
        .from('cot_reports')
        .select('ticker, sentiment, commercial_net, noncommercial_net')
        .in('ticker', tickers)
        .gte('report_date', ninetyDaysAgo)
        .order('report_date', { ascending: false }),

      // 17. Economic indicators (global, not per-ticker)
      supabase
        .from('economic_indicators')
        .select('indicator_type, value, previous_value, impact, country')
        .gte('release_date', thirtyDaysAgo)
        .order('release_date', { ascending: false })
        .limit(100),

      // 18. ETF flows
      supabase
        .from('etf_flows')
        .select('ticker, net_flow, inflow, outflow')
        .in('ticker', tickers)
        .gte('flow_date', thirtyDaysAgo)
        .order('flow_date', { ascending: false }),

      // 19. Breaking news
      supabase
        .from('breaking_news')
        .select('ticker, sentiment_score, relevance_score')
        .in('ticker', tickers)
        .gte('published_at', sevenDaysAgo)
        .order('published_at', { ascending: false }),

      // 20. Form 4 insider trades
      supabase
        .from('form4_insider_trades')
        .select('ticker, transaction_type, total_value, shares')
        .in('ticker', tickers)
        .gte('filing_date', ninetyDaysAgo)
        .order('filing_date', { ascending: false }),

      // 21. Forex sentiment (conditional)
      hasForexAssets ? supabase
        .from('forex_sentiment')
        .select('ticker, retail_sentiment, news_sentiment_score, social_sentiment_score')
        .in('ticker', tickers)
        .order('timestamp', { ascending: false })
        : Promise.resolve({ data: [] }),

      // 22. Forex technicals (conditional)
      hasForexAssets ? supabase
        .from('forex_technicals')
        .select('ticker, rsi_signal, macd_crossover, ma_crossover')
        .in('ticker', tickers)
        .order('timestamp', { ascending: false })
        : Promise.resolve({ data: [] })
    ]);

    // Create lookup maps for each data type - keep only first (most recent) per ticker
    const technicalsMap = new Map<string, any>();
    (advancedTechnicalsResult.data || []).forEach(t => {
      if (!technicalsMap.has(t.ticker)) {
        technicalsMap.set(t.ticker, t);
      }
    });

    // Price momentum map: ticker -> array of last N prices
    const pricesMap = new Map<string, number[]>();
    (pricesResult.data || []).forEach(p => {
      const prices = pricesMap.get(p.ticker) || [];
      if (prices.length < 10) {
        prices.push(p.close);
        pricesMap.set(p.ticker, prices);
      }
    });

    const darkPoolMap = new Map<string, any[]>();
    (darkPoolResult.data || []).forEach(d => {
      if (!darkPoolMap.has(d.ticker)) {
        darkPoolMap.set(d.ticker, []);
      }
      if (darkPoolMap.get(d.ticker)!.length < 10) {
        darkPoolMap.get(d.ticker)!.push(d);
      }
    });

    const signalsMap = new Map<string, any[]>();
    (signalsResult.data || []).forEach(s => {
      if (!signalsMap.has(s.asset_id)) {
        signalsMap.set(s.asset_id, []);
      }
      if (signalsMap.get(s.asset_id)!.length < 50) {
        signalsMap.get(s.asset_id)!.push(s);
      }
    });

    const patternsMap = new Map<string, any[]>();
    (patternRecognitionResult.data || []).forEach(p => {
      if (!patternsMap.has(p.ticker)) {
        patternsMap.set(p.ticker, []);
      }
      if (patternsMap.get(p.ticker)!.length < 5) {
        patternsMap.get(p.ticker)!.push(p);
      }
    });

    const newsMap = new Map<string, any>();
    (newsSentimentResult.data || []).forEach(n => {
      if (!newsMap.has(n.ticker)) {
        newsMap.set(n.ticker, n);
      }
    });

    const optionsMap = new Map<string, any[]>();
    (optionsFlowResult.data || []).forEach(o => {
      if (!optionsMap.has(o.ticker)) {
        optionsMap.set(o.ticker, []);
      }
      if (optionsMap.get(o.ticker)!.length < 10) {
        optionsMap.get(o.ticker)!.push(o);
      }
    });

    const congressMap = new Map<string, any[]>();
    (congressionalResult.data || []).forEach(c => {
      if (!congressMap.has(c.ticker)) {
        congressMap.set(c.ticker, []);
      }
      if (congressMap.get(c.ticker)!.length < 5) {
        congressMap.get(c.ticker)!.push(c);
      }
    });

    const smartMoneyMap = new Map<string, any>();
    (smartMoneyResult.data || []).forEach(s => {
      if (!smartMoneyMap.has(s.ticker)) {
        smartMoneyMap.set(s.ticker, s);
      }
    });

    const cryptoMap = new Map<string, any>();
    (cryptoOnchainResult.data || []).forEach(c => {
      if (!cryptoMap.has(c.ticker)) {
        cryptoMap.set(c.ticker, c);
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // NEW DATA SOURCE MAPS
    // ═══════════════════════════════════════════════════════════════════

    const shortInterestMap = new Map<string, any>();
    (shortInterestResult.data || []).forEach(s => {
      if (!shortInterestMap.has(s.ticker)) {
        shortInterestMap.set(s.ticker, s);
      }
    });

    const earningsMap = new Map<string, any>();
    (earningsSentimentResult.data || []).forEach(e => {
      if (!earningsMap.has(e.ticker)) {
        earningsMap.set(e.ticker, e);
      }
    });

    const jobPostingsMap = new Map<string, any[]>();
    (jobPostingsResult.data || []).forEach(j => {
      if (!jobPostingsMap.has(j.ticker)) {
        jobPostingsMap.set(j.ticker, []);
      }
      if (jobPostingsMap.get(j.ticker)!.length < 10) {
        jobPostingsMap.get(j.ticker)!.push(j);
      }
    });

    const patentsMap = new Map<string, number>();
    (patentFilingsResult.data || []).forEach(p => {
      patentsMap.set(p.ticker, (patentsMap.get(p.ticker) || 0) + 1);
    });

    const supplyChainMap = new Map<string, any[]>();
    (supplyChainResult.data || []).forEach(s => {
      if (!supplyChainMap.has(s.ticker)) {
        supplyChainMap.set(s.ticker, []);
      }
      if (supplyChainMap.get(s.ticker)!.length < 5) {
        supplyChainMap.get(s.ticker)!.push(s);
      }
    });

    const cotMap = new Map<string, any>();
    (cotReportsResult.data || []).forEach(c => {
      if (!cotMap.has(c.ticker)) {
        cotMap.set(c.ticker, c);
      }
    });

    // Economic indicators are global, not per-ticker
    const economicData = economicIndicatorsResult.data || [];

    const etfFlowsMap = new Map<string, any[]>();
    (etfFlowsResult.data || []).forEach(e => {
      if (!etfFlowsMap.has(e.ticker)) {
        etfFlowsMap.set(e.ticker, []);
      }
      if (etfFlowsMap.get(e.ticker)!.length < 5) {
        etfFlowsMap.get(e.ticker)!.push(e);
      }
    });

    const breakingNewsMap = new Map<string, any[]>();
    (breakingNewsResult.data || []).forEach(b => {
      if (!breakingNewsMap.has(b.ticker)) {
        breakingNewsMap.set(b.ticker, []);
      }
      if (breakingNewsMap.get(b.ticker)!.length < 5) {
        breakingNewsMap.get(b.ticker)!.push(b);
      }
    });

    const form4Map = new Map<string, any[]>();
    (form4InsiderResult.data || []).forEach(f => {
      if (!form4Map.has(f.ticker)) {
        form4Map.set(f.ticker, []);
      }
      if (form4Map.get(f.ticker)!.length < 10) {
        form4Map.get(f.ticker)!.push(f);
      }
    });

    const forexSentimentMap = new Map<string, any>();
    ((forexSentimentResult as any).data || []).forEach((f: any) => {
      if (!forexSentimentMap.has(f.ticker)) {
        forexSentimentMap.set(f.ticker, f);
      }
    });

    const forexTechnicalsMap = new Map<string, any>();
    ((forexTechnicalsResult as any).data || []).forEach((f: any) => {
      if (!forexTechnicalsMap.has(f.ticker)) {
        forexTechnicalsMap.set(f.ticker, f);
      }
    });

    // Calculate score for each asset using all component weights
    for (const asset of assets) {
      let totalWeightedScore = 0;
      let totalWeight = 0;

      // ═══════════════════════════════════════════════════════════════════
      // 1. TECHNICAL STRENGTH (Weight: 1.0)
      // ═══════════════════════════════════════════════════════════════════
      let technicalScore = 50;
      const tech = technicalsMap.get(asset.ticker);
      if (tech) {
        // Stochastic signals - normalize case for comparison
        const stochSignal = (tech.stochastic_signal || '').toLowerCase();
        if (stochSignal === 'oversold') technicalScore += 15;
        else if (stochSignal === 'overbought') technicalScore -= 10;

        // Trend strength - check for various naming patterns
        const trend = (tech.trend_strength || '').toLowerCase();
        if (trend.includes('strong') && trend.includes('up')) technicalScore += 12;
        else if (trend.includes('strong') && trend.includes('down')) technicalScore -= 12;
        else if (trend.includes('weak') && trend.includes('up')) technicalScore += 5;
        else if (trend.includes('weak') && trend.includes('down')) technicalScore -= 5;

        // Breakout signals
        const breakout = (tech.breakout_signal || '').toLowerCase();
        if (breakout === 'bullish' || breakout.includes('bull')) technicalScore += 10;
        else if (breakout === 'bearish' || breakout.includes('bear')) technicalScore -= 10;

        // ADX above 25 indicates strong trend
        if (tech.adx && Number(tech.adx) > 25) technicalScore += 5;

        // VWAP position
        if (tech.price_vs_vwap_pct) {
          const vwapPct = Number(tech.price_vs_vwap_pct);
          if (vwapPct > 2) technicalScore += 5;
          else if (vwapPct < -2) technicalScore -= 5;
        }
      }

      // Price momentum
      const prices = pricesMap.get(asset.ticker) || [];
      if (prices.length >= 2) {
        const oldPrice = prices[prices.length - 1];
        if (oldPrice !== 0) {
          const priceChange = ((prices[0] - oldPrice) / oldPrice) * 100;
          if (priceChange > 5) technicalScore += 8;
          else if (priceChange < -5) technicalScore -= 8;
        }
      }

      technicalScore = Math.max(0, Math.min(100, technicalScore));
      totalWeightedScore += technicalScore * 1.0;
      totalWeight += 1.0;

      // ═══════════════════════════════════════════════════════════════════
      // 2. PATTERN RECOGNITION (Weight: 0.8)
      // ═══════════════════════════════════════════════════════════════════
      let patternScore = 50;
      const patterns = patternsMap.get(asset.ticker) || [];
      patterns.slice(0, 3).forEach(p => {
        const confidence = p.confidence_score || 0.5;
        const isBullish = p.pattern_category?.toLowerCase().includes('reversal') || 
                          p.pattern_type?.toLowerCase().includes('bullish') ||
                          p.pattern_type?.toLowerCase().includes('ascending');
        const isBearish = p.pattern_type?.toLowerCase().includes('bearish') ||
                          p.pattern_type?.toLowerCase().includes('descending') ||
                          p.pattern_type?.toLowerCase().includes('head_and_shoulders');
        if (isBullish) patternScore += 10 * confidence;
        else if (isBearish) patternScore -= 10 * confidence;
      });
      patternScore = Math.max(0, Math.min(100, patternScore));
      if (patterns.length > 0) {
        totalWeightedScore += patternScore * 0.8;
        totalWeight += 0.8;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 3. SENTIMENT (Weight: 0.8) - Enhanced with breaking news & search trends
      // ═══════════════════════════════════════════════════════════════════
      let sentimentScore = 50;
      let hasSentimentData = false;

      const news = newsMap.get(asset.ticker);
      if (news) {
        hasSentimentData = true;
        if (news.sentiment_score !== null) {
          // sentiment_score is typically -1 to 1, normalize to 0-100
          sentimentScore = 50 + (news.sentiment_score * 50);
        } else if (news.sentiment_label) {
          if (news.sentiment_label === 'bullish' || news.sentiment_label === 'positive') sentimentScore = 70;
          else if (news.sentiment_label === 'bearish' || news.sentiment_label === 'negative') sentimentScore = 30;
        }
        // Buzz score adds confidence
        if (news.buzz_score && news.buzz_score > 5) sentimentScore += 5;
      }

      // Add breaking news to sentiment
      const breakingNews = breakingNewsMap.get(asset.ticker) || [];
      breakingNews.slice(0, 3).forEach(bn => {
        if (bn.sentiment_score !== null) {
          hasSentimentData = true;
          sentimentScore += bn.sentiment_score * 5; // Breaking news has immediate impact
        }
      });

      sentimentScore = Math.max(0, Math.min(100, sentimentScore));
      if (hasSentimentData) {
        totalWeightedScore += sentimentScore * 0.8;
        totalWeight += 0.8;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 4. INSTITUTIONAL FLOW (Weight: 1.0) - Enhanced with ETF flows
      // ═══════════════════════════════════════════════════════════════════
      let flowScore = 50;
      let hasFlowData = false;

      const darkPool = darkPoolMap.get(asset.ticker) || [];
      darkPool.slice(0, 5).forEach(dp => {
        hasFlowData = true;
        if (dp.signal_strength === 'strong' && dp.signal_type === 'accumulation') flowScore += 8;
        else if (dp.signal_strength === 'strong' && dp.signal_type === 'distribution') flowScore -= 8;
        else if (dp.signal_type === 'accumulation') flowScore += 4;
        else if (dp.signal_type === 'distribution') flowScore -= 4;
      });

      const smartMoney = smartMoneyMap.get(asset.ticker);
      if (smartMoney) {
        hasFlowData = true;
        if (smartMoney.smart_money_signal === 'bullish' || smartMoney.institutional_net_flow > 0) {
          flowScore += 10;
        } else if (smartMoney.smart_money_signal === 'bearish' || smartMoney.institutional_net_flow < 0) {
          flowScore -= 10;
        }
      }

      // Add ETF flows for ETFs
      const etfFlows = etfFlowsMap.get(asset.ticker) || [];
      etfFlows.slice(0, 3).forEach(ef => {
        hasFlowData = true;
        if (ef.net_flow > 0) flowScore += 5;
        else if (ef.net_flow < 0) flowScore -= 5;
      });

      flowScore = Math.max(0, Math.min(100, flowScore));
      if (hasFlowData) {
        totalWeightedScore += flowScore * 1.0;
        totalWeight += 1.0;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 5. INSIDER ACTIVITY (Weight: 0.8) - Enhanced with Form 4 trades
      // ═══════════════════════════════════════════════════════════════════
      let insiderScore = 50;
      let hasInsiderData = false;

      const congress = congressMap.get(asset.ticker) || [];
      congress.forEach(c => {
        hasInsiderData = true;
        const amount = c.amount_min || 0;
        const weight = amount > 100000 ? 2 : 1;
        if (c.transaction_type === 'purchase' || c.transaction_type === 'buy') {
          insiderScore += 8 * weight;
        } else if (c.transaction_type === 'sale' || c.transaction_type === 'sell') {
          insiderScore -= 5 * weight;
        }
      });

      // Add Form 4 insider trades
      const form4 = form4Map.get(asset.ticker) || [];
      form4.slice(0, 5).forEach(f => {
        hasInsiderData = true;
        const value = f.total_value || 0;
        const weight = value > 100000 ? 1.5 : 1;
        if (f.transaction_type === 'P' || f.transaction_type === 'A') { // Purchase or Award
          insiderScore += 6 * weight;
        } else if (f.transaction_type === 'S' || f.transaction_type === 'D') { // Sale or Disposition
          insiderScore -= 4 * weight;
        }
      });

      insiderScore = Math.max(0, Math.min(100, insiderScore));
      if (hasInsiderData) {
        totalWeightedScore += insiderScore * 0.8;
        totalWeight += 0.8;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 6. OPTIONS FLOW (Weight: 0.7) - Enhanced with short interest
      // ═══════════════════════════════════════════════════════════════════
      let optionsScore = 50;
      let hasOptionsData = false;

      const options = optionsMap.get(asset.ticker) || [];
      options.slice(0, 10).forEach(o => {
        hasOptionsData = true;
        if (o.sentiment === 'bullish' || o.flow_type === 'unusual_call') optionsScore += 4;
        else if (o.sentiment === 'bearish' || o.flow_type === 'unusual_put') optionsScore -= 4;
      });

      // Add short interest analysis
      const shortInterest = shortInterestMap.get(asset.ticker);
      if (shortInterest) {
        hasOptionsData = true;
        // High short interest can be contrarian bullish (short squeeze potential)
        const floatPct = shortInterest.float_percentage || 0;
        const dtc = shortInterest.days_to_cover || 0;
        if (floatPct > 20 && dtc > 3) {
          optionsScore += 8; // High short squeeze potential
        } else if (floatPct > 10) {
          optionsScore += 3; // Elevated short interest
        }
      }

      optionsScore = Math.max(0, Math.min(100, optionsScore));
      if (hasOptionsData) {
        totalWeightedScore += optionsScore * 0.7;
        totalWeight += 0.7;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 7. CRYPTO ON-CHAIN (Weight: 0.5, crypto only)
      // ═══════════════════════════════════════════════════════════════════
      if (asset.asset_class === 'crypto') {
        let cryptoScore = 50;
        const crypto = cryptoMap.get(asset.ticker);
        if (crypto) {
          if (crypto.whale_signal === 'accumulation') cryptoScore += 15;
          else if (crypto.whale_signal === 'distribution') cryptoScore -= 15;

          if (crypto.exchange_flow_signal === 'bullish') cryptoScore += 10;
          else if (crypto.exchange_flow_signal === 'bearish') cryptoScore -= 10;

          if (crypto.fear_greed_index !== null) {
            if (crypto.fear_greed_index < 25) cryptoScore += 10; // Extreme fear = buy
            else if (crypto.fear_greed_index > 75) cryptoScore -= 10; // Extreme greed = sell
          }

          cryptoScore = Math.max(0, Math.min(100, cryptoScore));
          totalWeightedScore += cryptoScore * 0.5;
          totalWeight += 0.5;
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // 8. MACRO ECONOMIC (Weight: 0.6) - COT + Economic Indicators
      // ═══════════════════════════════════════════════════════════════════
      let macroScore = 50;
      let hasMacroData = false;

      const cot = cotMap.get(asset.ticker);
      if (cot) {
        hasMacroData = true;
        if (cot.sentiment === 'bullish') macroScore += 12;
        else if (cot.sentiment === 'bearish') macroScore -= 12;
        
        // Commercial vs non-commercial positioning
        if (cot.commercial_net && cot.noncommercial_net) {
          if (cot.noncommercial_net > 0) macroScore += 5; // Specs are long
          else if (cot.noncommercial_net < 0) macroScore -= 5;
        }
      }

      // Economic indicators provide global macro context
      if (economicData.length > 0) {
        hasMacroData = true;
        const highImpactBullish = economicData.filter(e => 
          e.impact === 'high' && e.value > (e.previous_value || 0)
        ).length;
        const highImpactBearish = economicData.filter(e => 
          e.impact === 'high' && e.value < (e.previous_value || 0)
        ).length;
        macroScore += (highImpactBullish - highImpactBearish) * 2;
      }

      macroScore = Math.max(0, Math.min(100, macroScore));
      if (hasMacroData) {
        totalWeightedScore += macroScore * 0.6;
        totalWeight += 0.6;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 9. CAPEX MOMENTUM (Weight: 0.6) - Jobs + Patents + Supply Chain
      // ═══════════════════════════════════════════════════════════════════
      let capexScore = 50;
      let hasCapexData = false;

      const jobPostings = jobPostingsMap.get(asset.ticker) || [];
      if (jobPostings.length > 0) {
        hasCapexData = true;
        // More job postings = bullish growth signal
        const totalPostings = jobPostings.reduce((sum, j) => sum + (j.posting_count || 1), 0);
        if (totalPostings > 50) capexScore += 12;
        else if (totalPostings > 20) capexScore += 8;
        else if (totalPostings > 5) capexScore += 4;

        // Growth indicator
        const avgGrowth = jobPostings.reduce((sum, j) => sum + (j.growth_indicator || 0), 0) / jobPostings.length;
        if (avgGrowth > 0.1) capexScore += 5;
        else if (avgGrowth < -0.1) capexScore -= 5;
      }

      const patentCount = patentsMap.get(asset.ticker) || 0;
      if (patentCount > 0) {
        hasCapexData = true;
        if (patentCount > 10) capexScore += 10;
        else if (patentCount > 3) capexScore += 6;
        else capexScore += 3;
      }

      const supplyChain = supplyChainMap.get(asset.ticker) || [];
      supplyChain.forEach(sc => {
        hasCapexData = true;
        const change = sc.change_percentage || 0;
        if (change > 5) capexScore += 4;
        else if (change < -5) capexScore -= 4;
      });

      capexScore = Math.max(0, Math.min(100, capexScore));
      if (hasCapexData) {
        totalWeightedScore += capexScore * 0.6;
        totalWeight += 0.6;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 10. EARNINGS MOMENTUM (Weight: 0.5)
      // ═══════════════════════════════════════════════════════════════════
      let earningsScore = 50;
      const earnings = earningsMap.get(asset.ticker);
      if (earnings) {
        if (earnings.earnings_surprise !== null) {
          // Positive surprise = bullish
          if (earnings.earnings_surprise > 10) earningsScore += 15;
          else if (earnings.earnings_surprise > 0) earningsScore += 8;
          else if (earnings.earnings_surprise < -10) earningsScore -= 15;
          else if (earnings.earnings_surprise < 0) earningsScore -= 8;
        }

        if (earnings.revenue_surprise !== null) {
          if (earnings.revenue_surprise > 5) earningsScore += 8;
          else if (earnings.revenue_surprise > 0) earningsScore += 4;
          else if (earnings.revenue_surprise < -5) earningsScore -= 8;
          else if (earnings.revenue_surprise < 0) earningsScore -= 4;
        }

        earningsScore = Math.max(0, Math.min(100, earningsScore));
        totalWeightedScore += earningsScore * 0.5;
        totalWeight += 0.5;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 11. FOREX SPECIFIC (Weight: 0.6, forex only)
      // ═══════════════════════════════════════════════════════════════════
      if (asset.asset_class === 'forex') {
        let forexScore = 50;
        let hasForexData = false;

        const forexSent = forexSentimentMap.get(asset.ticker);
        if (forexSent) {
          hasForexData = true;
          if (forexSent.retail_sentiment === 'bullish') forexScore += 8;
          else if (forexSent.retail_sentiment === 'bearish') forexScore -= 8;

          if (forexSent.news_sentiment_score) {
            forexScore += forexSent.news_sentiment_score * 5;
          }
        }

        const forexTech = forexTechnicalsMap.get(asset.ticker);
        if (forexTech) {
          hasForexData = true;
          if (forexTech.rsi_signal === 'oversold') forexScore += 10;
          else if (forexTech.rsi_signal === 'overbought') forexScore -= 10;

          if (forexTech.macd_crossover === 'bullish') forexScore += 8;
          else if (forexTech.macd_crossover === 'bearish') forexScore -= 8;

          if (forexTech.ma_crossover === 'golden_cross') forexScore += 12;
          else if (forexTech.ma_crossover === 'death_cross') forexScore -= 12;
        }

        forexScore = Math.max(0, Math.min(100, forexScore));
        if (hasForexData) {
          totalWeightedScore += forexScore * 0.6;
          totalWeight += 0.6;
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // Process general signals from signals table
      // ═══════════════════════════════════════════════════════════════════
      const assetSignals = signalsMap.get(asset.id) || [];
      if (assetSignals.length > 0) {
        let signalScore = 50;
        assetSignals.slice(0, 20).forEach(s => {
          const magnitude = s.magnitude || 0.5;
          const direction = s.direction === 'up' ? 1 : s.direction === 'down' ? -1 : 0;
          signalScore += direction * magnitude * 3;
        });
        signalScore = Math.max(0, Math.min(100, signalScore));
        totalWeightedScore += signalScore * 0.5;
        totalWeight += 0.5;
      }

      // Calculate final weighted average score
      let finalScore: number;
      if (totalWeight > 0) {
        finalScore = Math.round(totalWeightedScore / totalWeight);
      } else {
        // No data available - return neutral score
        finalScore = 50;
      }

      scoreMap.set(asset.id, finalScore);
    }
  } catch (error) {
    console.error("Error computing batch scores:", error);
    // On error, set all to neutral 50
    assets.forEach(a => scoreMap.set(a.id, 50));
  }

  return scoreMap;
}
