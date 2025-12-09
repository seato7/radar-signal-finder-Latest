import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Theme {
  id: string;
  name: string;
  tickers: string[];
  keywords: string[];
}

interface ComponentScores {
  technical: number;
  pattern: number;
  sentiment: number;
  institutionalFlow: number;
  insiderActivity: number;
  optionsFlow: number;
  cryptoOnchain: number;
  momentum: number;
  earnings: number;
  shortInterest: number;
  alternativeData: number;
  macro: number;
}

// Component weights
const WEIGHTS: Record<string, number> = {
  technical: 1.0,
  pattern: 0.8,
  sentiment: 0.9,
  institutionalFlow: 1.0,
  insiderActivity: 0.8,
  optionsFlow: 0.7,
  cryptoOnchain: 0.6,
  momentum: 0.9,
  earnings: 0.7,
  shortInterest: 0.5,
  alternativeData: 0.6,
  macro: 0.5,
};

// Sector to theme mapping
const SECTOR_TO_THEME: Record<string, string[]> = {
  'Technology': ['AI & Semiconductors', 'Cybersecurity'],
  'Semiconductors': ['AI & Semiconductors'],
  'AI & Machine Learning': ['AI & Semiconductors'],
  'Software & Services': ['AI & Semiconductors', 'Cybersecurity'],
  'Healthcare': ['Biotech & Healthcare'],
  'Biotechnology': ['Biotech & Healthcare'],
  'Healthcare Services': ['Biotech & Healthcare'],
  'Financial Services': ['Banks & Financials'],
  'Banks': ['Banks & Financials'],
  'Fintech': ['Banks & Financials'],
  'Energy': ['Energy & Oil'],
  'Oil & Gas': ['Energy & Oil'],
  'Clean Energy': ['Clean Energy & EVs'],
  'Renewable Energy': ['Clean Energy & EVs'],
  'Electric Vehicles': ['Clean Energy & EVs'],
  'Consumer Discretionary': ['Retail & E-commerce', 'Consumer Discretionary'],
  'Consumer Staples': ['Food & Agriculture'],
  'Retail': ['Retail & E-commerce'],
  'E-Commerce': ['Retail & E-commerce'],
  'Industrials': ['Industrial & Infrastructure', 'Defense & Aerospace'],
  'Defense': ['Defense & Aerospace'],
  'Aerospace': ['Defense & Aerospace'],
  'Transportation': ['Travel & Leisure'],
  'Real Estate': ['Real Estate & REITs'],
  'REITs': ['Real Estate & REITs'],
  'Materials': ['Commodities & Mining'],
  'Basic Materials': ['Commodities & Mining'],
  'Mining': ['Commodities & Mining'],
  'Communication Services': ['Media & Entertainment'],
  'Media & Entertainment': ['Media & Entertainment'],
  'Cryptocurrency': ['Crypto & Blockchain'],
  'Digital Assets': ['Crypto & Blockchain'],
  'Currency': ['Forex & Currency'],
  'Foreign Exchange': ['Forex & Currency'],
  'Commodities': ['Commodities & Mining'],
  'ETF': [],
};

