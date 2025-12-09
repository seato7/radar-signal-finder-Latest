import { supabase } from "@/integrations/supabase/client";

/**
 * Compute a quick score for an asset based on available data.
 * This is a simplified version for listing pages - for full breakdown, use useAssetScore hook.
 */
export async function computeAssetScoresBatch(
  assets: Array<{ id: string; ticker: string; asset_class: string | null }>
): Promise<Map<string, number>> {
  const scoreMap = new Map<string, number>();
  const tickers = assets.map(a => a.ticker);
  const assetIds = assets.map(a => a.id);

  // Fetch key data sources in parallel for all tickers
  const [
    advancedTechnicalsResult,
    darkPoolResult,
    signalsResult,
    patternRecognitionResult
  ] = await Promise.all([
    // Advanced technicals (most recent per ticker)
    supabase
      .from('advanced_technicals')
      .select('ticker, stochastic_signal, trend_strength, breakout_signal, adx')
      .in('ticker', tickers)
      .order('timestamp', { ascending: false }),

    // Dark pool activity
    supabase
      .from('dark_pool_activity')
      .select('ticker, signal_strength, signal_type')
      .in('ticker', tickers)
      .order('trade_date', { ascending: false }),

    // Signals
    supabase
      .from('signals')
      .select('asset_id, signal_type, magnitude, direction')
      .in('asset_id', assetIds)
      .gte('observed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('observed_at', { ascending: false })
      .limit(2000),

    // Pattern recognition
    supabase
      .from('pattern_recognition')
      .select('ticker, pattern_type, confidence_score, pattern_category')
      .in('ticker', tickers)
      .gte('detected_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('detected_at', { ascending: false })
  ]);

  // Create lookup maps
  const technicalsMap = new Map<string, any>();
  (advancedTechnicalsResult.data || []).forEach(t => {
    if (!technicalsMap.has(t.ticker)) {
      technicalsMap.set(t.ticker, t);
    }
  });

  const darkPoolMap = new Map<string, any[]>();
  (darkPoolResult.data || []).forEach(d => {
    if (!darkPoolMap.has(d.ticker)) {
      darkPoolMap.set(d.ticker, []);
    }
    darkPoolMap.get(d.ticker)!.push(d);
  });

  const signalsMap = new Map<string, any[]>();
  (signalsResult.data || []).forEach(s => {
    if (!signalsMap.has(s.asset_id)) {
      signalsMap.set(s.asset_id, []);
    }
    signalsMap.get(s.asset_id)!.push(s);
  });

  const patternsMap = new Map<string, any[]>();
  (patternRecognitionResult.data || []).forEach(p => {
    if (!patternsMap.has(p.ticker)) {
      patternsMap.set(p.ticker, []);
    }
    patternsMap.get(p.ticker)!.push(p);
  });

  // Calculate score for each asset
  for (const asset of assets) {
    let score = 50; // Base score

    // Technical signals (weight: 1.0)
    const tech = technicalsMap.get(asset.ticker);
    if (tech) {
      if (tech.stochastic_signal === 'oversold') score += 10;
      else if (tech.stochastic_signal === 'overbought') score -= 5;

      if (tech.trend_strength === 'strong_up') score += 8;
      else if (tech.trend_strength === 'strong_down') score -= 8;

      if (tech.breakout_signal === 'bullish') score += 6;
      else if (tech.breakout_signal === 'bearish') score -= 6;

      if (tech.adx && tech.adx > 25) score += 3;
    }

    // Dark pool signals (weight: 1.0)
    const darkPool = darkPoolMap.get(asset.ticker) || [];
    darkPool.slice(0, 5).forEach(dp => {
      if (dp.signal_strength === 'strong' && dp.signal_type === 'accumulation') score += 5;
      else if (dp.signal_strength === 'strong' && dp.signal_type === 'distribution') score -= 5;
      else if (dp.signal_type === 'accumulation') score += 2;
      else if (dp.signal_type === 'distribution') score -= 2;
    });

    // Pattern recognition (weight: 0.8)
    const patterns = patternsMap.get(asset.ticker) || [];
    patterns.slice(0, 3).forEach(p => {
      const confidence = p.confidence_score || 0.5;
      // Use pattern_category to determine direction
      const isBullish = p.pattern_category?.toLowerCase().includes('reversal') || 
                        p.pattern_type?.toLowerCase().includes('bullish') ||
                        p.pattern_type?.toLowerCase().includes('ascending');
      const isBearish = p.pattern_type?.toLowerCase().includes('bearish') ||
                        p.pattern_type?.toLowerCase().includes('descending') ||
                        p.pattern_type?.toLowerCase().includes('head_and_shoulders');
      if (isBullish) score += 4 * confidence;
      else if (isBearish) score -= 4 * confidence;
    });

    // Signals from ingestion (weight varies by type)
    const signals = signalsMap.get(asset.id) || [];
    signals.slice(0, 20).forEach(s => {
      const magnitude = s.magnitude || 0.5;
      const direction = s.direction === 'up' ? 1 : s.direction === 'down' ? -1 : 0;
      
      // Different weights for different signal types
      if (s.signal_type?.includes('flow') || s.signal_type?.includes('13f')) {
        score += direction * magnitude * 3;
      } else if (s.signal_type?.includes('insider') || s.signal_type?.includes('form4')) {
        score += direction * magnitude * 2.5;
      } else if (s.signal_type?.includes('sentiment')) {
        score += direction * magnitude * 2;
      } else {
        score += direction * magnitude * 1.5;
      }
    });

    // Normalize to 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));
    scoreMap.set(asset.id, score);
  }

  return scoreMap;
}
