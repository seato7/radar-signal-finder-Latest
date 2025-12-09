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
}

// Component weights - aligned with asset scoring
const WEIGHTS: Record<string, number> = {
  technical: 1.0,
  pattern: 0.8,
  sentiment: 0.8,
  institutionalFlow: 1.0,
  insiderActivity: 0.8,
  optionsFlow: 0.7,
  cryptoOnchain: 0.5,
  momentum: 0.9,
  earnings: 0.6,
  shortInterest: 0.5,
};

// Sector to theme mapping - maps asset sectors to theme names
const SECTOR_TO_THEME: Record<string, string[]> = {
  // Technology themes
  'Technology': ['AI & Semiconductors', 'Cybersecurity'],
  'Semiconductors': ['AI & Semiconductors'],
  'AI & Machine Learning': ['AI & Semiconductors'],
  'Software & Services': ['AI & Semiconductors', 'Cybersecurity'],
  
  // Healthcare themes
  'Healthcare': ['Biotech & Healthcare'],
  'Biotechnology': ['Biotech & Healthcare'],
  'Healthcare Services': ['Biotech & Healthcare'],
  
  // Finance themes
  'Financial Services': ['Banks & Financials'],
  'Banks': ['Banks & Financials'],
  'Fintech': ['Banks & Financials'],
  
  // Energy themes
  'Energy': ['Energy & Oil'],
  'Oil & Gas': ['Energy & Oil'],
  'Clean Energy': ['Clean Energy & EVs'],
  'Renewable Energy': ['Clean Energy & EVs'],
  'Electric Vehicles': ['Clean Energy & EVs'],
  
  // Consumer themes
  'Consumer Discretionary': ['Retail & E-commerce', 'Consumer Discretionary'],
  'Consumer Staples': ['Food & Agriculture'],
  'Retail': ['Retail & E-commerce'],
  'E-Commerce': ['Retail & E-commerce'],
  
  // Industrial themes
  'Industrials': ['Industrial & Infrastructure', 'Defense & Aerospace'],
  'Defense': ['Defense & Aerospace'],
  'Aerospace': ['Defense & Aerospace'],
  'Transportation': ['Travel & Leisure'],
  
  // Real Estate themes
  'Real Estate': ['Real Estate & REITs'],
  'REITs': ['Real Estate & REITs'],
  
  // Materials themes
  'Materials': ['Commodities & Mining'],
  'Basic Materials': ['Commodities & Mining'],
  'Mining': ['Commodities & Mining'],
  
  // Communications themes
  'Communication Services': ['Media & Entertainment'],
  'Media & Entertainment': ['Media & Entertainment'],
  
  // Crypto themes
  'Cryptocurrency': ['Crypto & Blockchain'],
  'Digital Assets': ['Crypto & Blockchain'],
  
  // Currency themes
  'Currency': ['Forex & Currency'],
  'Foreign Exchange': ['Forex & Currency'],
  
  // Commodities
  'Commodities': ['Commodities & Mining'],
  
  // ETF (can map to multiple based on name)
  'ETF': [],
};

