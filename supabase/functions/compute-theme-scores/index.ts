import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ComponentScores {
  BigMoneyConfirm: number;
  FlowPressure: number;
  TechEdge: number;
  Attention: number;
  PolicyMomentum: number;
  InsiderPoliticianConfirm: number;
  CapexMomentum: number;
  RiskFlags: number;
}

const WEIGHTS: Record<string, number> = {
  BigMoneyConfirm: 1.0,
  FlowPressure: 0.9,
  TechEdge: 0.8,
  Attention: 0.7,
  PolicyMomentum: 0.6,
  InsiderPoliticianConfirm: 0.8,
  CapexMomentum: 0.5,
  RiskFlags: 0.4,
};

// Themes with their ticker patterns, sectors, and ETF proxies
const THEME_CONFIG: Record<string, {
  tickers: string[];
  etfs: string[];
  sectorKeywords: string[];
  tickerPatterns: RegExp[];
}> = {
  'AI & Semiconductors': {
    tickers: ['NVDA', 'AMD', 'INTC', 'QCOM', 'AVGO', 'MU', 'ASML', 'TSM', 'ARM', 'MRVL', 'LRCX', 'AMAT', 'KLAC', 'SNPS', 'CDNS', 'PLTR', 'SNOW', 'AI'],
    etfs: ['SMH', 'SOXX', 'XSD', 'PSI', 'SOXL', 'SOXS', 'BOTZ', 'ROBO', 'AIQ'],
    sectorKeywords: ['semiconductor', 'chip', 'artificial intelligence', 'machine learning', 'gpu', 'processor'],
    tickerPatterns: [/^AI/i, /^SM[A-Z]/i],
  },
  'Cloud & Cybersecurity': {
    tickers: ['CRWD', 'PANW', 'FTNT', 'ZS', 'OKTA', 'S', 'NET', 'DDOG', 'MSFT', 'AMZN', 'GOOGL', 'CRM', 'ORCL', 'NOW', 'VMW', 'TEAM'],
    etfs: ['CLOU', 'SKYY', 'WCLD', 'BUG', 'CIBR', 'HACK', 'IGV'],
    sectorKeywords: ['cloud', 'cyber', 'security', 'saas', 'software', 'enterprise'],
    tickerPatterns: [],
  },
  'Biotech & Healthcare': {
    tickers: ['MRNA', 'PFE', 'MRK', 'AMGN', 'GILD', 'BIIB', 'REGN', 'VRTX', 'ABBV', 'LLY', 'JNJ', 'BMY', 'UNH', 'CVS', 'WBA', 'HUM', 'CI'],
    etfs: ['XLV', 'IBB', 'XBI', 'VHT', 'IHI', 'ARKG', 'LABU', 'LABD'],
    sectorKeywords: ['biotech', 'pharma', 'health', 'medical', 'therapeut', 'oncology', 'genomic'],
    tickerPatterns: [/^BIO/i, /GENE$/i],
  },
  'Clean Energy & EVs': {
    tickers: ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'ENPH', 'FSLR', 'RUN', 'PLUG', 'CHPT', 'QS', 'BE', 'NEE', 'AES', 'SEDG'],
    etfs: ['TAN', 'ICLN', 'QCLN', 'PBW', 'LIT', 'DRIV', 'IDRV', 'KARS'],
    sectorKeywords: ['solar', 'wind', 'renewable', 'electric vehicle', ' ev ', 'hydrogen', 'battery', 'clean energy'],
    tickerPatterns: [/EV$/i, /SOLAR/i],
  },
  'Defense & Aerospace': {
    tickers: ['LMT', 'RTX', 'NOC', 'BA', 'GD', 'LHX', 'HII', 'TXT', 'TDG', 'HEI', 'AXON', 'LDOS', 'KTOS'],
    etfs: ['ITA', 'XAR', 'PPA', 'DFEN', 'UFO', 'ROKT'],
    sectorKeywords: ['defense', 'aerospace', 'military', 'weapon', 'satellite', 'space'],
    tickerPatterns: [],
  },
  'Banks & Financials': {
    tickers: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'COF', 'USB', 'PNC', 'TFC', 'BK', 'STT', 'SPGI', 'MCO'],
    etfs: ['XLF', 'KBE', 'KRE', 'VFH', 'FAS', 'FAZ', 'IYF'],
    sectorKeywords: ['bank', 'financial', 'credit', 'lending', 'insurance', 'asset management'],
    tickerPatterns: [/^BAN[A-Z]/i],
  },
  'Fintech & Crypto': {
    tickers: ['PYPL', 'SQ', 'AFRM', 'SOFI', 'COIN', 'HOOD', 'UPST', 'NU', 'MSTR'],
    etfs: ['FINX', 'ARKF', 'BITO', 'BTF', 'GBTC', 'ETHE'],
    sectorKeywords: ['fintech', 'crypto', 'blockchain', 'bitcoin', 'ethereum', 'digital payment', 'defi'],
    tickerPatterns: [/BTC/i, /ETH/i, /CRYPTO/i],
  },
  'Energy & Oil': {
    tickers: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'DVN', 'OXY', 'MRO', 'MPC', 'VLO', 'PSX', 'HAL', 'BKR', 'OKE', 'WMB', 'KMI'],
    etfs: ['XLE', 'VDE', 'OIH', 'XOP', 'USO', 'UCO', 'SCO', 'ERX', 'ERY'],
    sectorKeywords: ['oil', 'gas', 'petroleum', 'energy', 'drilling', 'pipeline', 'refin'],
    tickerPatterns: [/OIL/i, /GAS/i, /PETRO/i],
  },
  'Real Estate & REITs': {
    tickers: ['PLD', 'AMT', 'CCI', 'EQIX', 'DLR', 'PSA', 'SPG', 'O', 'AVB', 'EQR', 'WELL', 'VTR', 'ARE', 'SUI', 'MAA', 'UDR'],
    etfs: ['VNQ', 'IYR', 'XLRE', 'RWR', 'SCHH', 'REET', 'REM', 'MORT'],
    sectorKeywords: ['reit', 'real estate', 'property', 'realty', 'housing', 'apartment', 'office'],
    tickerPatterns: [],
  },
  'Industrial & Infrastructure': {
    tickers: ['CAT', 'DE', 'HON', 'MMM', 'GE', 'URI', 'PH', 'ITW', 'EMR', 'ROK', 'DOV', 'IR', 'ETN', 'CMI', 'FAST', 'GWW'],
    etfs: ['XLI', 'IYJ', 'VIS', 'PAVE', 'IFRA'],
    sectorKeywords: ['industrial', 'manufacturing', 'infrastructure', 'construction', 'machinery', 'automation'],
    tickerPatterns: [],
  },
  'Commodities & Mining': {
    tickers: ['NEM', 'FCX', 'NUE', 'SCCO', 'GOLD', 'RIO', 'BHP', 'VALE', 'MOS', 'CF', 'AA', 'STLD', 'CLF', 'MP', 'ALB'],
    etfs: ['GLD', 'SLV', 'GDX', 'GDXJ', 'SIL', 'COPX', 'XME', 'REMX', 'DBC', 'DJP'],
    sectorKeywords: ['mining', 'gold', 'silver', 'copper', 'metal', 'steel', 'aluminum', 'lithium'],
    tickerPatterns: [/GOLD/i, /SILV/i, /METAL/i],
  },
  'Retail & E-commerce': {
    tickers: ['AMZN', 'WMT', 'COST', 'TGT', 'HD', 'LOW', 'TJX', 'ROST', 'DG', 'DLTR', 'ETSY', 'EBAY', 'SHOP', 'W', 'CHWY', 'CVNA'],
    etfs: ['XRT', 'XLY', 'RTH', 'IBUY', 'ONLN', 'RETL'],
    sectorKeywords: ['retail', 'e-commerce', 'shop', 'store', 'consumer', 'ecommerce'],
    tickerPatterns: [],
  },
  'Travel & Leisure': {
    tickers: ['DAL', 'UAL', 'LUV', 'AAL', 'BKNG', 'ABNB', 'EXPE', 'MAR', 'HLT', 'H', 'MGM', 'WYNN', 'LVS', 'CCL', 'RCL', 'NCLH'],
    etfs: ['JETS', 'PEJ', 'AWAY', 'CRUZ'],
    sectorKeywords: ['airline', 'hotel', 'travel', 'leisure', 'casino', 'gaming', 'cruise', 'tourism'],
    tickerPatterns: [],
  },
  'Media & Entertainment': {
    tickers: ['NFLX', 'DIS', 'CMCSA', 'WBD', 'PARA', 'FOX', 'SPOT', 'LYV', 'EA', 'TTWO', 'RBLX', 'U', 'ROKU', 'MTCH'],
    etfs: ['XLC', 'NERD', 'HERO', 'ESPO', 'GAMR'],
    sectorKeywords: ['media', 'streaming', 'entertainment', 'movie', 'gaming', 'music', 'content'],
    tickerPatterns: [],
  },
  'Food & Agriculture': {
    tickers: ['KO', 'PEP', 'MDLZ', 'KHC', 'GIS', 'K', 'CPB', 'HRL', 'TSN', 'MCD', 'SBUX', 'CMG', 'YUM', 'DPZ', 'ADM', 'BG', 'NTR', 'CTVA'],
    etfs: ['XLP', 'VDC', 'MOO', 'DBA', 'WEAT', 'CORN', 'SOYB'],
    sectorKeywords: ['food', 'beverage', 'agriculture', 'grocery', 'restaurant', 'farming'],
    tickerPatterns: [],
  },
  'Big Tech & Consumer': {
    tickers: ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NFLX', 'NVDA', 'ADBE', 'CRM', 'INTU', 'PYPL', 'UBER', 'LYFT', 'ABNB', 'SNAP', 'PINS'],
    etfs: ['QQQ', 'XLK', 'VGT', 'TQQQ', 'SQQQ', 'TECL', 'FNGU'],
    sectorKeywords: ['big tech', 'faang', 'social media', 'advertising', 'consumer tech'],
    tickerPatterns: [],
  },
};

