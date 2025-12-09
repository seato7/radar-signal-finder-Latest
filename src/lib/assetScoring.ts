import { supabase } from "@/integrations/supabase/client";

/**
 * Compute scores for a batch of assets using the same logic as useAssetScore hook.
 * This ensures consistency between listing pages and detail pages.
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

  try {
    // Fetch key data sources in parallel for all tickers
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
      cryptoOnchainResult
    ] = await Promise.all([
      // Advanced technicals (most recent per ticker)
      supabase
        .from('advanced_technicals')
        .select('ticker, stochastic_signal, trend_strength, breakout_signal, adx, price_vs_vwap_pct')
        .in('ticker', tickers)
        .order('timestamp', { ascending: false }),

      // Prices for momentum
      supabase
        .from('prices')
        .select('ticker, close, date')
        .in('ticker', tickers)
        .order('date', { ascending: false }),

      // Dark pool activity
      supabase
        .from('dark_pool_activity')
        .select('ticker, signal_strength, signal_type')
        .in('ticker', tickers)
        .gte('trade_date', thirtyDaysAgo)
        .order('trade_date', { ascending: false }),

      // Signals
      supabase
        .from('signals')
        .select('asset_id, signal_type, magnitude, direction')
        .in('asset_id', assetIds)
        .gte('observed_at', thirtyDaysAgo)
        .order('observed_at', { ascending: false })
        .limit(2000),

      // Pattern recognition
      supabase
        .from('pattern_recognition')
        .select('ticker, pattern_type, confidence_score, pattern_category')
        .in('ticker', tickers)
        .gte('detected_at', thirtyDaysAgo)
        .order('detected_at', { ascending: false }),

      // News sentiment
      supabase
        .from('news_sentiment_aggregate')
        .select('ticker, sentiment_score, sentiment_label')
        .in('ticker', tickers)
        .gte('date', sevenDaysAgo)
        .order('date', { ascending: false }),

      // Options flow
      supabase
        .from('options_flow')
        .select('ticker, sentiment, flow_type')
        .in('ticker', tickers)
        .gte('trade_date', thirtyDaysAgo)
        .order('trade_date', { ascending: false }),

      // Congressional trades
      supabase
        .from('congressional_trades')
        .select('ticker, transaction_type, amount_min')
        .in('ticker', tickers)
        .gte('transaction_date', ninetyDaysAgo)
        .order('transaction_date', { ascending: false }),

      // Smart money flow
      supabase
        .from('smart_money_flow')
        .select('ticker, smart_money_signal, institutional_net_flow, smart_money_index')
        .in('ticker', tickers)
        .gte('timestamp', thirtyDaysAgo)
        .order('timestamp', { ascending: false }),

      // Crypto onchain
      supabase
        .from('crypto_onchain_metrics')
        .select('ticker, whale_signal, exchange_flow_signal, fear_greed_index')
        .in('ticker', tickers)
        .order('timestamp', { ascending: false })
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

    // Calculate score for each asset using same component weights as useAssetScore
    for (const asset of assets) {
      let totalWeightedScore = 0;
      let totalWeight = 0;

      // ═══════════════════════════════════════════════════════════════════
      // 1. TECHNICAL STRENGTH (Weight: 1.0)
      // ═══════════════════════════════════════════════════════════════════
      let technicalScore = 50;
      const tech = technicalsMap.get(asset.ticker);
      if (tech) {
        if (tech.stochastic_signal === 'oversold') technicalScore += 15;
        else if (tech.stochastic_signal === 'overbought') technicalScore -= 10;

        if (tech.trend_strength === 'strong_up') technicalScore += 12;
        else if (tech.trend_strength === 'strong_down') technicalScore -= 12;

        if (tech.breakout_signal === 'bullish') technicalScore += 10;
        else if (tech.breakout_signal === 'bearish') technicalScore -= 10;

        if (tech.adx && tech.adx > 25) technicalScore += 5;

        if (tech.price_vs_vwap_pct) {
          if (tech.price_vs_vwap_pct > 2) technicalScore += 5;
          else if (tech.price_vs_vwap_pct < -2) technicalScore -= 5;
        }
      }

      // Price momentum
      const prices = pricesMap.get(asset.ticker) || [];
      if (prices.length >= 2) {
        const priceChange = ((prices[0] - prices[prices.length - 1]) / prices[prices.length - 1]) * 100;
        if (priceChange > 5) technicalScore += 8;
        else if (priceChange < -5) technicalScore -= 8;
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
      // 3. SENTIMENT (Weight: 0.8)
      // ═══════════════════════════════════════════════════════════════════
      let sentimentScore = 50;
      const news = newsMap.get(asset.ticker);
      if (news) {
        if (news.sentiment_score !== null) {
          // sentiment_score is typically -1 to 1, normalize to 0-100
          sentimentScore = 50 + (news.sentiment_score * 50);
        } else if (news.sentiment_label) {
          if (news.sentiment_label === 'bullish' || news.sentiment_label === 'positive') sentimentScore = 70;
          else if (news.sentiment_label === 'bearish' || news.sentiment_label === 'negative') sentimentScore = 30;
        }
        sentimentScore = Math.max(0, Math.min(100, sentimentScore));
        totalWeightedScore += sentimentScore * 0.8;
        totalWeight += 0.8;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 4. INSTITUTIONAL FLOW (Weight: 1.0)
      // ═══════════════════════════════════════════════════════════════════
      let flowScore = 50;
      const darkPool = darkPoolMap.get(asset.ticker) || [];
      darkPool.slice(0, 5).forEach(dp => {
        if (dp.signal_strength === 'strong' && dp.signal_type === 'accumulation') flowScore += 8;
        else if (dp.signal_strength === 'strong' && dp.signal_type === 'distribution') flowScore -= 8;
        else if (dp.signal_type === 'accumulation') flowScore += 4;
        else if (dp.signal_type === 'distribution') flowScore -= 4;
      });

      const smartMoney = smartMoneyMap.get(asset.ticker);
      if (smartMoney) {
        // Use smart_money_signal and institutional_net_flow
        if (smartMoney.smart_money_signal === 'bullish' || smartMoney.institutional_net_flow > 0) {
          flowScore += 10;
        } else if (smartMoney.smart_money_signal === 'bearish' || smartMoney.institutional_net_flow < 0) {
          flowScore -= 10;
        }
      }

      flowScore = Math.max(0, Math.min(100, flowScore));
      if (darkPool.length > 0 || smartMoney) {
        totalWeightedScore += flowScore * 1.0;
        totalWeight += 1.0;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 5. INSIDER ACTIVITY (Weight: 0.8)
      // ═══════════════════════════════════════════════════════════════════
      let insiderScore = 50;
      const congress = congressMap.get(asset.ticker) || [];
      congress.forEach(c => {
        const amount = c.amount_min || 0;
        const weight = amount > 100000 ? 2 : 1;
        if (c.transaction_type === 'purchase' || c.transaction_type === 'buy') {
          insiderScore += 8 * weight;
        } else if (c.transaction_type === 'sale' || c.transaction_type === 'sell') {
          insiderScore -= 5 * weight;
        }
      });
      insiderScore = Math.max(0, Math.min(100, insiderScore));
      if (congress.length > 0) {
        totalWeightedScore += insiderScore * 0.8;
        totalWeight += 0.8;
      }

      // ═══════════════════════════════════════════════════════════════════
      // 6. OPTIONS FLOW (Weight: 0.7)
      // ═══════════════════════════════════════════════════════════════════
      let optionsScore = 50;
      const options = optionsMap.get(asset.ticker) || [];
      options.slice(0, 10).forEach(o => {
        if (o.sentiment === 'bullish' || o.flow_type === 'unusual_call') optionsScore += 4;
        else if (o.sentiment === 'bearish' || o.flow_type === 'unusual_put') optionsScore -= 4;
      });
      optionsScore = Math.max(0, Math.min(100, optionsScore));
      if (options.length > 0) {
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