// Name-based keyword matching for more granular theme assignment
const THEME_KEYWORDS: Record<string, string[]> = {
  'AI & Semiconductors': ['nvidia', 'amd', 'intel', 'qualcomm', 'broadcom', 'micron', 'asml', 'tsmc', 'ai ', 'artificial intelligence', 'machine learning', 'semiconductor', 'chip', 'palantir', 'c3.ai', 'snowflake'],
  'Biotech & Healthcare': ['biotech', 'pharma', 'therapeut', 'oncology', 'genomic', 'drug', 'health', 'medical', 'moderna', 'pfizer', 'merck', 'amgen', 'gilead', 'biogen', 'regeneron', 'vertex', 'abbvie', 'lilly'],
  'Clean Energy & EVs': ['solar', 'wind', 'renewable', 'clean energy', 'electric vehicle', ' ev ', 'tesla', 'rivian', 'lucid', 'enphase', 'first solar', 'plug power', 'hydrogen', 'battery'],
  'Defense & Aerospace': ['defense', 'aerospace', 'lockheed', 'raytheon', 'northrop', 'boeing', 'general dynamics', 'military', 'weapon'],
  'Banks & Financials': ['bank', 'jpmorgan', 'goldman', 'morgan stanley', 'blackrock', 'visa', 'mastercard', 'paypal', 'square', 'credit', 'lending'],
  'Energy & Oil': ['oil', 'gas', 'petroleum', 'exxon', 'chevron', 'conocophillips', 'energy', 'drilling'],
  'Real Estate & REITs': ['reit', 'real estate', 'property', 'realty', 'housing'],
  'Industrial & Infrastructure': ['industrial', 'manufacturing', 'caterpillar', 'deere', 'honeywell', '3m', 'infrastructure', 'construction'],
  'Commodities & Mining': ['mining', 'gold', 'silver', 'copper', 'metal', 'steel', 'newmont', 'freeport', 'nucor'],
  'Retail & E-commerce': ['retail', 'amazon', 'walmart', 'costco', 'target', 'home depot', 'e-commerce', 'shop'],
  'Travel & Leisure': ['airline', 'hotel', 'travel', 'booking', 'airbnb', 'marriott', 'hilton', 'cruise', 'leisure'],
  'Media & Entertainment': ['media', 'netflix', 'disney', 'streaming', 'entertainment', 'comcast', 'warner'],
  'Food & Agriculture': ['food', 'beverage', 'coca-cola', 'pepsi', 'agriculture', 'grocery', 'restaurant'],
  'Cybersecurity': ['cyber', 'security', 'crowdstrike', 'palo alto', 'fortinet', 'zscaler', 'okta'],
  'Crypto & Blockchain': ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'coinbase', 'defi'],
  'Forex & Currency': ['eur/usd', 'gbp/usd', 'usd/jpy', 'forex', 'currency'],
};

// Helper to build lookup maps
function buildMap(data: any[] | null, key: string = "ticker"): Map<string, any[]> {
  const map = new Map<string, any[]>();
  (data || []).forEach((item) => {
    const ticker = (item[key] || "").toUpperCase();
    if (!map.has(ticker)) map.set(ticker, []);
    map.get(ticker)!.push(item);
  });
  return map;
}