function assignTickerToThemes(ticker: string, assetName: string, assetClass: string | null, sector: string | null): string[] {
  const themes: string[] = [];
  const tickerUpper = ticker.toUpperCase();
  const nameLower = (assetName || '').toLowerCase();
  const sectorLower = (sector || '').toLowerCase();
  
  for (const [themeName, config] of Object.entries(THEME_CONFIG)) {
    // 1. Direct ticker match
    if (config.tickers.includes(tickerUpper)) {
      themes.push(themeName);
      continue;
    }
    
    // 2. ETF match
    if (config.etfs.includes(tickerUpper)) {
      themes.push(themeName);
      continue;
    }
    
    // 3. Ticker pattern match
    let matched = false;
    for (const pattern of config.tickerPatterns) {
      if (pattern.test(tickerUpper)) {
        themes.push(themeName);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    
    // 4. Sector/name keyword match
    for (const keyword of config.sectorKeywords) {
      if (nameLower.includes(keyword) || sectorLower.includes(keyword)) {
        themes.push(themeName);
        break;
      }
    }
  }
  
  // Asset class based assignment (important for broad coverage)
  if (assetClass === 'crypto' && !themes.includes('Fintech & Crypto')) {
    themes.push('Fintech & Crypto');
  }
  if (assetClass === 'commodity' && !themes.includes('Commodities & Mining')) {
    themes.push('Commodities & Mining');
  }
  if (assetClass === 'forex') {
    // Forex pairs can span multiple themes based on currency
    if (tickerUpper.includes('JPY') || tickerUpper.includes('CNY') || tickerUpper.includes('SGD')) {
      if (!themes.includes('Big Tech & Consumer')) themes.push('Big Tech & Consumer');
    }
    if (tickerUpper.includes('CAD') || tickerUpper.includes('NOK') || tickerUpper.includes('RUB')) {
      if (!themes.includes('Energy & Oil')) themes.push('Energy & Oil');
    }
    if (tickerUpper.includes('AUD') || tickerUpper.includes('ZAR') || tickerUpper.includes('CLP')) {
      if (!themes.includes('Commodities & Mining')) themes.push('Commodities & Mining');
    }
  }
  
  // ETF asset class - assign based on name patterns  
  if (assetClass === 'etf') {
    const etfThemeMap: [RegExp, string][] = [
      [/tech|software|cyber|cloud/i, 'Cloud & Cybersecurity'],
      [/semi|chip|ai|robot/i, 'AI & Semiconductors'],
      [/health|bio|pharma|medical/i, 'Biotech & Healthcare'],
      [/clean|solar|wind|ev|electric|battery/i, 'Clean Energy & EVs'],
      [/defense|aero|space/i, 'Defense & Aerospace'],
      [/bank|financ|credit/i, 'Banks & Financials'],
      [/crypto|bitcoin|block/i, 'Fintech & Crypto'],
      [/oil|gas|energy|petro/i, 'Energy & Oil'],
      [/real estate|reit|property/i, 'Real Estate & REITs'],
      [/industrial|infra|manufactur/i, 'Industrial & Infrastructure'],
      [/metal|gold|silver|mining|copper/i, 'Commodities & Mining'],
      [/retail|consumer|shop/i, 'Retail & E-commerce'],
      [/travel|airline|hotel|leisure/i, 'Travel & Leisure'],
      [/media|entertain|stream|game/i, 'Media & Entertainment'],
      [/food|agri|farm|beverage/i, 'Food & Agriculture'],
    ];
    
    for (const [pattern, theme] of etfThemeMap) {
      if (pattern.test(nameLower) && !themes.includes(theme)) {
        themes.push(theme);
      }
    }
  }

  // Stock sector-based assignment (for stocks without explicit ticker match)
  if (assetClass === 'stock' && themes.length === 0 && sectorLower) {
    const sectorThemeMap: [RegExp, string][] = [
      [/technology|software|it services/i, 'Big Tech & Consumer'],
      [/semiconductor/i, 'AI & Semiconductors'],
      [/health|pharma|biotech/i, 'Biotech & Healthcare'],
      [/utilities|renewable/i, 'Clean Energy & EVs'],
      [/aerospace|defense/i, 'Defense & Aerospace'],
      [/financial|bank|insurance/i, 'Banks & Financials'],
      [/energy|oil|gas/i, 'Energy & Oil'],
      [/real estate/i, 'Real Estate & REITs'],
      [/industrial|manufacturing/i, 'Industrial & Infrastructure'],
      [/basic material|metal|mining/i, 'Commodities & Mining'],
      [/consumer cyclical|retail/i, 'Retail & E-commerce'],
      [/travel|hotel|airline/i, 'Travel & Leisure'],
      [/communication|media|entertainment/i, 'Media & Entertainment'],
      [/consumer staples|food|beverage/i, 'Food & Agriculture'],
    ];
    
    for (const [pattern, theme] of sectorThemeMap) {
      if (pattern.test(sectorLower)) {
        themes.push(theme);
        break;
      }
    }
  }
  
  // If still no theme, assign to a default based on first letter pattern (spread distribution)
  if (themes.length === 0 && assetClass === 'stock') {
    const firstChar = tickerUpper.charAt(0);
    const charCode = firstChar.charCodeAt(0);
    const themeNames = Object.keys(THEME_CONFIG);
    const themeIndex = (charCode - 65) % themeNames.length; // A=0, B=1, etc.
    if (themeIndex >= 0 && themeIndex < themeNames.length) {
      themes.push(themeNames[themeIndex]);
    }
  }
  
  return themes;
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

    // Get all themes from DB
    const { data: existingThemes, error: themesError } = await supabase
      .from("themes")
      .select("id, name, keywords");

    if (themesError) throw themesError;
    
    const themeNameToId: Record<string, string> = {};
    (existingThemes || []).forEach((t: any) => {
      themeNameToId[t.name] = t.id;
    });

    console.log(`[THEME-SCORING] Found ${existingThemes?.length || 0} themes`);

    // Date ranges
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch ALL signals with pagination (primary source of truth)
    console.log(`[THEME-SCORING] Fetching all signals...`);
    let allSignals: any[] = [];
    let signalOffset = 0;
    const signalBatchSize = 5000;
    
    while (true) {
      const { data: signals, error: signalsError } = await supabase
        .from("signals")
        .select("id, asset_id, signal_type, direction, magnitude, observed_at")
        .gte("observed_at", sevenDaysAgo)
        .range(signalOffset, signalOffset + signalBatchSize - 1)
        .order("observed_at", { ascending: false });
      
      if (signalsError) throw signalsError;
      if (!signals || signals.length === 0) break;
      
      allSignals.push(...signals);
      signalOffset += signals.length;
      
      if (signals.length < signalBatchSize) break;
      if (signalOffset >= 150000) break;
    }
    console.log(`[THEME-SCORING] Loaded ${allSignals.length} signals`);

    // Fetch all assets with sector info
    console.log(`[THEME-SCORING] Fetching all assets...`);
    let allAssets: any[] = [];
    let assetOffset = 0;
    const assetBatchSize = 2000;
    
    while (true) {
      const { data: assets, error: assetsError } = await supabase
        .from("assets")
        .select("id, ticker, name, asset_class, metadata")
        .range(assetOffset, assetOffset + assetBatchSize - 1);
      
      if (assetsError) throw assetsError;
      if (!assets || assets.length === 0) break;
      
      allAssets.push(...assets);
      assetOffset += assets.length;
      
      if (assets.length < assetBatchSize) break;
      if (assetOffset >= 50000) break;
    }
    console.log(`[THEME-SCORING] Loaded ${allAssets.length} assets`);

    // Build asset lookup
    const assetById: Record<string, any> = {};
    allAssets.forEach(a => { assetById[a.id] = a; });

    // Build ticker -> themes mapping for all assets
    const tickerToThemes: Record<string, string[]> = {};
    const assetIdToThemes: Record<string, string[]> = {};
    
    for (const asset of allAssets) {
      const sector = asset.metadata?.sector || asset.metadata?.industry || null;
      const themes = assignTickerToThemes(asset.ticker, asset.name, asset.asset_class, sector);
      tickerToThemes[asset.ticker.toUpperCase()] = themes;
      assetIdToThemes[asset.id] = themes;
    }

    // Count assignments
    let assignedAssets = 0;
    const themeAssetCounts: Record<string, number> = {};
    Object.keys(THEME_CONFIG).forEach(t => { themeAssetCounts[t] = 0; });
    
    for (const [ticker, themes] of Object.entries(tickerToThemes)) {
      if (themes.length > 0) {
        assignedAssets++;
        themes.forEach(t => { themeAssetCounts[t] = (themeAssetCounts[t] || 0) + 1; });
      }
    }
    console.log(`[THEME-SCORING] Assigned ${assignedAssets}/${allAssets.length} assets to themes`);
    console.log(`[THEME-SCORING] Theme distribution:`, themeAssetCounts);

    // Fetch supplementary data
    const [
      darkPoolResult,
      smartMoneyResult,
      congressionalResult,
      patternResult,
      newsResult,
      optionsResult,
      cryptoResult,
      forexSentResult,
      cotResult,
    ] = await Promise.all([
      supabase.from("dark_pool_activity").select("ticker, signal_strength, signal_type").gte("trade_date", thirtyDaysAgo).limit(50000),
      supabase.from("smart_money_flow").select("ticker, smart_money_signal, institutional_net_flow").gte("timestamp", thirtyDaysAgo).limit(50000),
      supabase.from("congressional_trades").select("ticker, transaction_type, amount_min").gte("transaction_date", ninetyDaysAgo).limit(10000),
      supabase.from("pattern_recognition").select("ticker, pattern_type, confidence_score").gte("detected_at", thirtyDaysAgo).limit(50000),
      supabase.from("news_sentiment_aggregate").select("ticker, sentiment_score, buzz_score").gte("date", sevenDaysAgo).limit(30000),
      supabase.from("options_flow").select("ticker, sentiment, flow_type").gte("trade_date", thirtyDaysAgo).limit(50000),
      supabase.from("crypto_onchain_metrics").select("ticker, whale_signal, exchange_flow_signal, fear_greed_index").gte("timestamp", sevenDaysAgo).limit(10000),
      supabase.from("forex_sentiment").select("ticker, retail_sentiment, news_sentiment_score").gte("timestamp", sevenDaysAgo).limit(5000),
      supabase.from("cot_reports").select("ticker, sentiment, noncommercial_net").limit(5000),
    ]);

    // Build ticker -> data maps
    const buildTickerMap = (data: any[] | null): Map<string, any[]> => {
      const map = new Map<string, any[]>();
      (data || []).forEach(item => {
        const ticker = (item.ticker || '').toUpperCase();
        if (!map.has(ticker)) map.set(ticker, []);
        map.get(ticker)!.push(item);
      });
      return map;
    };

    const darkPoolMap = buildTickerMap(darkPoolResult.data);
    const smartMoneyMap = buildTickerMap(smartMoneyResult.data);
    const congressMap = buildTickerMap(congressionalResult.data);
    const patternMap = buildTickerMap(patternResult.data);
    const newsMap = buildTickerMap(newsResult.data);
    const optionsMap = buildTickerMap(optionsResult.data);
    const cryptoMap = buildTickerMap(cryptoResult.data);
    const forexSentMap = buildTickerMap(forexSentResult.data);
    const cotMap = buildTickerMap(cotResult.data);

    // Initialize theme scores
    const themeScores: Record<string, {
      components: ComponentScores;
      counts: Record<string, number>;
      signals: Set<string>;
      assets: Set<string>;
    }> = {};

    for (const themeName of Object.keys(THEME_CONFIG)) {
      themeScores[themeName] = {
        components: {
          BigMoneyConfirm: 0, FlowPressure: 0, TechEdge: 0, Attention: 0,
          PolicyMomentum: 0, InsiderPoliticianConfirm: 0, CapexMomentum: 0, RiskFlags: 0
        },
        counts: {},
        signals: new Set(),
        assets: new Set(),
      };
    }

    // Process all signals and map to themes
    console.log(`[THEME-SCORING] Processing ${allSignals.length} signals...`);
    
    for (const signal of allSignals) {
      const themes = assetIdToThemes[signal.asset_id] || [];
      if (themes.length === 0) continue;

      const asset = assetById[signal.asset_id];
      if (!asset) continue;

      const ticker = asset.ticker.toUpperCase();
      
      for (const themeName of themes) {
        const ts = themeScores[themeName];
        if (!ts) continue;

        ts.signals.add(signal.id);
        ts.assets.add(signal.asset_id);

        // Map signal type to component
        const signalType = signal.signal_type || '';
        const direction = signal.direction || 'neutral';
        const magnitude = signal.magnitude || 0.5;
        const dirMultiplier = direction === 'up' ? 1 : direction === 'down' ? -1 : 0;
        const baseScore = 50 + (dirMultiplier * magnitude * 50);

        if (signalType.includes('technical') || signalType.includes('chart') || signalType.includes('pattern')) {
          ts.components.TechEdge += baseScore;
          ts.counts.TechEdge = (ts.counts.TechEdge || 0) + 1;
        }
        if (signalType.includes('flow') || signalType.includes('etf')) {
          ts.components.FlowPressure += baseScore;
          ts.counts.FlowPressure = (ts.counts.FlowPressure || 0) + 1;
        }
        if (signalType.includes('dark_pool') || signalType.includes('smart_money') || signalType.includes('bigmoney')) {
          ts.components.BigMoneyConfirm += baseScore;
          ts.counts.BigMoneyConfirm = (ts.counts.BigMoneyConfirm || 0) + 1;
        }
        if (signalType.includes('sentiment') || signalType.includes('social') || signalType.includes('news')) {
          ts.components.Attention += baseScore;
          ts.counts.Attention = (ts.counts.Attention || 0) + 1;
        }
        if (signalType.includes('policy') || signalType.includes('economic')) {
          ts.components.PolicyMomentum += baseScore;
          ts.counts.PolicyMomentum = (ts.counts.PolicyMomentum || 0) + 1;
        }
        if (signalType.includes('crypto') || signalType.includes('whale')) {
          ts.components.BigMoneyConfirm += baseScore;
          ts.counts.BigMoneyConfirm = (ts.counts.BigMoneyConfirm || 0) + 1;
        }
        if (signalType.includes('cot') || signalType.includes('positioning')) {
          ts.components.InsiderPoliticianConfirm += baseScore;
          ts.counts.InsiderPoliticianConfirm = (ts.counts.InsiderPoliticianConfirm || 0) + 1;
        }
      }
    }

    // Add supplementary data directly to theme scores
    for (const themeName of Object.keys(THEME_CONFIG)) {
      const config = THEME_CONFIG[themeName];
      const ts = themeScores[themeName];
      
      // Check all theme tickers and ETFs for supplementary data
      const allThemeTickers = [...config.tickers, ...config.etfs];
      
      for (const ticker of allThemeTickers) {
        // Dark pool
        const dp = darkPoolMap.get(ticker) || [];
        if (dp.length > 0) {
          let score = 50;
          dp.slice(0, 5).forEach(d => {
            if (d.signal_type === 'accumulation') score += d.signal_strength === 'strong' ? 12 : 6;
            if (d.signal_type === 'distribution') score -= d.signal_strength === 'strong' ? 12 : 6;
          });
          ts.components.BigMoneyConfirm += Math.max(0, Math.min(100, score));
          ts.counts.BigMoneyConfirm = (ts.counts.BigMoneyConfirm || 0) + 1;
        }

        // Smart money
        const sm = smartMoneyMap.get(ticker) || [];
        if (sm.length > 0) {
          let score = 50;
          if (sm[0].smart_money_signal === 'bullish') score += 15;
          if (sm[0].smart_money_signal === 'bearish') score -= 15;
          ts.components.BigMoneyConfirm += Math.max(0, Math.min(100, score));
          ts.counts.BigMoneyConfirm = (ts.counts.BigMoneyConfirm || 0) + 1;
        }

        // Congressional
        const cg = congressMap.get(ticker) || [];
        if (cg.length > 0) {
          let score = 50;
          cg.forEach(c => {
            const weight = (c.amount_min || 0) > 100000 ? 2 : 1;
            if (c.transaction_type === 'purchase') score += 8 * weight;
            if (c.transaction_type === 'sale') score -= 5 * weight;
          });
          ts.components.InsiderPoliticianConfirm += Math.max(0, Math.min(100, score));
          ts.counts.InsiderPoliticianConfirm = (ts.counts.InsiderPoliticianConfirm || 0) + 1;
        }

        // Patterns
        const pt = patternMap.get(ticker) || [];
        if (pt.length > 0) {
          let score = 50;
          pt.slice(0, 3).forEach(p => {
            const conf = p.confidence_score || 0.5;
            if ((p.pattern_type || '').toLowerCase().includes('bullish')) score += 10 * conf;
            if ((p.pattern_type || '').toLowerCase().includes('bearish')) score -= 10 * conf;
          });
          ts.components.TechEdge += Math.max(0, Math.min(100, score));
          ts.counts.TechEdge = (ts.counts.TechEdge || 0) + 1;
        }

        // News sentiment
        const ns = newsMap.get(ticker) || [];
        if (ns.length > 0) {
          let score = 50 + (ns[0].sentiment_score || 0) * 40;
          if (ns[0].buzz_score > 50) score += 5;
          ts.components.Attention += Math.max(0, Math.min(100, score));
          ts.counts.Attention = (ts.counts.Attention || 0) + 1;
        }

        // Options flow
        const of = optionsMap.get(ticker) || [];
        if (of.length > 0) {
          let score = 50;
          of.slice(0, 10).forEach(o => {
            if (o.sentiment === 'bullish') score += 4;
            if (o.sentiment === 'bearish') score -= 4;
          });
          ts.components.FlowPressure += Math.max(0, Math.min(100, score));
          ts.counts.FlowPressure = (ts.counts.FlowPressure || 0) + 1;
        }

        // Crypto
        const cr = cryptoMap.get(ticker) || [];
        if (cr.length > 0) {
          let score = 50;
          if (cr[0].whale_signal === 'accumulation') score += 15;
          if (cr[0].whale_signal === 'distribution') score -= 15;
          if (cr[0].exchange_flow_signal === 'bullish') score += 10;
          ts.components.BigMoneyConfirm += Math.max(0, Math.min(100, score));
          ts.counts.BigMoneyConfirm = (ts.counts.BigMoneyConfirm || 0) + 1;
        }

        // COT
        const ct = cotMap.get(ticker) || [];
        if (ct.length > 0) {
          let score = 50;
          if (ct[0].sentiment === 'bullish') score += 12;
          if (ct[0].sentiment === 'bearish') score -= 12;
          ts.components.InsiderPoliticianConfirm += Math.max(0, Math.min(100, score));
          ts.counts.InsiderPoliticianConfirm = (ts.counts.InsiderPoliticianConfirm || 0) + 1;
        }
      }
    }

    // Calculate final scores and create mappings
    const signalThemeMappings: { signal_id: string; theme_id: string; relevance_score: number }[] = [];
    const results: any[] = [];

    for (const [themeName, ts] of Object.entries(themeScores)) {
      const themeId = themeNameToId[themeName];
      if (!themeId) continue;

      // Normalize components
      const normalizedComponents: ComponentScores = {
        BigMoneyConfirm: 0, FlowPressure: 0, TechEdge: 0, Attention: 0,
        PolicyMomentum: 0, InsiderPoliticianConfirm: 0, CapexMomentum: 0, RiskFlags: 0
      };

      for (const [comp, rawScore] of Object.entries(ts.components)) {
        const count = ts.counts[comp] || 1;
        normalizedComponents[comp as keyof ComponentScores] = Math.round(rawScore / count);
      }

      // Calculate weighted score
      let totalWeight = 0;
      let weightedSum = 0;
      for (const [comp, score] of Object.entries(normalizedComponents)) {
        const weight = WEIGHTS[comp] || 0.5;
        if (score > 0) {
          weightedSum += score * weight;
          totalWeight += weight;
        }
      }
      const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

      // Create signal-theme mappings
      for (const signalId of ts.signals) {
        signalThemeMappings.push({
          signal_id: signalId,
          theme_id: themeId,
          relevance_score: 0.8,
        });
      }

      results.push({
        theme_id: themeId,
        theme_name: themeName,
        score: finalScore,
        components: normalizedComponents,
        signal_count: ts.signals.size,
        asset_count: ts.assets.size,
      });
    }

    console.log(`[THEME-SCORING] Creating ${signalThemeMappings.length} signal-theme mappings...`);

    // Clear old mappings and insert new ones in batches
    await supabase.from("signal_theme_map").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const mappingBatchSize = 1000;
    for (let i = 0; i < signalThemeMappings.length; i += mappingBatchSize) {
      const batch = signalThemeMappings.slice(i, i + mappingBatchSize);
      await supabase.from("signal_theme_map").insert(batch);
    }

    // Update theme_scores table
    for (const result of results) {
      const positives = Object.entries(result.components)
        .filter(([_, v]) => (v as number) >= 60)
        .map(([k]) => k);

      await supabase.from("theme_scores").upsert({
        theme_id: result.theme_id,
        score: result.score,
        component_scores: result.components,
        positive_components: positives,
        signal_count: result.signal_count,
        computed_at: new Date().toISOString(),
      }, { onConflict: "theme_id" });

      // Update theme score
      await supabase.from("themes").update({ score: result.score }).eq("id", result.theme_id);
    }

    // Log status
    const duration = Date.now() - startTime;
    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "success",
      executed_at: new Date().toISOString(),
      rows_inserted: signalThemeMappings.length,
      duration_ms: duration,
      metadata: {
        themes_processed: results.length,
        total_signals: allSignals.length,
        total_assets: allAssets.length,
        assigned_assets: assignedAssets,
      },
    });

    console.log(`[THEME-SCORING] Complete in ${duration}ms. Processed ${results.length} themes.`);

    return new Response(JSON.stringify({
      success: true,
      themes: results.map(r => ({
        name: r.theme_name,
        score: r.score,
        signals: r.signal_count,
        assets: r.asset_count,
      })),
      mappings_created: signalThemeMappings.length,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[THEME-SCORING] Error:", error);
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "error",
      executed_at: new Date().toISOString(),
      error_message: (error as Error).message,
    });

    return new Response(JSON.stringify({ 
      success: false, 
      error: (error as Error).message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
