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
        supabase.from('holdings_13f').select('ticker, change_shares').in('ticker', tickers),
        supabase.from('congressional_trades').select('ticker, transaction_type, transaction_date').in('ticker', tickers).gte('transaction_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        supabase.from('news_sentiment_aggregate').select('ticker, sentiment_score, buzz_score').in('ticker', tickers),
        supabase.from('options_flow').select('ticker, sentiment').in('ticker', tickers),
        supabase.from('short_interest').select('ticker, float_percentage').in('ticker', tickers),
        supabase.from('earnings_sentiment').select('ticker, earnings_surprise').in('ticker', tickers),
        supabase.from('etf_flows').select('ticker, net_flow').in('ticker', tickers),
        supabase.from('crypto_onchain_metrics').select('ticker, whale_signal, exchange_flow_signal, fear_greed_index').in('ticker', tickers),
        supabase.from('forex_sentiment').select('ticker, retail_sentiment').in('ticker', tickers),
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
      const holdings13fMap = new Map<string, number>();
      (holdings13f.data || []).forEach(h => {
        holdings13fMap.set(h.ticker, (holdings13fMap.get(h.ticker) || 0) + (h.change_shares || 0));
      });
      const congressMap = new Map<string, number>();
      (congressionalTrades.data || []).forEach(c => {
        const mult = c.transaction_type?.toLowerCase().includes('purchase') ? 1 : 0;
        congressMap.set(c.ticker, (congressMap.get(c.ticker) || 0) + mult);
      });
      const newsSentMap = new Map((newsSentiment.data || []).map(n => [n.ticker, n]));
      const optionsMap = new Map<string, { bullish: number; bearish: number }>();
      (optionsFlow.data || []).forEach(o => {
        if (!optionsMap.has(o.ticker)) optionsMap.set(o.ticker, { bullish: 0, bearish: 0 });
        const entry = optionsMap.get(o.ticker)!;
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
      const forexSentMap = new Map((forexSentiment.data || []).map(f => [f.ticker, f.retail_sentiment]));

      // Macro score (same for all)
      const econ = economicIndicators.data || [];
      const positiveImpact = econ.filter(e => e.impact === 'positive').length;
      const negativeImpact = econ.filter(e => e.impact === 'negative').length;
      const macroBoost = positiveImpact > negativeImpact ? 0.2 : (negativeImpact > positiveImpact ? -0.15 : 0);

      // Compute scores for each asset
      const updates: { id: string; score: number }[] = [];

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

        // Technical signals
        const tech = techMap.get(ticker);
        if (tech) {
          if (tech.rsi_14 !== null) {
            if (tech.rsi_14 < 30) components.TechEdge += 0.3;
            else if (tech.rsi_14 > 70) components.TechEdge -= 0.2;
          }
          if (tech.breakout_signal === 'bullish') components.TechEdge += 0.4;
          if (tech.breakout_signal === 'bearish') components.TechEdge -= 0.3;
          if (tech.trend_strength === 'strong') components.TechEdge += 0.2;
          if (tech.stochastic_signal === 'oversold') components.TechEdge += 0.2;
          if (tech.stochastic_signal === 'overbought') components.TechEdge -= 0.15;
        }

        // Dark pool
        const dpPcts = darkPoolMap.get(ticker);
        if (dpPcts && dpPcts.length > 0) {
          const avgDpPct = dpPcts.reduce((a, b) => a + b, 0) / dpPcts.length;
          if (avgDpPct > 40) {
            components.FlowPressure += 0.3;
            components.BigMoneyConfirm += 0.2;
          }
        }

        // Form 4 insider trades
        const f4Trades = form4Map.get(ticker) || [];
        const netInsider = f4Trades.reduce((sum, f) => {
          const mult = f.transaction_type?.toLowerCase().includes('purchase') ? 1 : -1;
          return sum + mult * (f.total_value || 0);
        }, 0);
        if (netInsider > 100000) components.InsiderPoliticianConfirm += 0.4;
        else if (netInsider < -100000) components.InsiderPoliticianConfirm -= 0.3;

        // 13F holdings
        const h13fChange = holdings13fMap.get(ticker) || 0;
        if (h13fChange > 0) components.BigMoneyConfirm += 0.3;
        else if (h13fChange < 0) components.BigMoneyConfirm -= 0.2;

        // Congressional trades
        const congBuys = congressMap.get(ticker) || 0;
        if (congBuys > 0) components.InsiderPoliticianConfirm += Math.min(congBuys * 0.2, 0.4);

        // News sentiment
        const newsSent = newsSentMap.get(ticker);
        if (newsSent) {
          components.Attention += (newsSent.sentiment_score || 0) * 0.3;
          if (newsSent.buzz_score && newsSent.buzz_score > 50) components.Attention += 0.1;
        }

        // Options flow
        const opts = optionsMap.get(ticker);
        if (opts) {
          if (opts.bullish > opts.bearish * 2) {
            components.TechEdge += 0.2;
            components.FlowPressure += 0.15;
          } else if (opts.bearish > opts.bullish * 2) {
            components.TechEdge -= 0.15;
          }
        }

        // Short interest
        const siPct = shortMap.get(ticker);
        if (siPct !== undefined) {
          if (siPct > 20) components.RiskFlags += 0.3;
          if (siPct > 40) components.RiskFlags += 0.3;
        }

        // Earnings
        const earnSurprise = earningsMap.get(ticker);
        if (earnSurprise !== undefined) {
          if (earnSurprise > 0) components.EarningsMomentum += 0.3;
          else if (earnSurprise < 0) components.EarningsMomentum -= 0.2;
        }

        // ETF flows
        const netFlow = etfMap.get(ticker);
        if (netFlow !== undefined) {
          if (netFlow > 0) components.FlowPressure += 0.2;
          else if (netFlow < 0) components.FlowPressure -= 0.15;
        }

        // Crypto-specific
        if (assetClass === 'crypto') {
          const crypto = cryptoMap.get(ticker);
          if (crypto) {
            if (crypto.whale_signal === 'accumulation') components.BigMoneyConfirm += 0.3;
            if (crypto.exchange_flow_signal === 'outflow') components.FlowPressure += 0.2;
            if (crypto.fear_greed_index !== null && crypto.fear_greed_index < 25) components.TechEdge += 0.2;
          }
        }

        // Forex-specific
        if (assetClass === 'forex') {
          const fxSent = forexSentMap.get(ticker);
          if (fxSent === 'bullish') components.Attention += 0.2;
        }

        // Compute weighted score
        let rawScore = 0;
        let totalWeight = 0;

        for (const [key, weight] of Object.entries(WEIGHTS)) {
          rawScore += weight * (components[key] || 0);
          totalWeight += Math.abs(weight);
        }

        const normalizedScore = Math.max(0, Math.min(100, 50 + (rawScore / totalWeight) * 100));
        updates.push({ id: asset.id, score: Math.round(normalizedScore * 10) / 10 });
        processedCount++;
      }

      // Batch update scores
      const now = new Date().toISOString();
      for (const update of updates) {
        await supabase
          .from('assets')
          .update({ computed_score: update.score, score_computed_at: now })
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