// Assign asset to themes based on sector, industry, and name keywords
function assignAssetToThemes(asset: { ticker: string; name: string; asset_class: string | null; metadata: any }): string[] {
  const themes = new Set<string>();
  const sector = asset.metadata?.sector;
  const industry = asset.metadata?.industry;
  const nameLower = asset.name.toLowerCase();
  const tickerLower = asset.ticker.toLowerCase();
  
  // 1. Sector-based assignment
  if (sector && SECTOR_TO_THEME[sector]) {
    SECTOR_TO_THEME[sector].forEach(t => themes.add(t));
  }
  
  // 2. Industry-based assignment
  if (industry && SECTOR_TO_THEME[industry]) {
    SECTOR_TO_THEME[industry].forEach(t => themes.add(t));
  }
  
  // 3. Keyword-based assignment (name matching)
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword) || tickerLower.includes(keyword)) {
        themes.add(theme);
        break;
      }
    }
  }
  
  // 4. Asset class fallback
  if (asset.asset_class === 'crypto') {
    themes.add('Crypto & Blockchain');
  } else if (asset.asset_class === 'forex') {
    themes.add('Forex & Currency');
  }
  
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
    
    // Create theme name to ID mapping
    const themeNameToId: Record<string, string> = {};
    const themeNameToConfig: Record<string, Theme> = {};
    (existingThemes || []).forEach((t: Theme) => {
      themeNameToId[t.name] = t.id;
      themeNameToConfig[t.name] = t;
    });

    console.log(`[THEME-SCORING] Found ${existingThemes?.length || 0} existing themes`);

    // Fetch ALL assets with their metadata (sector/industry)
    // We'll batch this to handle 26k+ assets
    const allAssets: any[] = [];
    let offset = 0;
    const batchSize = 5000;
    
    while (true) {
      const { data: assets, error: assetsError } = await supabase
        .from("assets")
        .select("id, ticker, name, asset_class, metadata")
        .range(offset, offset + batchSize - 1);
      
      if (assetsError) throw assetsError;
      if (!assets || assets.length === 0) break;
      
      allAssets.push(...assets);
      offset += batchSize;
      
      if (assets.length < batchSize) break;
    }

    console.log(`[THEME-SCORING] Loaded ${allAssets.length} total assets`);

    // Build theme -> tickers mapping based on sector/industry/keywords
    const themeTickerMap: Record<string, Set<string>> = {};
    
    // Initialize with existing theme names
    Object.keys(themeNameToId).forEach(name => {
      themeTickerMap[name] = new Set();
    });
    
    // Also add explicit tickers from theme definitions
    (existingThemes || []).forEach((t: Theme) => {
      if (!themeTickerMap[t.name]) themeTickerMap[t.name] = new Set();
      (t.tickers || []).forEach(ticker => themeTickerMap[t.name].add(ticker.toUpperCase()));
    });

    // Assign each asset to themes
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
    
    // Log theme sizes
    const themeSizes = Object.entries(themeTickerMap)
      .map(([name, tickers]) => ({ name, count: tickers.size }))
      .sort((a, b) => b.count - a.count);
    console.log(`[THEME-SCORING] Theme sizes: ${themeSizes.map(t => `${t.name}=${t.count}`).join(', ')}`);

    // Collect all unique tickers
    const allTickers = new Set<string>();
    Object.values(themeTickerMap).forEach(tickers => {
      tickers.forEach(t => allTickers.add(t));
    });
    const tickerList = Array.from(allTickers);

    console.log(`[THEME-SCORING] Total unique tickers across themes: ${tickerList.length}`);

    // Date ranges
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch ALL data sources in parallel - using all ingestion tables
    // Note: We can't filter by ticker list since it might exceed query limits
    // Instead, we fetch recent data and filter in memory
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
    ] = await Promise.all([
      // 1. Advanced technicals - recent data
      supabase
        .from("advanced_technicals")
        .select("ticker, stochastic_signal, trend_strength, breakout_signal, adx, price_vs_vwap_pct")
        .gte("timestamp", sevenDaysAgo)
        .order("timestamp", { ascending: false })
        .limit(50000),

      // 2. Prices for momentum (from TwelveData)
      supabase
        .from("prices")
        .select("ticker, close, updated_at")
        .gte("updated_at", sevenDaysAgo)
        .order("updated_at", { ascending: false })
        .limit(50000),

      // 3. Dark pool activity
      supabase
        .from("dark_pool_activity")
        .select("ticker, signal_strength, signal_type, dark_pool_percentage")
        .gte("trade_date", thirtyDaysAgo)
        .order("trade_date", { ascending: false })
        .limit(50000),

      // 4. Pattern recognition
      supabase
        .from("pattern_recognition")
        .select("ticker, pattern_type, confidence_score, pattern_category")
        .gte("detected_at", thirtyDaysAgo)
        .order("detected_at", { ascending: false })
        .limit(50000),

      // 5. News sentiment
      supabase
        .from("news_sentiment_aggregate")
        .select("ticker, sentiment_score, sentiment_label, buzz_score")
        .gte("date", sevenDaysAgo)
        .order("date", { ascending: false })
        .limit(10000),

      // 6. Options flow
      supabase
        .from("options_flow")
        .select("ticker, sentiment, flow_type, premium")
        .gte("trade_date", thirtyDaysAgo)
        .order("trade_date", { ascending: false })
        .limit(50000),

      // 7. Congressional trades
      supabase
        .from("congressional_trades")
        .select("ticker, transaction_type, amount_min, representative")
        .gte("transaction_date", ninetyDaysAgo)
        .order("transaction_date", { ascending: false })
        .limit(10000),

      // 8. Crypto onchain
      supabase
        .from("crypto_onchain_metrics")
        .select("ticker, whale_signal, exchange_flow_signal, fear_greed_index")
        .gte("timestamp", sevenDaysAgo)
        .order("timestamp", { ascending: false })
        .limit(10000),

      // 9. Short interest
      supabase
        .from("short_interest")
        .select("ticker, float_percentage, days_to_cover")
        .order("report_date", { ascending: false })
        .limit(50000),

      // 10. Earnings sentiment
      supabase
        .from("earnings_sentiment")
        .select("ticker, earnings_surprise, sentiment_score")
        .order("earnings_date", { ascending: false })
        .limit(50000),

      // 11. Forex sentiment
      supabase
        .from("forex_sentiment")
        .select("ticker, retail_sentiment, news_sentiment_score")
        .gte("timestamp", sevenDaysAgo)
        .order("timestamp", { ascending: false })
        .limit(5000),

      // 12. Forex technicals
      supabase
        .from("forex_technicals")
        .select("ticker, rsi_signal, macd_crossover, ma_crossover")
        .gte("timestamp", sevenDaysAgo)
        .order("timestamp", { ascending: false })
        .limit(5000),

      // 13. COT reports
      supabase
        .from("cot_reports")
        .select("ticker, sentiment, noncommercial_net")
        .order("report_date", { ascending: false })
        .limit(5000),

      // 14. Job postings (alternative data)
      supabase
        .from("job_postings")
        .select("ticker, posting_count, growth_indicator")
        .gte("posted_date", thirtyDaysAgo)
        .order("posted_date", { ascending: false })
        .limit(30000),

      // 15. Patent filings (alternative data)
      supabase
        .from("patent_filings")
        .select("ticker, technology_category")
        .gte("filing_date", ninetyDaysAgo)
        .order("filing_date", { ascending: false })
        .limit(10000),

      // 16. Supply chain signals
      supabase
        .from("supply_chain_signals")
        .select("ticker, signal_type, change_percentage")
        .gte("report_date", thirtyDaysAgo)
        .order("report_date", { ascending: false })
        .limit(20000),

      // 17. Breaking news
      supabase
        .from("breaking_news")
        .select("ticker, sentiment_score, relevance_score")
        .gte("published_at", sevenDaysAgo)
        .order("published_at", { ascending: false })
        .limit(5000),
    ]);

    // Log data source counts
    console.log(`[THEME-SCORING] Data sources loaded:
      - Advanced Technicals: ${advancedTechnicalsResult.data?.length || 0}
      - Prices (TwelveData): ${pricesResult.data?.length || 0}
      - Dark Pool: ${darkPoolResult.data?.length || 0}
      - Pattern Recognition: ${patternRecognitionResult.data?.length || 0}
      - News Sentiment: ${newsSentimentResult.data?.length || 0}
      - Options Flow: ${optionsFlowResult.data?.length || 0}
      - Congressional: ${congressionalResult.data?.length || 0}
      - Crypto Onchain: ${cryptoOnchainResult.data?.length || 0}
      - Short Interest: ${shortInterestResult.data?.length || 0}
      - Earnings: ${earningsResult.data?.length || 0}
      - Forex Sentiment: ${forexSentimentResult.data?.length || 0}
      - Forex Technicals: ${forexTechnicalsResult.data?.length || 0}
      - COT Reports: ${cotReportsResult.data?.length || 0}
      - Job Postings: ${jobPostingsResult.data?.length || 0}
      - Patent Filings: ${patentFilingsResult.data?.length || 0}
      - Supply Chain: ${supplyChainResult.data?.length || 0}
      - Breaking News: ${breakingNewsResult.data?.length || 0}`);

    // Build lookup maps for each data source
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

    // Calculate score for each theme by aggregating ticker scores
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
      if (!themeId) {
        console.log(`[THEME-SCORING] Theme "${themeName}" not found in database, skipping`);
        continue;
      }
      
      const themeTickers = Array.from(themeTickerMap[themeName]);
      if (themeTickers.length === 0) {
        console.log(`[THEME-SCORING] Theme "${themeName}" has no tickers, skipping`);
        continue;
      }

      // Aggregate scores across all tickers in the theme
      const componentSums: ComponentScores = {
        technical: 0,
        pattern: 0,
        sentiment: 0,
        institutionalFlow: 0,
        insiderActivity: 0,
        optionsFlow: 0,
        cryptoOnchain: 0,
        momentum: 0,
        earnings: 0,
        shortInterest: 0,
      };
      const componentCounts: Record<string, number> = {};
      let tickersWithData = 0;

      for (const ticker of themeTickers) {
        let hasData = false;

        // ═══════════════════════════════════════════════════════════════════
        // 1. TECHNICAL STRENGTH (Weight: 1.0)
        // ═══════════════════════════════════════════════════════════════════
        const techs = technicalsMap.get(ticker) || [];
        if (techs.length > 0) {
          hasData = true;
          const tech = techs[0];
          let score = 50;

          const stochSignal = (tech.stochastic_signal || "").toLowerCase();
          if (stochSignal === "oversold") score += 15;
          else if (stochSignal === "overbought") score -= 10;

          const trend = (tech.trend_strength || "").toLowerCase();
          if (trend.includes("strong") && trend.includes("up")) score += 12;
          else if (trend.includes("strong") && trend.includes("down")) score -= 12;
          else if (trend.includes("weak") && trend.includes("up")) score += 5;
          else if (trend.includes("weak") && trend.includes("down")) score -= 5;

          const breakout = (tech.breakout_signal || "").toLowerCase();
          if (breakout.includes("bull")) score += 10;
          else if (breakout.includes("bear")) score -= 10;

          if (tech.adx && Number(tech.adx) > 25) score += 5;

          componentSums.technical += Math.max(0, Math.min(100, score));
          componentCounts.technical = (componentCounts.technical || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 2. MOMENTUM FROM PRICES (Weight: 0.9)
        // ═══════════════════════════════════════════════════════════════════
        const prices = pricesMap.get(ticker) || [];
        if (prices.length > 0) {
          hasData = true;
          let score = 50;
          // Base momentum score - presence of recent price data indicates activity
          score += 5;
          componentSums.momentum += Math.max(0, Math.min(100, score));
          componentCounts.momentum = (componentCounts.momentum || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 3. PATTERN RECOGNITION (Weight: 0.8)
        // ═══════════════════════════════════════════════════════════════════
        const patterns = patternsMap.get(ticker) || [];
        if (patterns.length > 0) {
          hasData = true;
          let score = 50;
          patterns.slice(0, 3).forEach((p: any) => {
            const confidence = p.confidence_score || 0.5;
            const patternType = (p.pattern_type || "").toLowerCase();
            if (patternType.includes("bullish") || patternType.includes("ascending")) {
              score += 10 * confidence;
            } else if (patternType.includes("bearish") || patternType.includes("descending")) {
              score -= 10 * confidence;
            }
          });
          componentSums.pattern += Math.max(0, Math.min(100, score));
          componentCounts.pattern = (componentCounts.pattern || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 4. SENTIMENT (Weight: 0.8) - News + Forex + Breaking News
        // ═══════════════════════════════════════════════════════════════════
        const news = newsMap.get(ticker) || [];
        const forexSent = forexSentimentMap.get(ticker) || [];
        const breaking = breakingNewsMap.get(ticker) || [];
        if (news.length > 0 || forexSent.length > 0 || breaking.length > 0) {
          hasData = true;
          let score = 50;

          if (news.length > 0) {
            const n = news[0];
            if (n.sentiment_score !== null) {
              score = 50 + Number(n.sentiment_score) * 40;
            } else if (n.sentiment_label) {
              if (n.sentiment_label === "bullish" || n.sentiment_label === "positive") score = 70;
              else if (n.sentiment_label === "bearish" || n.sentiment_label === "negative") score = 30;
            }
            if (n.buzz_score && Number(n.buzz_score) > 50) score += 5;
          }

          if (forexSent.length > 0) {
            const fs = forexSent[0];
            if (fs.retail_sentiment === "bullish") score += 10;
            else if (fs.retail_sentiment === "bearish") score -= 10;
          }
          
          if (breaking.length > 0) {
            const bn = breaking[0];
            if (bn.sentiment_score > 0.3) score += 8;
            else if (bn.sentiment_score < -0.3) score -= 8;
          }

          componentSums.sentiment += Math.max(0, Math.min(100, score));
          componentCounts.sentiment = (componentCounts.sentiment || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 5. INSTITUTIONAL FLOW (Weight: 1.0) - Dark Pool
        // ═══════════════════════════════════════════════════════════════════
        const darkPool = darkPoolMap.get(ticker) || [];
        if (darkPool.length > 0) {
          hasData = true;
          let score = 50;

          darkPool.slice(0, 5).forEach((dp: any) => {
            if (dp.signal_strength === "strong" && dp.signal_type === "accumulation") score += 10;
            else if (dp.signal_strength === "strong" && dp.signal_type === "distribution") score -= 10;
            else if (dp.signal_type === "accumulation") score += 5;
            else if (dp.signal_type === "distribution") score -= 5;
          });

          componentSums.institutionalFlow += Math.max(0, Math.min(100, score));
          componentCounts.institutionalFlow = (componentCounts.institutionalFlow || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 6. INSIDER ACTIVITY (Weight: 0.8) - Congressional + Job Postings
        // ═══════════════════════════════════════════════════════════════════
        const congress = congressMap.get(ticker) || [];
        const jobs = jobsMap.get(ticker) || [];
        if (congress.length > 0 || jobs.length > 0) {
          hasData = true;
          let score = 50;

          congress.forEach((c: any) => {
            const amount = c.amount_min || 0;
            const weight = amount > 100000 ? 2 : 1;
            if (c.transaction_type === "purchase" || c.transaction_type === "buy") score += 10 * weight;
            else if (c.transaction_type === "sale" || c.transaction_type === "sell") score -= 6 * weight;
          });

          // Job posting growth is bullish
          if (jobs.length > 0) {
            const j = jobs[0];
            if (j.growth_indicator > 0.2) score += 10;
            else if (j.growth_indicator > 0.1) score += 5;
            else if (j.growth_indicator < -0.2) score -= 8;
          }

          componentSums.insiderActivity += Math.max(0, Math.min(100, score));
          componentCounts.insiderActivity = (componentCounts.insiderActivity || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 7. OPTIONS FLOW (Weight: 0.7)
        // ═══════════════════════════════════════════════════════════════════
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

        // ═══════════════════════════════════════════════════════════════════
        // 8. CRYPTO ON-CHAIN (Weight: 0.5)
        // ═══════════════════════════════════════════════════════════════════
        const crypto = cryptoMap.get(ticker) || [];
        if (crypto.length > 0) {
          hasData = true;
          const c = crypto[0];
          let score = 50;
          if (c.whale_signal === "accumulation") score += 18;
          else if (c.whale_signal === "distribution") score -= 18;
          if (c.exchange_flow_signal === "bullish") score += 12;
          else if (c.exchange_flow_signal === "bearish") score -= 12;
          if (c.fear_greed_index !== null) {
            if (c.fear_greed_index < 25) score += 10;
            else if (c.fear_greed_index > 75) score -= 10;
          }
          componentSums.cryptoOnchain += Math.max(0, Math.min(100, score));
          componentCounts.cryptoOnchain = (componentCounts.cryptoOnchain || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 9. EARNINGS (Weight: 0.6) + Patents (innovation proxy)
        // ═══════════════════════════════════════════════════════════════════
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
            else if (e.earnings_surprise < 0) score -= 6;
          }
          
          // Patent activity is bullish for innovation
          if (patents.length > 3) score += 10;
          else if (patents.length > 0) score += 5;
          
          componentSums.earnings += Math.max(0, Math.min(100, score));
          componentCounts.earnings = (componentCounts.earnings || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 10. SHORT INTEREST (Weight: 0.5) + Supply Chain
        // ═══════════════════════════════════════════════════════════════════
        const shorts = shortInterestMap.get(ticker) || [];
        const supplyChain = supplyChainMap.get(ticker) || [];
        if (shorts.length > 0 || supplyChain.length > 0) {
          hasData = true;
          let score = 50;
          
          if (shorts.length > 0) {
            const s = shorts[0];
            if (s.float_percentage > 25) score += 15;
            else if (s.float_percentage > 15) score += 10;
            else if (s.float_percentage > 10) score += 5;
            if (s.days_to_cover > 7) score += 8;
            else if (s.days_to_cover > 4) score += 4;
          }
          
          // Supply chain signals
          if (supplyChain.length > 0) {
            const sc = supplyChain[0];
            if (sc.change_percentage > 10) score += 8;
            else if (sc.change_percentage < -10) score -= 8;
          }
          
          componentSums.shortInterest += Math.max(0, Math.min(100, score));
          componentCounts.shortInterest = (componentCounts.shortInterest || 0) + 1;
        }

        if (hasData) tickersWithData++;
      }

      // Calculate average scores for each component
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
      };

      // Calculate weighted final score - only use components with actual data
      let totalWeightedScore = 0;
      let totalWeight = 0;
      const positives: string[] = [];

      for (const [component, weight] of Object.entries(WEIGHTS)) {
        const score = avgComponents[component as keyof ComponentScores];
        const count = componentCounts[component] || 0;

        if (count > 0) {
          totalWeightedScore += score * weight;
          totalWeight += weight;

          if (score > 55) {
            positives.push(component);
          }
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

      console.log(`[THEME-SCORING] ${themeName}: score=${finalScore}, tickers=${themeTickers.length}, coverage=${dataCoverage}%, positives=[${positives.join(", ")}]`);
    }

    // Sort by score descending
    themeScores.sort((a, b) => b.score - a.score);

    // Store scores in theme_scores table
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
      }, {
        onConflict: "theme_id",
      });

      if (!upsertError) {
        // Update theme tickers and score
        await supabase.from("themes").update({
          score: ts.score,
          tickers: Array.from(themeTickerMap[ts.theme_name] || []).slice(0, 500), // Store top 500 tickers
          updated_at: now,
        }).eq("id", ts.theme_id);
        updatedCount++;
      } else {
        console.error(`[THEME-SCORING] Failed to update ${ts.theme_name}:`, upsertError);
      }
    }

    const durationMs = Date.now() - startTime;

    // Log success
    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "success",
      rows_inserted: updatedCount,
      duration_ms: durationMs,
      metadata: {
        themes_processed: themeScores.length,
        total_assets: allAssets.length,
        unique_tickers: tickerList.length,
        data_sources_used: 17,
        theme_sizes: themeSizes.slice(0, 20),
        scores: themeScores.map(t => ({ name: t.theme_name, score: t.score, tickers: t.ticker_count, coverage: t.data_coverage })),
      },
    });

    console.log(`[THEME-SCORING] ✅ Complete: ${updatedCount}/${themeScores.length} themes updated in ${durationMs}ms`);

    return new Response(JSON.stringify({
      success: true,
      themes: themeScores,
      metadata: {
        themes_processed: themeScores.length,
        themes_updated: updatedCount,
        total_assets: allAssets.length,
        unique_tickers: tickerList.length,
        data_sources_used: 17,
        duration_ms: durationMs,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[THEME-SCORING] ❌ Error:", errorMessage);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "error",
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    });

    return new Response(JSON.stringify({
      error: errorMessage,
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