// Keyword matching for theme assignment
const THEME_KEYWORDS: Record<string, string[]> = {
  'AI & Semiconductors': ['nvidia', 'amd', 'intel', 'qualcomm', 'broadcom', 'micron', 'asml', 'tsmc', 'ai ', 'artificial intelligence', 'machine learning', 'semiconductor', 'chip', 'palantir', 'c3.ai', 'snowflake', 'databricks'],
  'Biotech & Healthcare': ['biotech', 'pharma', 'therapeut', 'oncology', 'genomic', 'drug', 'health', 'medical', 'moderna', 'pfizer', 'merck', 'amgen', 'gilead', 'biogen', 'regeneron', 'vertex', 'abbvie', 'lilly', 'johnson'],
  'Clean Energy & EVs': ['solar', 'wind', 'renewable', 'clean energy', 'electric vehicle', ' ev ', 'tesla', 'rivian', 'lucid', 'enphase', 'first solar', 'plug power', 'hydrogen', 'battery', 'charging'],
  'Defense & Aerospace': ['defense', 'aerospace', 'lockheed', 'raytheon', 'northrop', 'boeing', 'general dynamics', 'military', 'weapon', 'missile'],
  'Banks & Financials': ['bank', 'jpmorgan', 'goldman', 'morgan stanley', 'blackrock', 'visa', 'mastercard', 'paypal', 'square', 'credit', 'lending', 'insurance', 'fidelity'],
  'Energy & Oil': ['oil', 'gas', 'petroleum', 'exxon', 'chevron', 'conocophillips', 'energy', 'drilling', 'pipeline', 'refin'],
  'Real Estate & REITs': ['reit', 'real estate', 'property', 'realty', 'housing', 'apartment', 'office', 'mall'],
  'Industrial & Infrastructure': ['industrial', 'manufacturing', 'caterpillar', 'deere', 'honeywell', '3m', 'infrastructure', 'construction', 'machinery'],
  'Commodities & Mining': ['mining', 'gold', 'silver', 'copper', 'metal', 'steel', 'newmont', 'freeport', 'nucor', 'aluminum', 'iron'],
  'Retail & E-commerce': ['retail', 'amazon', 'walmart', 'costco', 'target', 'home depot', 'e-commerce', 'shop', 'store', 'consumer'],
  'Travel & Leisure': ['airline', 'hotel', 'travel', 'booking', 'airbnb', 'marriott', 'hilton', 'cruise', 'leisure', 'casino', 'gaming'],
  'Media & Entertainment': ['media', 'netflix', 'disney', 'streaming', 'entertainment', 'comcast', 'warner', 'paramount', 'fox', 'spotify'],
  'Food & Agriculture': ['food', 'beverage', 'coca-cola', 'pepsi', 'agriculture', 'grocery', 'restaurant', 'mcdonald', 'starbucks'],
  'Cybersecurity': ['cyber', 'security', 'crowdstrike', 'palo alto', 'fortinet', 'zscaler', 'okta', 'sentinelone', 'cloudflare'],
  'Crypto & Blockchain': ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'coinbase', 'defi', 'btc', 'eth'],
  'Forex & Currency': ['eur/usd', 'gbp/usd', 'usd/jpy', 'forex', 'currency', 'eur', 'gbp', 'jpy', 'aud', 'cad'],
};

function buildMap(data: any[] | null, key: string = "ticker"): Map<string, any[]> {
  const map = new Map<string, any[]>();
  (data || []).forEach((item) => {
    const ticker = (item[key] || "").toUpperCase();
    if (!map.has(ticker)) map.set(ticker, []);
    map.get(ticker)!.push(item);
  });
  return map;
}

