import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process 4000 assets per invocation to stay within CPU limits
const ASSETS_PER_INVOCATION = 4000;
const BATCH_SIZE = 1000;

// Scoring weights aligned with backend/scoring.py v2.1 spec
const WEIGHTS = {
  BigMoneyConfirm: 1.5,
  FlowPressure: 1.4,
  InsiderPoliticianConfirm: 1.2,
  CapexMomentum: 1.0,
  PolicyMomentum: 0.8,
  TechEdge: 0.7,
  Attention: 0.6,
  MacroEconomic: 0.5,
  EarningsMomentum: 0.4,
  RiskFlags: -2.0,
};

// Maximum contribution per component (for normalization)
const MAX_COMPONENT_VALUE = 10;

// Asset-class-specific weight modifiers
const CLASS_MODIFIERS: Record<string, Record<string, number>> = {
  stock: {},
  etf: { FlowPressure: 1.5 },
  crypto: { BigMoneyConfirm: 2.0, TechEdge: 1.3 },
  forex: { PolicyMomentum: 1.5, MacroEconomic: 1.5 },
  commodity: { MacroEconomic: 2.0, PolicyMomentum: 1.3 },
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
      const { data: oldestScored } = await supabase
        .from('assets')
        .select('id')
        .order('score_computed_at', { ascending: true, nullsFirst: true })
        .limit(1);
      
      // Get the position of oldest scored asset to continue from there
      // For simplicity, just cycle through by offset stored in function_status
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

      // Fetch all data sources in parallel (simplified for performance)
      const [
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
      ] = await Promise.all([
        supabase.from('advanced_technicals').select('ticker, rsi_14, breakout_signal, trend_strength, stochastic_signal').in('ticker', tickers),
        supabase.from('dark_pool_activity').select('ticker, dark_pool_percentage').in('ticker', tickers),
        supabase.from('form4_insider_trades').select('ticker, transaction_type, total_value, filing_date').in('ticker', tickers).gte('filing_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        supabase.from('holdings_13f').select('ticker, change_shares, value').in('ticker', tickers),
        supabase.from('congressional_trades').select('ticker, transaction_type, transaction_date, amount_min, amount_max').in('ticker', tickers).gte('transaction_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        supabase.from('news_sentiment_aggregate').select('ticker, sentiment_score, buzz_score').in('ticker', tickers),
        supabase.from('options_flow').select('ticker, sentiment, premium').in('ticker', tickers),
        supabase.from('short_interest').select('ticker, float_percentage').in('ticker', tickers),
        supabase.from('earnings_sentiment').select('ticker, earnings_surprise').in('ticker', tickers),
        supabase.from('etf_flows').select('ticker, net_flow').in('ticker', tickers),
        supabase.from('crypto_onchain_metrics').select('ticker, whale_signal, exchange_flow_signal, fear_greed_index, mvrv_ratio').in('ticker', tickers),
        supabase.from('forex_sentiment').select('ticker, retail_sentiment, retail_long_pct').in('ticker', tickers),
        supabase.from('economic_indicators').select('impact').order('release_date', { ascending: false }).limit(50),
      ]);

      // Build lookup maps
      const techMap = new Map((technicals.data || []).map(t => [t.ticker, t]));
      const darkPoolMap = new Map<string, number[]>();
      (darkPool.data || []).forEach(d => {
        if (!darkPoolMap.has(d.ticker)) darkPoolMap.set(d.ticker, []);
        darkPoolMap.get(d.ticker)!.push(d.dark_pool_percentage || 0);
      });
      const form4Map = new Map<string, any[]>();
      (form4.data || []).forEach(f => {
        if (!form4Map.has(f.ticker)) form4Map.set(f.ticker, []);
        form4Map.get(f.ticker)!.push(f);
      });
      const holdings13fMap = new Map<string, { shares: number; value: number }>();
      (holdings13f.data || []).forEach(h => {
        const current = holdings13fMap.get(h.ticker) || { shares: 0, value: 0 };
        holdings13fMap.set(h.ticker, {
          shares: current.shares + (h.change_shares || 0),
          value: current.value + (h.value || 0),
        });
      });
      const congressMap = new Map<string, { buys: number; totalValue: number }>();
      (congressionalTrades.data || []).forEach(c => {
        const isPurchase = c.transaction_type?.toLowerCase().includes('purchase');
        if (isPurchase) {
          const current = congressMap.get(c.ticker) || { buys: 0, totalValue: 0 };
          const avgValue = ((c.amount_min || 0) + (c.amount_max || 0)) / 2;
          congressMap.set(c.ticker, {
            buys: current.buys + 1,
            totalValue: current.totalValue + avgValue,
          });
        }
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
      const shortMap = new Map((shortInterest.data || []).map(s => [s.ticker, s.float_percentage]));
      const earningsMap = new Map((earningsSentiment.data || []).map(e => [e.ticker, e.earnings_surprise]));
      const etfMap = new Map<string, number>();
      (etfFlows.data || []).forEach(e => {
        etfMap.set(e.ticker, (etfMap.get(e.ticker) || 0) + (e.net_flow || 0));
      });
      const cryptoMap = new Map((cryptoOnchain.data || []).map(c => [c.ticker, c]));
      const forexSentMap = new Map((forexSentiment.data || []).map(f => [f.ticker, f]));

      // Macro score (same for all)
      const econ = economicIndicators.data || [];
      const positiveImpact = econ.filter(e => e.impact === 'positive').length;
      const negativeImpact = econ.filter(e => e.impact === 'negative').length;
      // Increased from 0.2/-0.15 to 2.0/-1.5 (10x)
      const macroBoost = positiveImpact > negativeImpact ? 2.0 : (negativeImpact > positiveImpact ? -1.5 : 0);

      // Compute scores for each asset
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

        // Technical signals (10x increase: 0.3 -> 3.0, 0.4 -> 4.0, etc.)
        const tech = techMap.get(ticker);
        if (tech) {
          if (tech.rsi_14 !== null) {
            // Scale RSI contribution based on how extreme it is
            if (tech.rsi_14 < 30) {
              const extremity = (30 - tech.rsi_14) / 30; // 0-1 scale
              components.TechEdge += 3.0 + extremity * 3.0; // 3-6 points
            } else if (tech.rsi_14 > 70) {
              const extremity = (tech.rsi_14 - 70) / 30;
              components.TechEdge -= 2.0 + extremity * 2.0; // -2 to -4 points
            }
          }
          if (tech.breakout_signal === 'bullish') components.TechEdge += 4.0;
          if (tech.breakout_signal === 'bearish') components.TechEdge -= 3.0;
          if (tech.trend_strength === 'strong') components.TechEdge += 2.0;
          if (tech.stochastic_signal === 'oversold') components.TechEdge += 2.0;
          if (tech.stochastic_signal === 'overbought') components.TechEdge -= 1.5;
        }

        // Dark pool - magnitude-based (10x base + scaling)
        const dpPcts = darkPoolMap.get(ticker);
        if (dpPcts && dpPcts.length > 0) {
          const avgDpPct = dpPcts.reduce((a, b) => a + b, 0) / dpPcts.length;
          // Scale by percentage: 40% = 3.0, 50% = 4.5, 60% = 6.0
          if (avgDpPct > 30) {
            const dpScore = Math.min((avgDpPct - 30) / 10 * 3.0, 9.0);
            components.FlowPressure += dpScore;
            components.BigMoneyConfirm += dpScore * 0.6;
          }
        }

        // Form 4 insider trades - magnitude-based scaling
        const f4Trades = form4Map.get(ticker) || [];
        const netInsider = f4Trades.reduce((sum, f) => {
          const mult = f.transaction_type?.toLowerCase().includes('purchase') ? 1 : -1;
          return sum + mult * (f.total_value || 0);
        }, 0);
        // Use log scale: $100k = 4.0, $1M = 7.0, $10M = 10.0
        const insiderContrib = magnitudeScale(netInsider, 100000, MAX_COMPONENT_VALUE);
        components.InsiderPoliticianConfirm += insiderContrib;

        // 13F holdings - magnitude-based scaling
        const h13fData = holdings13fMap.get(ticker);
        if (h13fData) {
          // Scale by value in millions
          const valueContrib = magnitudeScale(h13fData.value, 1000000, MAX_COMPONENT_VALUE);
          const sharesContrib = magnitudeScale(h13fData.shares, 100000, MAX_COMPONENT_VALUE);
          components.BigMoneyConfirm += Math.max(valueContrib, sharesContrib * 0.5);
        }

        // Congressional trades - magnitude-based
        const congData = congressMap.get(ticker);
        if (congData && congData.buys > 0) {
          // Multiple trades are more significant
          const buyCountScore = Math.min(congData.buys * 2.0, 6.0);
          const valueScore = magnitudeScale(congData.totalValue, 50000, 4.0);
          components.InsiderPoliticianConfirm += buyCountScore + valueScore;
        }

        // News sentiment - scaled by sentiment and buzz
        const newsSent = newsSentMap.get(ticker);
        if (newsSent) {
          // Sentiment score is -1 to 1, scale to -6 to +6
          const sentimentContrib = (newsSent.sentiment_score || 0) * 6.0;
          components.Attention += sentimentContrib;
          // Buzz score bonus
          if (newsSent.buzz_score) {
            const buzzBonus = Math.min((newsSent.buzz_score / 100) * 4.0, 4.0);
            components.Attention += buzzBonus;
          }
        }

        // Options flow - magnitude-based
        const opts = optionsMap.get(ticker);
        if (opts) {
          const netSentiment = opts.bullish - opts.bearish;
          if (netSentiment > 0) {
            const optScore = Math.min(netSentiment * 1.5, 6.0);
            components.TechEdge += optScore;
            components.FlowPressure += optScore * 0.5;
            // Premium-based bonus
            const premiumBonus = magnitudeScale(opts.totalPremium, 1000000, 4.0);
            components.FlowPressure += premiumBonus;
          } else if (netSentiment < 0) {
            components.TechEdge -= Math.min(Math.abs(netSentiment) * 1.0, 4.0);
          }
        }

        // Short interest - risk scaling (10x)
        const siPct = shortMap.get(ticker);
        if (siPct !== undefined && siPct > 0) {
          // Linear scaling: 10% = 1.5, 20% = 3.0, 40% = 6.0
          const siRisk = Math.min((siPct / 10) * 1.5, MAX_COMPONENT_VALUE);
          components.RiskFlags += siRisk;
        }

        // Earnings - magnitude-based
        const earnSurprise = earningsMap.get(ticker);
        if (earnSurprise !== undefined) {
          // Scale by surprise percentage
          const earnContrib = magnitudeScale(earnSurprise * 100, 10, 6.0);
          components.EarningsMomentum += earnContrib;
        }

        // ETF flows - magnitude-based
        const netFlow = etfMap.get(ticker);
        if (netFlow !== undefined && netFlow !== 0) {
          // Scale by flow in millions
          const flowContrib = magnitudeScale(netFlow, 10000000, 8.0);
          components.FlowPressure += flowContrib;
        }

        // Crypto-specific (10x + magnitude)
        if (assetClass === 'crypto') {
          const crypto = cryptoMap.get(ticker);
          if (crypto) {
            if (crypto.whale_signal === 'accumulation') components.BigMoneyConfirm += 5.0;
            else if (crypto.whale_signal === 'distribution') components.BigMoneyConfirm -= 3.0;
            
            if (crypto.exchange_flow_signal === 'outflow') components.FlowPressure += 4.0;
            else if (crypto.exchange_flow_signal === 'inflow') components.FlowPressure -= 2.0;
            
            if (crypto.fear_greed_index !== null) {
              // Fear = opportunity (under 25), greed = risk (over 75)
              if (crypto.fear_greed_index < 25) {
                components.TechEdge += (25 - crypto.fear_greed_index) / 25 * 5.0;
              } else if (crypto.fear_greed_index > 75) {
                components.RiskFlags += (crypto.fear_greed_index - 75) / 25 * 3.0;
              }
            }
            
            // MVRV ratio: <1 = undervalued, >3 = overvalued
            if (crypto.mvrv_ratio !== null) {
              if (crypto.mvrv_ratio < 1) {
                components.BigMoneyConfirm += (1 - crypto.mvrv_ratio) * 6.0;
              } else if (crypto.mvrv_ratio > 3) {
                components.RiskFlags += Math.min((crypto.mvrv_ratio - 3) * 2.0, 6.0);
              }
            }
          }
        }

        // Forex-specific (10x + positioning data)
        if (assetClass === 'forex') {
          const fxData = forexSentMap.get(ticker);
          if (fxData) {
            if (fxData.retail_sentiment === 'bullish') components.Attention += 3.0;
            else if (fxData.retail_sentiment === 'bearish') components.Attention -= 2.0;
            
            // Contrarian retail positioning
            if (fxData.retail_long_pct !== null) {
              // Extreme retail positioning is contrarian signal
              if (fxData.retail_long_pct > 75) {
                components.RiskFlags += 2.0; // Too many longs = potential reversal
              } else if (fxData.retail_long_pct < 25) {
                components.TechEdge += 2.0; // Few longs = potential upside
              }
            }
          }
        }

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

        // Compute weighted score with new normalization
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
        // Minimum active components contribution to avoid division by tiny numbers
        const effectiveMax = Math.max(activeComponentsMax, 3.0 * MAX_COMPONENT_VALUE);
        const normalizedRaw = rawScore / effectiveMax;
        
        // Map to 15-85 range, centered at 50
        // normalizedRaw of -1 = 15, 0 = 50, +1 = 85
        const finalScore = Math.max(15, Math.min(85, 50 + normalizedRaw * 35));
        
        updates.push({ 
          id: asset.id, 
          score: Math.round(finalScore * 10) / 10,
          breakdown: { ...components },
        });
        processedCount++;
      }

      // Batch update scores
      const now = new Date().toISOString();
      for (const update of updates) {
        await supabase
          .from('assets')
          .update({ 
            computed_score: update.score, 
            score_computed_at: now,
            metadata: { score_breakdown: update.breakdown },
          })
          .eq('id', update.id);
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
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount, 
        duration_ms: duration,
        next_offset: nextOffset,
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
