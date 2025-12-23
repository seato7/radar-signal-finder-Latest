import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 2000;

// Scoring weights aligned with backend/scoring.py v2.1 spec
const WEIGHTS = {
  BigMoneyConfirm: 1.5,      // Institutional conviction (highest)
  FlowPressure: 1.4,         // Capital direction
  InsiderPoliticianConfirm: 1.2,  // Smart money
  CapexMomentum: 1.0,        // Growth proxy
  PolicyMomentum: 0.8,       // Policy catalysts
  TechEdge: 0.7,             // Technical/options
  Attention: 0.6,            // News/social
  MacroEconomic: 0.5,        // Economic indicators
  EarningsMomentum: 0.4,     // Earnings signals
  RiskFlags: -2.0,           // DOUBLED penalty
};

interface AssetScoreResult {
  assetId: string;
  score: number;
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

    console.log('Starting asset score computation cycle...');

    // Get total asset count
    const { count: totalAssets } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true });

    console.log(`Total assets to process: ${totalAssets}`);

    let processedCount = 0;
    let offset = 0;
    const allScores: AssetScoreResult[] = [];

    // Process in batches
    while (offset < (totalAssets || 0)) {
      console.log(`Processing batch: offset=${offset}, batch_size=${BATCH_SIZE}`);
      
      // Fetch batch of assets
      const { data: assets, error: assetsError } = await supabase
        .from('assets')
        .select('id, ticker, asset_class')
        .range(offset, offset + BATCH_SIZE - 1);

      if (assetsError) {
        console.error('Error fetching assets:', assetsError);
        break;
      }

      if (!assets || assets.length === 0) {
        console.log('No more assets to process');
        break;
      }

      const assetIds = assets.map(a => a.id);
      const tickers = assets.map(a => a.ticker);

      // Fetch all data sources in parallel
      const [
        technicals,
        darkPool,
        form4,
        holdings13f,
        congressionalTrades,
        newsRss,
        newsSentiment,
        optionsFlow,
        shortInterest,
        earningsSentiment,
        jobPostings,
        patentFilings,
        supplyChain,
        cotReports,
        economicIndicators,
        etfFlows,
        breakingNews,
        forexSentiment,
        forexTechnicals,
        cryptoOnchain,
        advancedTechnicals,
        aiResearch,
      ] = await Promise.all([
        // Technicals
        supabase.from('advanced_technicals').select('*').in('ticker', tickers),
        // Dark pool
        supabase.from('dark_pool_activity').select('*').in('ticker', tickers),
        // Form 4 insider trades
        supabase.from('form4_insider_trades').select('*').in('ticker', tickers),
        // 13F holdings
        supabase.from('holdings_13f').select('*').in('ticker', tickers),
        // Congressional trades
        supabase.from('congressional_trades').select('*').in('ticker', tickers),
        // News RSS
        supabase.from('news_rss_articles').select('*').in('ticker', tickers).order('published_at', { ascending: false }).limit(500),
        // News sentiment
        supabase.from('news_sentiment_aggregate').select('*').in('ticker', tickers),
        // Options flow
        supabase.from('options_flow').select('*').in('ticker', tickers),
        // Short interest
        supabase.from('short_interest').select('*').in('ticker', tickers),
        // Earnings sentiment
        supabase.from('earnings_sentiment').select('*').in('ticker', tickers),
        // Job postings
        supabase.from('job_postings').select('*').in('ticker', tickers),
        // Patent filings
        supabase.from('patent_filings').select('*').in('ticker', tickers),
        // Supply chain signals
        supabase.from('supply_chain_signals').select('*').in('ticker', tickers),
        // COT reports
        supabase.from('cot_reports').select('*').in('ticker', tickers),
        // Economic indicators
        supabase.from('economic_indicators').select('*').order('release_date', { ascending: false }).limit(100),
        // ETF flows
        supabase.from('etf_flows').select('*').in('ticker', tickers),
        // Breaking news
        supabase.from('breaking_news').select('*').in('ticker', tickers).order('published_at', { ascending: false }).limit(500),
        // Forex sentiment
        supabase.from('forex_sentiment').select('*').in('ticker', tickers),
        // Forex technicals
        supabase.from('forex_technicals').select('*').in('ticker', tickers),
        // Crypto on-chain
        supabase.from('crypto_onchain_metrics').select('*').in('ticker', tickers),
        // Advanced technicals (duplicate for additional signals)
        supabase.from('advanced_technicals').select('*').in('asset_id', assetIds),
        // AI research reports
        supabase.from('ai_research_reports').select('*').in('ticker', tickers),
      ]);

      // Build lookup maps
      const techMap = new Map((technicals.data || []).map(t => [t.ticker, t]));
      const darkPoolMap = new Map<string, any[]>();
      (darkPool.data || []).forEach(d => {
        if (!darkPoolMap.has(d.ticker)) darkPoolMap.set(d.ticker, []);
        darkPoolMap.get(d.ticker)!.push(d);
      });
      const form4Map = new Map<string, any[]>();
      (form4.data || []).forEach(f => {
        if (!form4Map.has(f.ticker)) form4Map.set(f.ticker, []);
        form4Map.get(f.ticker)!.push(f);
      });
      const holdings13fMap = new Map<string, any[]>();
      (holdings13f.data || []).forEach(h => {
        if (!holdings13fMap.has(h.ticker)) holdings13fMap.set(h.ticker, []);
        holdings13fMap.get(h.ticker)!.push(h);
      });
      const congressMap = new Map<string, any[]>();
      (congressionalTrades.data || []).forEach(c => {
        if (!congressMap.has(c.ticker)) congressMap.set(c.ticker, []);
        congressMap.get(c.ticker)!.push(c);
      });
      const newsRssMap = new Map<string, any[]>();
      (newsRss.data || []).forEach(n => {
        if (!newsRssMap.has(n.ticker)) newsRssMap.set(n.ticker, []);
        newsRssMap.get(n.ticker)!.push(n);
      });
      const newsSentMap = new Map((newsSentiment.data || []).map(n => [n.ticker, n]));
      const optionsMap = new Map<string, any[]>();
      (optionsFlow.data || []).forEach(o => {
        if (!optionsMap.has(o.ticker)) optionsMap.set(o.ticker, []);
        optionsMap.get(o.ticker)!.push(o);
      });
      const shortMap = new Map((shortInterest.data || []).map(s => [s.ticker, s]));
      const earningsMap = new Map((earningsSentiment.data || []).map(e => [e.ticker, e]));
      const jobsMap = new Map<string, any[]>();
      (jobPostings.data || []).forEach(j => {
        if (!jobsMap.has(j.ticker)) jobsMap.set(j.ticker, []);
        jobsMap.get(j.ticker)!.push(j);
      });
      const patentsMap = new Map<string, any[]>();
      (patentFilings.data || []).forEach(p => {
        if (!patentsMap.has(p.ticker)) patentsMap.set(p.ticker, []);
        patentsMap.get(p.ticker)!.push(p);
      });
      const supplyChainMap = new Map<string, any[]>();
      (supplyChain.data || []).forEach(s => {
        if (!supplyChainMap.has(s.ticker)) supplyChainMap.set(s.ticker, []);
        supplyChainMap.get(s.ticker)!.push(s);
      });
      const cotMap = new Map((cotReports.data || []).map(c => [c.ticker, c]));
      const etfMap = new Map<string, any[]>();
      (etfFlows.data || []).forEach(e => {
        if (!etfMap.has(e.ticker)) etfMap.set(e.ticker, []);
        etfMap.get(e.ticker)!.push(e);
      });
      const breakingNewsMap = new Map<string, any[]>();
      (breakingNews.data || []).forEach(b => {
        if (!breakingNewsMap.has(b.ticker)) breakingNewsMap.set(b.ticker, []);
        breakingNewsMap.get(b.ticker)!.push(b);
      });
      const forexSentMap = new Map((forexSentiment.data || []).map(f => [f.ticker, f]));
      const forexTechMap = new Map((forexTechnicals.data || []).map(f => [f.ticker, f]));
      const cryptoMap = new Map((cryptoOnchain.data || []).map(c => [c.ticker, c]));
      const advTechMap = new Map((advancedTechnicals.data || []).map(a => [a.asset_id, a]));
      const aiResearchMap = new Map((aiResearch.data || []).map(a => [a.ticker, a]));

      // Compute scores for each asset
      for (const asset of assets) {
        const components: Record<string, number> = {
          BigMoneyConfirm: 0,
          FlowPressure: 0,
          InsiderPoliticianConfirm: 0,
          CapexMomentum: 0,
          PolicyMomentum: 0,
          TechEdge: 0,
          Attention: 0,
          MacroEconomic: 0,
          EarningsMomentum: 0,
          RiskFlags: 0,
        };

        const ticker = asset.ticker;
        const assetClass = asset.asset_class || 'stock';

        // Technical signals (TechEdge)
        const tech = techMap.get(ticker);
        if (tech) {
          if (tech.rsi_14) {
            if (tech.rsi_14 < 30) components.TechEdge += 0.3;
            else if (tech.rsi_14 > 70) components.TechEdge -= 0.2;
          }
          if (tech.breakout_signal === 'bullish') components.TechEdge += 0.4;
          if (tech.breakout_signal === 'bearish') components.TechEdge -= 0.3;
          if (tech.trend_strength === 'strong') components.TechEdge += 0.2;
        }

        const advTech = advTechMap.get(asset.id);
        if (advTech) {
          if (advTech.stochastic_signal === 'oversold') components.TechEdge += 0.2;
          if (advTech.stochastic_signal === 'overbought') components.TechEdge -= 0.15;
        }

        // Dark pool (FlowPressure + BigMoneyConfirm)
        const dpActivity = darkPoolMap.get(ticker) || [];
        if (dpActivity.length > 0) {
          const avgDpPct = dpActivity.reduce((sum, d) => sum + (d.dark_pool_percentage || 0), 0) / dpActivity.length;
          if (avgDpPct > 40) {
            components.FlowPressure += 0.3;
            components.BigMoneyConfirm += 0.2;
          }
        }

        // Form 4 insider trades (InsiderPoliticianConfirm)
        const f4Trades = form4Map.get(ticker) || [];
        const recentF4 = f4Trades.filter(f => {
          const filingDate = new Date(f.filing_date);
          const daysAgo = (Date.now() - filingDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysAgo <= 30;
        });
        const netInsider = recentF4.reduce((sum, f) => {
          const mult = f.transaction_type?.toLowerCase().includes('purchase') ? 1 : -1;
          return sum + mult * (f.total_value || 0);
        }, 0);
        if (netInsider > 100000) components.InsiderPoliticianConfirm += 0.4;
        else if (netInsider < -100000) components.InsiderPoliticianConfirm -= 0.3;

        // 13F holdings (BigMoneyConfirm)
        const h13f = holdings13fMap.get(ticker) || [];
        if (h13f.length > 0) {
          const netChange = h13f.reduce((sum, h) => sum + (h.change_shares || 0), 0);
          if (netChange > 0) components.BigMoneyConfirm += 0.3;
          else if (netChange < 0) components.BigMoneyConfirm -= 0.2;
        }

        // Congressional trades (InsiderPoliticianConfirm)
        const congTrades = congressMap.get(ticker) || [];
        const recentCong = congTrades.filter(c => {
          const txDate = new Date(c.transaction_date);
          const daysAgo = (Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysAgo <= 30;
        });
        recentCong.forEach(c => {
          if (c.transaction_type?.toLowerCase().includes('purchase')) {
            components.InsiderPoliticianConfirm += 0.2;
          }
        });

        // News sentiment (Attention)
        const newsSent = newsSentMap.get(ticker);
        if (newsSent) {
          const score = newsSent.sentiment_score || 0;
          components.Attention += score * 0.3;
          if (newsSent.buzz_score && newsSent.buzz_score > 50) {
            components.Attention += 0.1;
          }
        }

        const rssArticles = newsRssMap.get(ticker) || [];
        if (rssArticles.length > 0) {
          const avgSent = rssArticles.reduce((sum, a) => sum + (a.sentiment_score || 0), 0) / rssArticles.length;
          components.Attention += avgSent * 0.2;
        }

        const bNews = breakingNewsMap.get(ticker) || [];
        if (bNews.length > 0) {
          const avgSent = bNews.reduce((sum, b) => sum + (b.sentiment_score || 0), 0) / bNews.length;
          components.Attention += avgSent * 0.15;
        }

        // Options flow (TechEdge + FlowPressure)
        const opts = optionsMap.get(ticker) || [];
        const bullishOpts = opts.filter(o => o.sentiment === 'bullish').length;
        const bearishOpts = opts.filter(o => o.sentiment === 'bearish').length;
        if (bullishOpts > bearishOpts * 2) {
          components.TechEdge += 0.2;
          components.FlowPressure += 0.15;
        } else if (bearishOpts > bullishOpts * 2) {
          components.TechEdge -= 0.15;
        }

        // Short interest (RiskFlags)
        const si = shortMap.get(ticker);
        if (si && si.float_percentage) {
          if (si.float_percentage > 20) components.RiskFlags += 0.3;
          if (si.float_percentage > 40) components.RiskFlags += 0.3;
        }

        // Earnings sentiment (EarningsMomentum)
        const earnings = earningsMap.get(ticker);
        if (earnings) {
          if (earnings.earnings_surprise && earnings.earnings_surprise > 0) {
            components.EarningsMomentum += 0.3;
          } else if (earnings.earnings_surprise && earnings.earnings_surprise < 0) {
            components.EarningsMomentum -= 0.2;
          }
        }

        // Job postings (CapexMomentum)
        const jobs = jobsMap.get(ticker) || [];
        if (jobs.length > 0) {
          const avgGrowth = jobs.reduce((sum, j) => sum + (j.growth_indicator || 0), 0) / jobs.length;
          if (avgGrowth > 0.1) components.CapexMomentum += 0.3;
        }

        // Patent filings (CapexMomentum)
        const patents = patentsMap.get(ticker) || [];
        if (patents.length > 0) {
          components.CapexMomentum += Math.min(patents.length * 0.1, 0.3);
        }

        // Supply chain signals (RiskFlags or CapexMomentum)
        const scSignals = supplyChainMap.get(ticker) || [];
        scSignals.forEach(s => {
          if (s.signal_type === 'disruption') components.RiskFlags += 0.2;
          else if (s.signal_type === 'expansion') components.CapexMomentum += 0.15;
        });

        // COT reports for forex/commodities (FlowPressure)
        if (assetClass === 'forex' || assetClass === 'commodity') {
          const cot = cotMap.get(ticker);
          if (cot) {
            if (cot.sentiment === 'bullish') components.FlowPressure += 0.3;
            else if (cot.sentiment === 'bearish') components.FlowPressure -= 0.2;
          }
        }

        // ETF flows (FlowPressure)
        const etfData = etfMap.get(ticker) || [];
        if (etfData.length > 0) {
          const netFlow = etfData.reduce((sum, e) => sum + (e.net_flow || 0), 0);
          if (netFlow > 0) components.FlowPressure += 0.2;
          else if (netFlow < 0) components.FlowPressure -= 0.15;
        }

        // Forex-specific signals
        if (assetClass === 'forex') {
          const fxSent = forexSentMap.get(ticker);
          if (fxSent) {
            if (fxSent.retail_sentiment === 'bullish') components.Attention += 0.2;
          }
          const fxTech = forexTechMap.get(ticker);
          if (fxTech) {
            if (fxTech.rsi_signal === 'oversold') components.TechEdge += 0.2;
            if (fxTech.macd_crossover === 'bullish') components.TechEdge += 0.3;
          }
        }

        // Crypto-specific signals
        if (assetClass === 'crypto') {
          const crypto = cryptoMap.get(ticker);
          if (crypto) {
            if (crypto.whale_signal === 'accumulation') components.BigMoneyConfirm += 0.3;
            if (crypto.exchange_flow_signal === 'outflow') components.FlowPressure += 0.2;
            if (crypto.fear_greed_index && crypto.fear_greed_index < 25) components.TechEdge += 0.2;
          }
        }

        // AI research confidence (general boost)
        const aiReport = aiResearchMap.get(ticker);
        if (aiReport && aiReport.confidence_score) {
          const confBoost = (aiReport.confidence_score - 50) / 200; // ±0.25 max
          components.TechEdge += confBoost;
        }

        // Macro economic (applies to all but weighted differently)
        const econ = economicIndicators.data || [];
        if (econ.length > 0) {
          const positiveImpact = econ.filter(e => e.impact === 'positive').length;
          const negativeImpact = econ.filter(e => e.impact === 'negative').length;
          if (positiveImpact > negativeImpact) components.MacroEconomic += 0.2;
          else if (negativeImpact > positiveImpact) components.MacroEconomic -= 0.15;
        }

        // Compute weighted score
        let rawScore = 0;
        let totalWeight = 0;

        for (const [key, weight] of Object.entries(WEIGHTS)) {
          if (key === 'RiskFlags') {
            rawScore += weight * components[key]; // Negative weight applied
          } else {
            rawScore += weight * components[key];
          }
          totalWeight += Math.abs(weight);
        }

        // Normalize to 0-100 scale
        const normalizedScore = Math.max(0, Math.min(100, 50 + (rawScore / totalWeight) * 100));

        allScores.push({
          assetId: asset.id,
          score: Math.round(normalizedScore * 10) / 10,
        });

        processedCount++;
      }

      // Batch update scores
      const updatePromises = allScores.slice(-assets.length).map(result => 
        supabase
          .from('assets')
          .update({ 
            computed_score: result.score, 
            score_computed_at: new Date().toISOString() 
          })
          .eq('id', result.assetId)
      );

      await Promise.all(updatePromises);
      console.log(`Updated ${assets.length} asset scores`);

      offset += BATCH_SIZE;
    }

    const duration = Date.now() - startTime;
    console.log(`Score computation complete. Processed ${processedCount} assets in ${duration}ms`);

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'compute-asset-scores',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: processedCount,
      metadata: { batch_size: BATCH_SIZE, total_batches: Math.ceil((totalAssets || 0) / BATCH_SIZE) },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount, 
        duration_ms: duration 
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