function assignAssetToThemes(asset: { ticker: string; name: string; asset_class: string | null; metadata: any }): string[] {
  const themes = new Set<string>();
  const sector = asset.metadata?.sector;
  const industry = asset.metadata?.industry;
  const nameLower = asset.name.toLowerCase();
  const tickerLower = asset.ticker.toLowerCase();
  
  if (sector && SECTOR_TO_THEME[sector]) {
    SECTOR_TO_THEME[sector].forEach(t => themes.add(t));
  }
  if (industry && SECTOR_TO_THEME[industry]) {
    SECTOR_TO_THEME[industry].forEach(t => themes.add(t));
  }
  
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword) || tickerLower.includes(keyword)) {
        themes.add(theme);
        break;
      }
    }
  }
  
  if (asset.asset_class === 'crypto') themes.add('Crypto & Blockchain');
  else if (asset.asset_class === 'forex') themes.add('Forex & Currency');
  
  return Array.from(themes);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all themes
    const { data: existingThemes, error: themesError } = await supabase
      .from("themes")
      .select("id, name, tickers, keywords");

    if (themesError) throw themesError;
    
    const themeNameToId: Record<string, string> = {};
    const themeNameToConfig: Record<string, Theme> = {};
    (existingThemes || []).forEach((t: Theme) => {
      themeNameToId[t.name] = t.id;
      themeNameToConfig[t.name] = t;
    });

    console.log(`[THEME-SCORING] Found ${existingThemes?.length || 0} themes`);

    // Fetch ALL assets - no limit, paginate through everything
    const allAssets: any[] = [];
    let offset = 0;
    const batchSize = 10000;
    
    while (true) {
      const { data: assets, error: assetsError } = await supabase
        .from("assets")
        .select("id, ticker, name, asset_class, metadata")
        .range(offset, offset + batchSize - 1);
      
      if (assetsError) throw assetsError;
      if (!assets || assets.length === 0) break;
      
      allAssets.push(...assets);
      console.log(`[THEME-SCORING] Loaded ${allAssets.length} assets so far...`);
      offset += batchSize;
      
      if (assets.length < batchSize) break;
    }

    console.log(`[THEME-SCORING] Total assets loaded: ${allAssets.length}`);

    // Build theme -> tickers mapping
    const themeTickerMap: Record<string, Set<string>> = {};
    Object.keys(themeNameToId).forEach(name => {
      themeTickerMap[name] = new Set();
    });
    
    (existingThemes || []).forEach((t: Theme) => {
      if (!themeTickerMap[t.name]) themeTickerMap[t.name] = new Set();
      (t.tickers || []).forEach(ticker => themeTickerMap[t.name].add(ticker.toUpperCase()));
    });

    // Assign ALL assets to themes
    let assignedCount = 0;
    for (const asset of allAssets) {
      const assignedThemes = assignAssetToThemes(asset);
      if (assignedThemes.length > 0) {
        assignedCount++;
        assignedThemes.forEach(themeName => {
          if (themeTickerMap[themeName]) {
            themeTickerMap[themeName].add(asset.ticker.toUpperCase());
          }
        });
      }
    }

    console.log(`[THEME-SCORING] Assigned ${assignedCount} assets to themes`);
    
    const themeSizes = Object.entries(themeTickerMap)
      .map(([name, tickers]) => ({ name, count: tickers.size }))
      .sort((a, b) => b.count - a.count);
    console.log(`[THEME-SCORING] Theme sizes: ${themeSizes.map(t => `${t.name}=${t.count}`).join(', ')}`);

    // Date ranges
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch ALL 31 data sources in parallel
    const [
      advancedTechnicalsResult,
      pricesResult,
      darkPoolResult,
      patternRecognitionResult,
      newsSentimentResult,
      optionsFlowResult,
      congressionalResult,
      cryptoOnchainResult,
      shortInterestResult,
      earningsResult,
      forexSentimentResult,
      forexTechnicalsResult,
      cotReportsResult,
      jobPostingsResult,
      patentFilingsResult,
      supplyChainResult,
      breakingNewsResult,
      smartMoneyResult,
      aiResearchResult,
      searchTrendsResult,
      socialSignalsResult,
      economicIndicatorsResult,
      signalsResult,
    ] = await Promise.all([
      // 1. Advanced technicals
      supabase.from("advanced_technicals")
        .select("ticker, stochastic_signal, trend_strength, breakout_signal, adx, price_vs_vwap_pct")
        .gte("timestamp", sevenDaysAgo).limit(100000),

      // 2. Prices
      supabase.from("prices")
        .select("ticker, close, updated_at")
        .gte("updated_at", sevenDaysAgo).limit(100000),

      // 3. Dark pool
      supabase.from("dark_pool_activity")
        .select("ticker, signal_strength, signal_type, dark_pool_percentage")
        .gte("trade_date", thirtyDaysAgo).limit(100000),

      // 4. Pattern recognition
      supabase.from("pattern_recognition")
        .select("ticker, pattern_type, confidence_score, pattern_category")
        .gte("detected_at", thirtyDaysAgo).limit(100000),

      // 5. News sentiment
      supabase.from("news_sentiment_aggregate")
        .select("ticker, sentiment_score, sentiment_label, buzz_score")
        .gte("date", sevenDaysAgo).limit(50000),

      // 6. Options flow
      supabase.from("options_flow")
        .select("ticker, sentiment, flow_type, premium")
        .gte("trade_date", thirtyDaysAgo).limit(100000),

      // 7. Congressional trades
      supabase.from("congressional_trades")
        .select("ticker, transaction_type, amount_min")
        .gte("transaction_date", ninetyDaysAgo).limit(10000),

      // 8. Crypto onchain
      supabase.from("crypto_onchain_metrics")
        .select("ticker, whale_signal, exchange_flow_signal, fear_greed_index")
        .gte("timestamp", sevenDaysAgo).limit(20000),

      // 9. Short interest
      supabase.from("short_interest")
        .select("ticker, float_percentage, days_to_cover")
        .limit(100000),

      // 10. Earnings sentiment
      supabase.from("earnings_sentiment")
        .select("ticker, earnings_surprise, sentiment_score")
        .limit(100000),

      // 11. Forex sentiment
      supabase.from("forex_sentiment")
        .select("ticker, retail_sentiment, news_sentiment_score")
        .gte("timestamp", sevenDaysAgo).limit(10000),

      // 12. Forex technicals
      supabase.from("forex_technicals")
        .select("ticker, rsi_signal, macd_crossover, ma_crossover")
        .gte("timestamp", sevenDaysAgo).limit(10000),

      // 13. COT reports
      supabase.from("cot_reports")
        .select("ticker, sentiment, noncommercial_net")
        .limit(10000),

      // 14. Job postings
      supabase.from("job_postings")
        .select("ticker, posting_count, growth_indicator")
        .gte("posted_date", thirtyDaysAgo).limit(50000),

      // 15. Patent filings
      supabase.from("patent_filings")
        .select("ticker, technology_category")
        .gte("filing_date", ninetyDaysAgo).limit(20000),

      // 16. Supply chain
      supabase.from("supply_chain_signals")
        .select("ticker, signal_type, change_percentage")
        .gte("report_date", thirtyDaysAgo).limit(50000),

      // 17. Breaking news
      supabase.from("breaking_news")
        .select("ticker, sentiment_score, relevance_score")
        .gte("published_at", sevenDaysAgo).limit(10000),

      // 18. Smart money flow
      supabase.from("smart_money_flow")
        .select("ticker, smart_money_signal, institutional_net_flow")
        .gte("timestamp", thirtyDaysAgo).limit(50000),

      // 19. AI research reports
      supabase.from("ai_research_reports")
        .select("ticker, recommendation, confidence_score, sentiment_analysis")
        .gte("generated_at", thirtyDaysAgo).limit(20000),

      // 20. Search trends
      supabase.from("search_trends")
        .select("ticker, trend_score, volume_change_pct")
        .gte("captured_at", sevenDaysAgo).limit(20000),

      // 21. Social signals (Reddit, StockTwits)
      supabase.from("social_signals")
        .select("ticker, sentiment_score, mention_count, platform")
        .gte("captured_at", sevenDaysAgo).limit(50000),

      // 22. Economic indicators
      supabase.from("economic_indicators")
        .select("indicator_type, value, impact, country")
        .gte("release_date", thirtyDaysAgo).limit(5000),

      // 23. Generic signals table (aggregated)
      supabase.from("signals")
        .select("asset_id, signal_type, direction, magnitude")
        .gte("observed_at", sevenDaysAgo).limit(100000),
    ]);

    // Log data source counts
    const dataCounts = {
      technicals: advancedTechnicalsResult.data?.length || 0,
      prices: pricesResult.data?.length || 0,
      darkPool: darkPoolResult.data?.length || 0,
      patterns: patternRecognitionResult.data?.length || 0,
      newsSentiment: newsSentimentResult.data?.length || 0,
      optionsFlow: optionsFlowResult.data?.length || 0,
      congressional: congressionalResult.data?.length || 0,
      cryptoOnchain: cryptoOnchainResult.data?.length || 0,
      shortInterest: shortInterestResult.data?.length || 0,
      earnings: earningsResult.data?.length || 0,
      forexSentiment: forexSentimentResult.data?.length || 0,
      forexTechnicals: forexTechnicalsResult.data?.length || 0,
      cot: cotReportsResult.data?.length || 0,
      jobPostings: jobPostingsResult.data?.length || 0,
      patents: patentFilingsResult.data?.length || 0,
      supplyChain: supplyChainResult.data?.length || 0,
      breakingNews: breakingNewsResult.data?.length || 0,
      smartMoney: smartMoneyResult.data?.length || 0,
      aiResearch: aiResearchResult.data?.length || 0,
      searchTrends: searchTrendsResult.data?.length || 0,
      socialSignals: socialSignalsResult.data?.length || 0,
      economic: economicIndicatorsResult.data?.length || 0,
      signals: signalsResult.data?.length || 0,
    };
    
    const totalDataPoints = Object.values(dataCounts).reduce((a, b) => a + b, 0);
    console.log(`[THEME-SCORING] Data sources (23 tables): ${JSON.stringify(dataCounts)}`);
    console.log(`[THEME-SCORING] Total data points: ${totalDataPoints}`);

    // Build lookup maps
    const technicalsMap = buildMap(advancedTechnicalsResult.data);
    const pricesMap = buildMap(pricesResult.data);
    const darkPoolMap = buildMap(darkPoolResult.data);
    const patternsMap = buildMap(patternRecognitionResult.data);
    const newsMap = buildMap(newsSentimentResult.data);
    const optionsMap = buildMap(optionsFlowResult.data);
    const congressMap = buildMap(congressionalResult.data);
    const cryptoMap = buildMap(cryptoOnchainResult.data);
    const shortInterestMap = buildMap(shortInterestResult.data);
    const earningsMap = buildMap(earningsResult.data);
    const forexSentimentMap = buildMap(forexSentimentResult.data);
    const forexTechnicalsMap = buildMap(forexTechnicalsResult.data);
    const cotMap = buildMap(cotReportsResult.data);
    const jobsMap = buildMap(jobPostingsResult.data);
    const patentsMap = buildMap(patentFilingsResult.data);
    const supplyChainMap = buildMap(supplyChainResult.data);
    const breakingNewsMap = buildMap(breakingNewsResult.data);
    const smartMoneyMap = buildMap(smartMoneyResult.data);
    const aiResearchMap = buildMap(aiResearchResult.data);
    const searchTrendsMap = buildMap(searchTrendsResult.data);
    const socialSignalsMap = buildMap(socialSignalsResult.data);

    // Calculate scores for each theme
    const themeScores: Array<{
      theme_id: string;
      theme_name: string;
      score: number;
      components: ComponentScores;
      positives: string[];
      ticker_count: number;
      data_coverage: number;
    }> = [];

    for (const themeName of Object.keys(themeTickerMap)) {
      const themeId = themeNameToId[themeName];
      if (!themeId) continue;
      
      const themeTickers = Array.from(themeTickerMap[themeName]);
      if (themeTickers.length === 0) continue;

      const componentSums: ComponentScores = {
        technical: 0, pattern: 0, sentiment: 0, institutionalFlow: 0,
        insiderActivity: 0, optionsFlow: 0, cryptoOnchain: 0,
        momentum: 0, earnings: 0, shortInterest: 0, alternativeData: 0, macro: 0,
      };
      const componentCounts: Record<string, number> = {};
      let tickersWithData = 0;

      for (const ticker of themeTickers) {
        let hasData = false;

        // 1. TECHNICAL (technicals + forex technicals)
        const techs = technicalsMap.get(ticker) || [];
        const forexTech = forexTechnicalsMap.get(ticker) || [];
        if (techs.length > 0 || forexTech.length > 0) {
          hasData = true;
          let score = 50;
          if (techs.length > 0) {
            const t = techs[0];
            if ((t.stochastic_signal || "").toLowerCase() === "oversold") score += 15;
            else if ((t.stochastic_signal || "").toLowerCase() === "overbought") score -= 10;
            const trend = (t.trend_strength || "").toLowerCase();
            if (trend.includes("strong") && trend.includes("up")) score += 12;
            else if (trend.includes("strong") && trend.includes("down")) score -= 12;
            if ((t.breakout_signal || "").toLowerCase().includes("bull")) score += 10;
            else if ((t.breakout_signal || "").toLowerCase().includes("bear")) score -= 10;
          }
          if (forexTech.length > 0) {
            const ft = forexTech[0];
            if (ft.rsi_signal === "oversold") score += 10;
            else if (ft.rsi_signal === "overbought") score -= 8;
            if (ft.macd_crossover === "bullish") score += 8;
            else if (ft.macd_crossover === "bearish") score -= 8;
          }
          componentSums.technical += Math.max(0, Math.min(100, score));
          componentCounts.technical = (componentCounts.technical || 0) + 1;
        }

        // 2. MOMENTUM (prices)
        const prices = pricesMap.get(ticker) || [];
        if (prices.length > 0) {
          hasData = true;
          componentSums.momentum += 55; // Active ticker = slight bullish
          componentCounts.momentum = (componentCounts.momentum || 0) + 1;
        }

        // 3. PATTERN
        const patterns = patternsMap.get(ticker) || [];
        if (patterns.length > 0) {
          hasData = true;
          let score = 50;
          patterns.slice(0, 3).forEach((p: any) => {
            const conf = p.confidence_score || 0.5;
            const pt = (p.pattern_type || "").toLowerCase();
            if (pt.includes("bullish") || pt.includes("ascending")) score += 10 * conf;
            else if (pt.includes("bearish") || pt.includes("descending")) score -= 10 * conf;
          });
          componentSums.pattern += Math.max(0, Math.min(100, score));
          componentCounts.pattern = (componentCounts.pattern || 0) + 1;
        }

        // 4. SENTIMENT (news + forex sentiment + breaking news + social signals + AI research)
        const news = newsMap.get(ticker) || [];
        const forexSent = forexSentimentMap.get(ticker) || [];
        const breaking = breakingNewsMap.get(ticker) || [];
        const social = socialSignalsMap.get(ticker) || [];
        const aiRes = aiResearchMap.get(ticker) || [];
        if (news.length > 0 || forexSent.length > 0 || breaking.length > 0 || social.length > 0 || aiRes.length > 0) {
          hasData = true;
          let score = 50;
          if (news.length > 0) {
            const n = news[0];
            if (n.sentiment_score !== null) score = 50 + Number(n.sentiment_score) * 40;
            if (n.buzz_score && Number(n.buzz_score) > 50) score += 5;
          }
          if (forexSent.length > 0 && forexSent[0].retail_sentiment === "bullish") score += 8;
          if (breaking.length > 0 && breaking[0].sentiment_score > 0.3) score += 6;
          if (social.length > 0) {
            const avgSocial = social.reduce((acc: number, s: any) => acc + (s.sentiment_score || 0), 0) / social.length;
            score += avgSocial * 15;
          }
          if (aiRes.length > 0) {
            const rec = (aiRes[0].recommendation || "").toLowerCase();
            if (rec.includes("buy") || rec.includes("bullish")) score += 10;
            else if (rec.includes("sell") || rec.includes("bearish")) score -= 10;
          }
          componentSums.sentiment += Math.max(0, Math.min(100, score));
          componentCounts.sentiment = (componentCounts.sentiment || 0) + 1;
        }

        // 5. INSTITUTIONAL FLOW (dark pool + smart money)
        const darkPool = darkPoolMap.get(ticker) || [];
        const smartMoney = smartMoneyMap.get(ticker) || [];
        if (darkPool.length > 0 || smartMoney.length > 0) {
          hasData = true;
          let score = 50;
          darkPool.slice(0, 5).forEach((dp: any) => {
            if (dp.signal_strength === "strong" && dp.signal_type === "accumulation") score += 10;
            else if (dp.signal_strength === "strong" && dp.signal_type === "distribution") score -= 10;
            else if (dp.signal_type === "accumulation") score += 5;
            else if (dp.signal_type === "distribution") score -= 5;
          });
          if (smartMoney.length > 0) {
            const sm = smartMoney[0];
            if (sm.smart_money_signal === "bullish" || sm.institutional_net_flow > 0) score += 12;
            else if (sm.smart_money_signal === "bearish" || sm.institutional_net_flow < 0) score -= 12;
          }
          componentSums.institutionalFlow += Math.max(0, Math.min(100, score));
          componentCounts.institutionalFlow = (componentCounts.institutionalFlow || 0) + 1;
        }

        // 6. INSIDER ACTIVITY (congressional + job postings)
        const congress = congressMap.get(ticker) || [];
        const jobs = jobsMap.get(ticker) || [];
        if (congress.length > 0 || jobs.length > 0) {
          hasData = true;
          let score = 50;
          congress.forEach((c: any) => {
            const amt = c.amount_min || 0;
            const w = amt > 100000 ? 2 : 1;
            if (c.transaction_type === "purchase" || c.transaction_type === "buy") score += 10 * w;
            else if (c.transaction_type === "sale" || c.transaction_type === "sell") score -= 6 * w;
          });
          if (jobs.length > 0 && jobs[0].growth_indicator > 0.1) score += 8;
          componentSums.insiderActivity += Math.max(0, Math.min(100, score));
          componentCounts.insiderActivity = (componentCounts.insiderActivity || 0) + 1;
        }

        // 7. OPTIONS FLOW
        const options = optionsMap.get(ticker) || [];
        if (options.length > 0) {
          hasData = true;
          let score = 50;
          options.slice(0, 10).forEach((o: any) => {
            if (o.sentiment === "bullish" || o.flow_type === "unusual_call") score += 5;
            else if (o.sentiment === "bearish" || o.flow_type === "unusual_put") score -= 5;
          });
          componentSums.optionsFlow += Math.max(0, Math.min(100, score));
          componentCounts.optionsFlow = (componentCounts.optionsFlow || 0) + 1;
        }

        // 8. CRYPTO ON-CHAIN
        const crypto = cryptoMap.get(ticker) || [];
        if (crypto.length > 0) {
          hasData = true;
          const c = crypto[0];
          let score = 50;
          if (c.whale_signal === "accumulation") score += 18;
          else if (c.whale_signal === "distribution") score -= 18;
          if (c.exchange_flow_signal === "bullish") score += 12;
          else if (c.exchange_flow_signal === "bearish") score -= 12;
          if (c.fear_greed_index < 25) score += 10;
          else if (c.fear_greed_index > 75) score -= 10;
          componentSums.cryptoOnchain += Math.max(0, Math.min(100, score));
          componentCounts.cryptoOnchain = (componentCounts.cryptoOnchain || 0) + 1;
        }

        // 9. EARNINGS (earnings + patents)
        const earnings = earningsMap.get(ticker) || [];
        const patents = patentsMap.get(ticker) || [];
        if (earnings.length > 0 || patents.length > 0) {
          hasData = true;
          let score = 50;
          if (earnings.length > 0) {
            const e = earnings[0];
            if (e.earnings_surprise > 15) score += 20;
            else if (e.earnings_surprise > 5) score += 12;
            else if (e.earnings_surprise > 0) score += 6;
            else if (e.earnings_surprise < -15) score -= 20;
            else if (e.earnings_surprise < -5) score -= 12;
          }
          if (patents.length > 3) score += 10;
          else if (patents.length > 0) score += 5;
          componentSums.earnings += Math.max(0, Math.min(100, score));
          componentCounts.earnings = (componentCounts.earnings || 0) + 1;
        }

        // 10. SHORT INTEREST (short interest + supply chain)
        const shorts = shortInterestMap.get(ticker) || [];
        const supplyChain = supplyChainMap.get(ticker) || [];
        if (shorts.length > 0 || supplyChain.length > 0) {
          hasData = true;
          let score = 50;
          if (shorts.length > 0) {
            const s = shorts[0];
            if (s.float_percentage > 25) score += 15;
            else if (s.float_percentage > 15) score += 10;
            if (s.days_to_cover > 7) score += 8;
          }
          if (supplyChain.length > 0 && supplyChain[0].change_percentage > 10) score += 8;
          componentSums.shortInterest += Math.max(0, Math.min(100, score));
          componentCounts.shortInterest = (componentCounts.shortInterest || 0) + 1;
        }

        // 11. ALTERNATIVE DATA (search trends + COT)
        const trends = searchTrendsMap.get(ticker) || [];
        const cot = cotMap.get(ticker) || [];
        if (trends.length > 0 || cot.length > 0) {
          hasData = true;
          let score = 50;
          if (trends.length > 0) {
            const t = trends[0];
            if (t.volume_change_pct > 50) score += 15;
            else if (t.volume_change_pct > 20) score += 8;
            if (t.trend_score > 70) score += 10;
          }
          if (cot.length > 0) {
            const c = cot[0];
            if (c.sentiment === "bullish") score += 10;
            else if (c.sentiment === "bearish") score -= 10;
          }
          componentSums.alternativeData += Math.max(0, Math.min(100, score));
          componentCounts.alternativeData = (componentCounts.alternativeData || 0) + 1;
        }

        if (hasData) tickersWithData++;
      }

      // 12. MACRO (economic indicators - applies to all themes)
      const econ = economicIndicatorsResult.data || [];
      if (econ.length > 0) {
        let macroScore = 50;
        const highImpact = econ.filter((e: any) => e.impact === "high");
        highImpact.forEach((e: any) => {
          if (e.value > 0 && e.indicator_type?.includes("GDP")) macroScore += 3;
          if (e.indicator_type?.includes("Unemployment") && e.value < 5) macroScore += 3;
          if (e.indicator_type?.includes("CPI") && e.value > 4) macroScore -= 3;
        });
        componentSums.macro = macroScore;
        componentCounts.macro = 1;
      }

      // Calculate averages
      const avgComponents: ComponentScores = {
        technical: componentCounts.technical ? componentSums.technical / componentCounts.technical : 50,
        pattern: componentCounts.pattern ? componentSums.pattern / componentCounts.pattern : 50,
        sentiment: componentCounts.sentiment ? componentSums.sentiment / componentCounts.sentiment : 50,
        institutionalFlow: componentCounts.institutionalFlow ? componentSums.institutionalFlow / componentCounts.institutionalFlow : 50,
        insiderActivity: componentCounts.insiderActivity ? componentSums.insiderActivity / componentCounts.insiderActivity : 50,
        optionsFlow: componentCounts.optionsFlow ? componentSums.optionsFlow / componentCounts.optionsFlow : 50,
        cryptoOnchain: componentCounts.cryptoOnchain ? componentSums.cryptoOnchain / componentCounts.cryptoOnchain : 50,
        momentum: componentCounts.momentum ? componentSums.momentum / componentCounts.momentum : 50,
        earnings: componentCounts.earnings ? componentSums.earnings / componentCounts.earnings : 50,
        shortInterest: componentCounts.shortInterest ? componentSums.shortInterest / componentCounts.shortInterest : 50,
        alternativeData: componentCounts.alternativeData ? componentSums.alternativeData / componentCounts.alternativeData : 50,
        macro: componentCounts.macro ? componentSums.macro / componentCounts.macro : 50,
      };

      // Weighted final score
      let totalWeightedScore = 0;
      let totalWeight = 0;
      const positives: string[] = [];

      for (const [component, weight] of Object.entries(WEIGHTS)) {
        const score = avgComponents[component as keyof ComponentScores];
        const count = componentCounts[component] || 0;
        if (count > 0) {
          totalWeightedScore += score * weight;
          totalWeight += weight;
          if (score > 55) positives.push(component);
        }
      }

      const finalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 50;
      const dataCoverage = themeTickers.length > 0 ? Math.round((tickersWithData / themeTickers.length) * 100) : 0;

      themeScores.push({
        theme_id: themeId,
        theme_name: themeName,
        score: finalScore,
        components: avgComponents,
        positives,
        ticker_count: themeTickers.length,
        data_coverage: dataCoverage,
      });

      console.log(`[THEME-SCORING] ${themeName}: score=${finalScore}, assets=${themeTickers.length}, coverage=${dataCoverage}%`);
    }

    themeScores.sort((a, b) => b.score - a.score);

    // Store scores
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const ts of themeScores) {
      const { error: upsertError } = await supabase.from("theme_scores").upsert({
        theme_id: ts.theme_id,
        score: ts.score,
        component_scores: ts.components,
        positive_components: ts.positives,
        signal_count: ts.ticker_count,
        computed_at: now,
      }, { onConflict: "theme_id" });

      if (!upsertError) {
        await supabase.from("themes").update({
          score: ts.score,
          tickers: Array.from(themeTickerMap[ts.theme_name] || []).slice(0, 1000),
          updated_at: now,
        }).eq("id", ts.theme_id);
        updatedCount++;
      }
    }

    const durationMs = Date.now() - startTime;

    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "success",
      rows_inserted: updatedCount,
      duration_ms: durationMs,
      metadata: {
        themes_processed: themeScores.length,
        total_assets: allAssets.length,
        data_sources_used: 23,
        total_data_points: totalDataPoints,
        theme_sizes: themeSizes.slice(0, 20),
        scores: themeScores.map(t => ({ name: t.theme_name, score: t.score, assets: t.ticker_count })),
      },
    });

    console.log(`[THEME-SCORING] ✅ Done: ${updatedCount} themes, ${allAssets.length} assets, ${totalDataPoints} data points in ${durationMs}ms`);

    return new Response(JSON.stringify({
      success: true,
      themes: themeScores,
      metadata: {
        themes_processed: themeScores.length,
        themes_updated: updatedCount,
        total_assets: allAssets.length,
        data_sources_used: 23,
        total_data_points: totalDataPoints,
        duration_ms: durationMs,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[THEME-SCORING] ❌ Error:", msg);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "error",
      error_message: msg,
      duration_ms: Date.now() - startTime,
    });

    return new Response(JSON.stringify({ error: msg, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
