import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// THEME SCORING ENGINE - 17 CORE SECTOR THEMES ONLY
// ============================================================================

// Theme patterns for asset-to-theme mapping - ONLY the 17 active themes
const THEME_PATTERNS: Record<string, {
  tickers: string[];
  etfPatterns: RegExp[];
  namePatterns: RegExp[];
  sectorKeywords: string[];
}> = {
  "AI & Semiconductors": {
    tickers: ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "MU", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "MRVL", "TXN", "ADI", "NXPI", "ON", "MCHP", "SWKS", "QRVO", "ARM", "SMCI", "SNPS", "CDNS"],
    etfPatterns: [/semicon/i, /chip/i, /\bai\b/i, /artificial/i, /robot/i, /smh/i, /soxx/i, /soxq/i],
    namePatterns: [/semiconductor/i, /artificial intelligence/i, /machine learning/i, /neural/i, /gpu/i, /processor/i, /chip/i, /foundry/i],
    sectorKeywords: ["semiconductor", "chips", "artificial intelligence", "machine learning", "gpu", "processor"]
  },
  "Banks & Financials": {
    tickers: ["JPM", "BAC", "WFC", "C", "GS", "MS", "USB", "PNC", "TFC", "SCHW", "BLK", "AXP", "SPGI", "CME", "ICE", "BK", "STT", "COF", "DFS", "AIG", "MET", "PRU", "ALL", "TRV"],
    etfPatterns: [/bank/i, /financ/i, /xlf/i, /vfh/i, /kbe/i, /kre/i, /iai/i, /kie/i, /insurance/i],
    namePatterns: [/bank/i, /financial/i, /capital/i, /investment/i, /credit/i, /lending/i, /insurance/i, /asset management/i, /wealth/i],
    sectorKeywords: ["bank", "financial", "investment", "insurance", "credit", "mortgage", "wealth management", "capital markets"]
  },
  "Big Tech & Consumer": {
    tickers: ["AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "CRM", "ADBE", "ORCL", "IBM", "CSCO", "SAP", "NOW", "INTU", "SNOW", "DDOG", "ZS", "CRWD", "UBER", "LYFT"],
    etfPatterns: [/tech/i, /qqq/i, /nasdaq/i, /growth/i, /innovation/i, /xlk/i, /vgt/i, /ftec/i, /igv/i],
    namePatterns: [/technology/i, /software/i, /internet/i, /digital/i, /e-commerce/i, /cloud/i, /saas/i, /platform/i],
    sectorKeywords: ["technology", "software", "internet", "digital", "big tech", "platform", "enterprise"]
  },
  "Biotech & Healthcare": {
    tickers: ["JNJ", "UNH", "PFE", "MRK", "ABBV", "LLY", "TMO", "DHR", "BMY", "AMGN", "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ISRG", "SYK", "MDT", "ABT", "ZTS", "CVS", "CI", "HUM", "ELV"],
    etfPatterns: [/health/i, /biotech/i, /pharma/i, /med/i, /xbi/i, /ibb/i, /xlv/i, /vht/i, /fbt/i, /drug/i, /genomic/i],
    namePatterns: [/healthcare/i, /biotech/i, /pharmaceutical/i, /medical/i, /therapeutic/i, /clinical/i, /hospital/i, /medicine/i, /vaccine/i, /oncology/i, /diagnostic/i],
    sectorKeywords: ["healthcare", "biotech", "pharmaceutical", "medical", "hospital", "drug", "therapeutics", "diagnostics"]
  },
  "Clean Energy & EVs": {
    tickers: ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI", "ENPH", "SEDG", "FSLR", "PLUG", "BE", "CHPT", "BLNK", "NEE", "AES", "CEG", "VST", "RUN", "NOVA", "STEM", "HYLN"],
    etfPatterns: [/clean/i, /solar/i, /wind/i, /renew/i, /green/i, /\bev\b/i, /electric/i, /icln/i, /qcln/i, /tan/i, /fan/i, /lit/i, /driv/i, /battery/i],
    namePatterns: [/clean energy/i, /renewable/i, /solar/i, /wind/i, /electric vehicle/i, /battery/i, /sustainable/i, /green/i, /lithium/i, /hydrogen/i, /fuel cell/i],
    sectorKeywords: ["clean energy", "renewable", "solar", "wind", "electric", "battery", "sustainable", "ev", "hydrogen"]
  },
  "Cloud & Cybersecurity": {
    tickers: ["PANW", "CRWD", "ZS", "FTNT", "NET", "OKTA", "S", "CYBR", "TENB", "VRNS", "QLYS", "RPD", "AKAM", "SAIC", "LDOS", "SPLK", "ESTC", "MDB", "DDOG", "SNOW"],
    etfPatterns: [/cyber/i, /cloud/i, /security/i, /hack/i, /cibr/i, /bug/i, /wcld/i, /skyy/i, /clou/i],
    namePatterns: [/cybersecurity/i, /cloud computing/i, /network security/i, /firewall/i, /encryption/i, /data protection/i, /identity/i, /zero trust/i],
    sectorKeywords: ["cybersecurity", "cloud", "security", "network", "data protection", "saas", "infrastructure"]
  },
  "Commodities & Mining": {
    tickers: ["FCX", "NEM", "GOLD", "BHP", "RIO", "VALE", "NUE", "STLD", "CLF", "AA", "SCCO", "TECK", "WPM", "FNV", "RGLD", "PAAS", "HL", "AG"],
    etfPatterns: [/gold/i, /silver/i, /metal/i, /mining/i, /commod/i, /gdx/i, /gdxj/i, /slv/i, /gld/i, /iau/i, /dbc/i, /dba/i, /cper/i, /steel/i],
    namePatterns: [/gold/i, /silver/i, /mining/i, /metal/i, /commodity/i, /copper/i, /platinum/i, /palladium/i, /iron/i, /steel/i, /aluminum/i, /zinc/i, /nickel/i],
    sectorKeywords: ["gold", "silver", "mining", "metal", "commodity", "steel", "copper", "aluminum", "iron ore"]
  },
  "Defense & Aerospace": {
    tickers: ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "TDG", "HII", "LDOS", "SAIC", "KTOS", "PLTR", "AXON", "RKLB", "LUNR", "ASTR", "SPR"],
    etfPatterns: [/defense/i, /aerospace/i, /space/i, /military/i, /ita/i, /xar/i, /ppa/i, /dfen/i, /ufo/i],
    namePatterns: [/defense/i, /aerospace/i, /military/i, /weapons/i, /aviation/i, /satellite/i, /rocket/i, /space/i, /drone/i],
    sectorKeywords: ["defense", "aerospace", "military", "weapons", "aviation", "space", "satellite", "government contractor"]
  },
  "Energy & Oil": {
    tickers: ["XOM", "CVX", "COP", "SLB", "EOG", "PXD", "MPC", "VLO", "PSX", "OXY", "HAL", "DVN", "BKR", "FANG", "HES", "OKE", "WMB", "KMI", "ET", "LNG"],
    etfPatterns: [/oil/i, /gas/i, /energy(?!.*clean)/i, /petro/i, /xle/i, /vde/i, /oih/i, /xop/i, /uso/i, /ung/i, /mlp/i],
    namePatterns: [/oil/i, /gas/i, /petroleum/i, /crude/i, /natural gas/i, /pipeline/i, /drilling/i, /refin/i, /fossil/i, /lng/i],
    sectorKeywords: ["oil", "gas", "petroleum", "energy", "pipeline", "drilling", "refining", "lng"]
  },
  "Fintech & Crypto": {
    tickers: ["V", "MA", "PYPL", "SQ", "COIN", "MSTR", "HOOD", "SOFI", "AFRM", "UPST", "NU", "BILL", "TOST", "GPN", "FIS", "FISV", "ADP", "PAYX", "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK", "UNI", "LTC", "BNB"],
    etfPatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital asset/i, /arkf/i, /gbtc/i, /bito/i, /blok/i, /bitq/i, /btc/i, /eth/i, /payment/i],
    namePatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital payment/i, /mobile payment/i, /defi/i, /ethereum/i, /forex/i, /currency/i],
    sectorKeywords: ["fintech", "crypto", "blockchain", "digital payment", "cryptocurrency", "forex", "currency", "payments"]
  },
  "Food & Agriculture": {
    tickers: ["ADM", "BG", "CTVA", "FMC", "DE", "AGCO", "MOS", "NTR", "CF", "TSN", "HRL", "GIS", "K", "KHC", "MDLZ", "HSY", "CAG", "SJM", "CPB", "KO", "PEP", "MNST"],
    etfPatterns: [/agri/i, /food/i, /farm/i, /crop/i, /grain/i, /corn/i, /wheat/i, /soy/i, /dba/i, /cow/i, /vegi/i, /moo/i],
    namePatterns: [/agriculture/i, /food/i, /farm/i, /crop/i, /grain/i, /livestock/i, /fertilizer/i, /seed/i, /meat/i, /dairy/i, /beverage/i, /packaged food/i, /snack/i],
    sectorKeywords: ["agriculture", "food", "farm", "crop", "grain", "fertilizer", "livestock", "beverage", "packaged food"]
  },
  "Industrial & Infrastructure": {
    tickers: ["CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "RTX", "MMM", "ETN", "EMR", "ITW", "PH", "ROK", "CMI", "PCAR", "WM", "RSG", "CNI", "NSC", "CSX"],
    etfPatterns: [/industrial/i, /infrastr/i, /construct/i, /xli/i, /vir/i, /pave/i, /ifra/i, /transport/i, /railroad/i],
    namePatterns: [/industrial/i, /infrastructure/i, /manufacturing/i, /construction/i, /machinery/i, /equipment/i, /engineering/i, /transport/i, /railroad/i, /logistics/i],
    sectorKeywords: ["industrial", "infrastructure", "manufacturing", "construction", "machinery", "transportation", "logistics"]
  },
  "International & Emerging": {
    tickers: ["EFA", "VEA", "IEFA", "EEM", "VWO", "IEMG", "VXUS", "IXUS", "EWJ", "FXI", "EWZ", "EWT", "EWY", "INDA", "KWEB", "MCHI", "BABA", "JD", "PDD", "SE"],
    etfPatterns: [/international/i, /emerging/i, /global/i, /foreign/i, /ex.?u\.?s/i, /europe/i, /asia/i, /china/i, /japan/i, /india/i, /brazil/i, /eafe/i, /acwi/i],
    namePatterns: [/international/i, /emerging market/i, /global/i, /foreign/i, /developed market/i, /world/i, /ex-us/i, /china/i, /asia/i, /europe/i],
    sectorKeywords: ["international", "emerging", "global", "foreign", "world", "developed markets", "asia", "europe", "china"]
  },
  "Media & Entertainment": {
    tickers: ["DIS", "NFLX", "CMCSA", "WBD", "PARA", "FOX", "FOXA", "SPOT", "ROKU", "TTD", "MGNI", "PUBM", "ZD", "TTWO", "EA", "RBLX", "U", "ATVI", "GOOGL", "META"],
    etfPatterns: [/media/i, /entertain/i, /stream/i, /gaming/i, /esport/i, /pej/i, /gamr/i, /espo/i, /socl/i],
    namePatterns: [/media/i, /entertainment/i, /streaming/i, /broadcast/i, /content/i, /gaming/i, /video game/i, /esport/i, /movie/i, /film/i, /music/i, /podcast/i, /advertising/i],
    sectorKeywords: ["media", "entertainment", "streaming", "broadcast", "gaming", "movie", "music", "advertising"]
  },
  "Real Estate & REITs": {
    tickers: ["AMT", "PLD", "EQIX", "PSA", "CCI", "DLR", "O", "SPG", "WELL", "AVB", "EQR", "VTR", "ARE", "MAA", "UDR", "ESS", "INVH", "SBAC", "WY"],
    etfPatterns: [/reit/i, /real estate/i, /property/i, /xlre/i, /vnq/i, /iyr/i, /schh/i, /usrt/i, /rem/i, /mort/i, /housing/i],
    namePatterns: [/reit/i, /real estate/i, /property/i, /housing/i, /apartment/i, /commercial property/i, /mortgage/i, /residential/i, /data center/i, /warehouse/i],
    sectorKeywords: ["reit", "real estate", "property", "housing", "mortgage", "apartment", "commercial", "industrial property"]
  },
  "Retail & E-commerce": {
    tickers: ["WMT", "COST", "TGT", "HD", "LOW", "AMZN", "EBAY", "ETSY", "W", "SHOP", "MELI", "JD", "BABA", "PDD", "SE", "DG", "DLTR", "TJX", "ROST", "BBY", "ULTA", "LULU"],
    etfPatterns: [/retail/i, /consumer/i, /e-?commerce/i, /xrt/i, /xly/i, /ibuy/i, /onln/i, /shop/i],
    namePatterns: [/retail/i, /consumer/i, /e-commerce/i, /shopping/i, /department store/i, /discount/i, /online retail/i, /marketplace/i, /apparel/i],
    sectorKeywords: ["retail", "consumer", "e-commerce", "shopping", "department store", "discount", "apparel"]
  },
  "Travel & Leisure": {
    tickers: ["MAR", "HLT", "H", "ABNB", "BKNG", "EXPE", "DAL", "UAL", "LUV", "AAL", "ALK", "CCL", "RCL", "NCLH", "DIS", "CMCSA", "LYV", "MTN", "SIX", "FUN", "WYNN", "LVS", "MGM"],
    etfPatterns: [/travel/i, /leisure/i, /hotel/i, /airline/i, /cruise/i, /jets/i, /away/i, /pej/i, /casino/i, /gaming/i],
    namePatterns: [/travel/i, /hotel/i, /airline/i, /cruise/i, /resort/i, /vacation/i, /tourism/i, /hospitality/i, /entertainment/i, /casino/i, /gaming/i, /theme park/i],
    sectorKeywords: ["travel", "hotel", "airline", "cruise", "resort", "tourism", "leisure", "casino", "hospitality"]
  }
};

// ============================================================================
// SIGNAL TYPE → THEME MAPPING (Only valid 17 themes)
// ============================================================================
const SIGNAL_TYPE_TO_THEMES: Record<string, { themes: string[]; weights: number[] }> = {
  // --- 13F Holdings ---
  "filing_13f_new": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "filing_13f_increase": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "filing_13f_decrease": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "13f_new_position": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "13f_increase": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "13f_decrease": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  
  // --- Form4 Insider ---
  "insider_buy": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "insider_sell": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "form4_buy": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "form4_sell": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- Congressional Trades ---
  "politician_buy": { themes: ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"], weights: [0.4, 0.3, 0.3] },
  "politician_sell": { themes: ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"], weights: [0.4, 0.3, 0.3] },
  "congressional_buy": { themes: ["Defense & Aerospace", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "congressional_sell": { themes: ["Defense & Aerospace", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- ETF Flows (now mapped to valid themes) ---
  "flow_pressure_etf": { themes: ["Big Tech & Consumer", "Banks & Financials", "AI & Semiconductors"], weights: [0.4, 0.3, 0.3] },
  "etf_inflow": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "etf_outflow": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "flow_pressure": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- Options Flow ---
  "options_unusual": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "unusual_options": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "options_sweep": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "options_block": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- Dark Pool ---
  "darkpool_block": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "dark_pool_activity": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "darkpool_accumulation": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "darkpool_distribution": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- Short Interest ---
  "short_squeeze": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "short_interest_high": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "short_interest_low": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- Policy ---
  "policy_keyword": { themes: ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  "policy_mention": { themes: ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  "policy_approval": { themes: ["Banks & Financials", "Clean Energy & EVs"], weights: [0.5, 0.5] },
  "policy_rejection": { themes: ["Banks & Financials", "Clean Energy & EVs"], weights: [0.5, 0.5] },
  
  // --- Breaking News ---
  "news_mention": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "breaking_news": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  "news_alert": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  
  // --- Sentiment ---
  "sentiment_shift": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  "sentiment_bullish": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "sentiment_bearish": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "sentiment_extreme": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- Social ---
  "social_mention": { themes: ["Fintech & Crypto", "Media & Entertainment", "Big Tech & Consumer"], weights: [0.4, 0.3, 0.3] },
  "social_bullish": { themes: ["Fintech & Crypto", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "social_bearish": { themes: ["Fintech & Crypto", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "reddit_mention": { themes: ["Fintech & Crypto", "Media & Entertainment"], weights: [0.5, 0.5] },
  "stocktwits_mention": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- Search Trends ---
  "search_interest": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  "search_spike": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  "trending_topic": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  
  // --- Earnings ---
  "earnings_surprise": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "earnings_beat": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "earnings_miss": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "revenue_surprise": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- Job Postings ---
  "capex_hiring": { themes: ["AI & Semiconductors", "Big Tech & Consumer", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  "hiring_surge": { themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "job_growth": { themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- Patents ---
  "patent_filed": { themes: ["AI & Semiconductors", "Biotech & Healthcare", "Clean Energy & EVs"], weights: [0.4, 0.3, 0.3] },
  "patent_granted": { themes: ["AI & Semiconductors", "Biotech & Healthcare"], weights: [0.5, 0.5] },
  "innovation_signal": { themes: ["AI & Semiconductors", "Biotech & Healthcare"], weights: [0.5, 0.5] },
  
  // --- COT Reports ---
  "cot_positioning": { themes: ["Commodities & Mining", "Fintech & Crypto", "Energy & Oil"], weights: [0.4, 0.3, 0.3] },
  "cot_bullish": { themes: ["Commodities & Mining", "Energy & Oil"], weights: [0.5, 0.5] },
  "cot_bearish": { themes: ["Commodities & Mining", "Energy & Oil"], weights: [0.5, 0.5] },
  "commercial_positioning": { themes: ["Commodities & Mining", "Energy & Oil"], weights: [0.5, 0.5] },
  
  // --- Crypto ---
  "onchain_whale": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "crypto_whale_activity": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "crypto_exchange_flow": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "whale_accumulation": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "whale_distribution": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "exchange_inflow": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "exchange_outflow": { themes: ["Fintech & Crypto"], weights: [1.0] },
  
  // --- Forex (mapped to Fintech & Crypto for currency trading) ---
  "forex_sentiment": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  "forex_bullish": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  "forex_bearish": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  "retail_positioning": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "forex_technical": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  "forex_breakout": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  "forex_breakdown": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  
  // --- Technical Signals ---
  "technical_signal": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "technical_breakout": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "technical_breakdown": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "support_bounce": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "resistance_break": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "vwap_signal": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "stochastic_signal": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- Pattern Recognition ---
  "pattern_detected": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "bullish_pattern": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "bearish_pattern": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "reversal_pattern": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "continuation_pattern": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- Economic/Macro ---
  "macro_event": { themes: ["Banks & Financials", "International & Emerging", "Fintech & Crypto"], weights: [0.4, 0.3, 0.3] },
  "fed_decision": { themes: ["Banks & Financials", "Real Estate & REITs"], weights: [0.6, 0.4] },
  "gdp_release": { themes: ["Banks & Financials", "Industrial & Infrastructure"], weights: [0.5, 0.5] },
  "inflation_data": { themes: ["Banks & Financials", "Real Estate & REITs"], weights: [0.6, 0.4] },
  "employment_data": { themes: ["Banks & Financials", "Retail & E-commerce"], weights: [0.5, 0.5] },
  "macro_indicator": { themes: ["Banks & Financials", "Real Estate & REITs"], weights: [0.6, 0.4] },
  "interest_rate_change": { themes: ["Banks & Financials", "Real Estate & REITs"], weights: [0.6, 0.4] },
  "yield_curve_signal": { themes: ["Banks & Financials"], weights: [1.0] },
  "economic_indicator": { themes: ["Banks & Financials", "Industrial & Infrastructure"], weights: [0.5, 0.5] },
  
  // --- Supply Chain ---
  "supply_chain": { themes: ["AI & Semiconductors", "Clean Energy & EVs", "Industrial & Infrastructure"], weights: [0.4, 0.3, 0.3] },
  "supply_disruption": { themes: ["Industrial & Infrastructure", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "supply_recovery": { themes: ["Industrial & Infrastructure", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- Smart Money ---
  "smart_money": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "smart_money_flow": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "institutional_buying": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "institutional_selling": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- AI Research ---
  "ai_insight": { themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "ai_recommendation": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "ai_analysis": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- Generic ---
  "price_alert": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "volume_spike": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "momentum_shift": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "trend_change": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "volatility_spike": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
};

// ============================================================================
// DIRECT DATA SOURCE CONFIGS (Only valid 17 themes)
// ============================================================================
interface DataSourceConfig {
  table: string;
  tickerColumn: string;
  dateColumn: string;
  directionField?: string;
  magnitudeField?: string;
  themes: string[];
  weights: number[];
}

const DATA_SOURCE_CONFIGS: DataSourceConfig[] = [
  { table: 'dark_pool_activity', tickerColumn: 'ticker', dateColumn: 'trade_date', directionField: 'signal_type', magnitudeField: 'dark_pool_percentage', themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  { table: 'congressional_trades', tickerColumn: 'ticker', dateColumn: 'transaction_date', directionField: 'transaction_type', magnitudeField: 'amount_max', themes: ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"], weights: [0.4, 0.3, 0.3] },
  { table: 'options_flow', tickerColumn: 'ticker', dateColumn: 'trade_date', directionField: 'sentiment', magnitudeField: 'premium', themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  { table: 'short_interest', tickerColumn: 'ticker', dateColumn: 'report_date', magnitudeField: 'float_percentage', themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  { table: 'cot_reports', tickerColumn: 'ticker', dateColumn: 'report_date', directionField: 'sentiment', magnitudeField: 'noncommercial_net', themes: ["Commodities & Mining", "Energy & Oil", "Fintech & Crypto"], weights: [0.4, 0.3, 0.3] },
  { table: 'crypto_onchain_metrics', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'whale_signal', magnitudeField: 'exchange_net_flow', themes: ["Fintech & Crypto"], weights: [1.0] },
  { table: 'forex_sentiment', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'retail_sentiment', magnitudeField: 'news_sentiment_score', themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  { table: 'forex_technicals', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'rsi_signal', themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  { table: 'advanced_technicals', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'breakout_signal', magnitudeField: 'adx', themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  { table: 'news_sentiment_aggregate', tickerColumn: 'ticker', dateColumn: 'date', directionField: 'sentiment_label', magnitudeField: 'sentiment_score', themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  { table: 'earnings_sentiment', tickerColumn: 'ticker', dateColumn: 'earnings_date', magnitudeField: 'earnings_surprise', themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  { table: 'job_postings', tickerColumn: 'ticker', dateColumn: 'posted_date', magnitudeField: 'growth_indicator', themes: ["AI & Semiconductors", "Big Tech & Consumer", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  { table: 'patent_filings', tickerColumn: 'ticker', dateColumn: 'filing_date', themes: ["AI & Semiconductors", "Biotech & Healthcare", "Clean Energy & EVs"], weights: [0.4, 0.3, 0.3] },
  { table: 'supply_chain_signals', tickerColumn: 'ticker', dateColumn: 'report_date', magnitudeField: 'change_percentage', themes: ["AI & Semiconductors", "Clean Energy & EVs", "Industrial & Infrastructure"], weights: [0.4, 0.3, 0.3] },
  { table: 'breaking_news', tickerColumn: 'ticker', dateColumn: 'published_at', magnitudeField: 'sentiment_score', themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  { table: 'ai_research_reports', tickerColumn: 'ticker', dateColumn: 'generated_at', magnitudeField: 'confidence_score', themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  { table: 'economic_indicators', tickerColumn: 'indicator_type', dateColumn: 'release_date', directionField: 'impact', themes: ["Banks & Financials", "Real Estate & REITs", "International & Emerging"], weights: [0.4, 0.3, 0.3] },
];

// Comprehensive SECTOR → THEME mapping (covers all 26k+ enriched assets)
const SECTOR_TO_THEME: Record<string, { themes: string[]; weights: number[] }> = {
  // Primary sector mappings (exact match)
  "financial services": { themes: ["Banks & Financials"], weights: [1.0] },
  "technology": { themes: ["Big Tech & Consumer", "Cloud & Cybersecurity", "AI & Semiconductors"], weights: [0.4, 0.35, 0.25] },
  "cryptocurrency": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "biotechnology": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "mining & metals": { themes: ["Commodities & Mining"], weights: [1.0] },
  "currency": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  "oil & gas": { themes: ["Energy & Oil"], weights: [1.0] },
  "semiconductors": { themes: ["AI & Semiconductors"], weights: [1.0] },
  "healthcare": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "banks": { themes: ["Banks & Financials"], weights: [1.0] },
  "real estate": { themes: ["Real Estate & REITs"], weights: [1.0] },
  "food & beverage": { themes: ["Food & Agriculture"], weights: [1.0] },
  "media & entertainment": { themes: ["Media & Entertainment"], weights: [1.0] },
  "transportation": { themes: ["Travel & Leisure", "Industrial & Infrastructure"], weights: [0.7, 0.3] },
  "clean energy": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "consumer goods": { themes: ["Retail & E-commerce"], weights: [1.0] },
  "etf": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "telecom": { themes: ["Big Tech & Consumer", "Cloud & Cybersecurity"], weights: [0.6, 0.4] },
  "utilities": { themes: ["Industrial & Infrastructure", "Clean Energy & EVs"], weights: [0.6, 0.4] },
  "ai & machine learning": { themes: ["AI & Semiconductors", "Cloud & Cybersecurity"], weights: [0.7, 0.3] },
  "aerospace & defense": { themes: ["Defense & Aerospace"], weights: [1.0] },
  "insurance": { themes: ["Banks & Financials"], weights: [1.0] },
  "industrial manufacturing": { themes: ["Industrial & Infrastructure"], weights: [1.0] },
  "retail": { themes: ["Retail & E-commerce"], weights: [1.0] },
  "construction": { themes: ["Industrial & Infrastructure", "Real Estate & REITs"], weights: [0.6, 0.4] },
  "energy": { themes: ["Energy & Oil"], weights: [1.0] },
  "medical devices": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "materials": { themes: ["Commodities & Mining", "Industrial & Infrastructure"], weights: [0.6, 0.4] },
  "fintech": { themes: ["Fintech & Crypto", "Banks & Financials"], weights: [0.7, 0.3] },
  "agriculture": { themes: ["Food & Agriculture"], weights: [1.0] },
  "chemicals": { themes: ["Commodities & Mining", "Industrial & Infrastructure"], weights: [0.5, 0.5] },
  "restaurants": { themes: ["Travel & Leisure", "Food & Agriculture"], weights: [0.7, 0.3] },
  "consumer discretionary": { themes: ["Retail & E-commerce", "Travel & Leisure"], weights: [0.6, 0.4] },
  "communication services": { themes: ["Media & Entertainment", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "industrials": { themes: ["Industrial & Infrastructure"], weights: [1.0] },
  "consumer staples": { themes: ["Food & Agriculture", "Retail & E-commerce"], weights: [0.6, 0.4] },
  "software": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "internet": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.7, 0.3] },
  "e-commerce": { themes: ["Retail & E-commerce", "Big Tech & Consumer"], weights: [0.7, 0.3] },
  "gaming": { themes: ["Media & Entertainment", "Travel & Leisure"], weights: [0.7, 0.3] },
  "travel": { themes: ["Travel & Leisure"], weights: [1.0] },
  "hotels": { themes: ["Travel & Leisure", "Real Estate & REITs"], weights: [0.8, 0.2] },
  "airlines": { themes: ["Travel & Leisure"], weights: [1.0] },
  "cruise": { themes: ["Travel & Leisure"], weights: [1.0] },
  "casino": { themes: ["Travel & Leisure", "Media & Entertainment"], weights: [0.7, 0.3] },
  "hospitality": { themes: ["Travel & Leisure"], weights: [1.0] },
  "tourism": { themes: ["Travel & Leisure"], weights: [1.0] },
  "cybersecurity": { themes: ["Cloud & Cybersecurity"], weights: [1.0] },
  "cloud": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.7, 0.3] },
  "cloud computing": { themes: ["Cloud & Cybersecurity"], weights: [1.0] },
  "saas": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "enterprise software": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "ev": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "electric vehicles": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "solar": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "renewable": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "gold": { themes: ["Commodities & Mining"], weights: [1.0] },
  "silver": { themes: ["Commodities & Mining"], weights: [1.0] },
  "pharma": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "pharmaceutical": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "reit": { themes: ["Real Estate & REITs"], weights: [1.0] },
};

function assignAssetToThemes(
  ticker: string,
  assetName: string,
  assetClass: string | null,
  sector: string | null
): { themes: string[]; weights: number[] } {
  const matchedThemes: { theme: string; weight: number }[] = [];
  const nameLower = (assetName || "").toLowerCase();
  const sectorLower = (sector || "").toLowerCase().trim();
  const tickerUpper = ticker.toUpperCase();

  // PRIORITY 1: Direct sector mapping (covers 26k+ enriched assets)
  if (sectorLower && SECTOR_TO_THEME[sectorLower]) {
    const mapping = SECTOR_TO_THEME[sectorLower];
    for (let i = 0; i < mapping.themes.length; i++) {
      matchedThemes.push({ theme: mapping.themes[i], weight: mapping.weights[i] });
    }
  }

  // PRIORITY 2: Partial sector keyword match (catches variations)
  if (matchedThemes.length === 0 && sectorLower) {
    for (const [sectorKey, mapping] of Object.entries(SECTOR_TO_THEME)) {
      // Check if sector contains the key OR key contains the sector
      if (sectorLower.includes(sectorKey) || sectorKey.includes(sectorLower) ||
          // Also check word boundaries
          sectorLower.split(/\s+/).some(word => sectorKey.includes(word) && word.length > 3)) {
        for (let i = 0; i < mapping.themes.length; i++) {
          matchedThemes.push({ theme: mapping.themes[i], weight: mapping.weights[i] * 0.9 });
        }
        break;
      }
    }
  }

  // PRIORITY 3: Explicit ticker list from THEME_PATTERNS
  if (matchedThemes.length === 0) {
    for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
      if (patterns.tickers.includes(tickerUpper)) {
        matchedThemes.push({ theme: themeName, weight: 1.0 });
      }
    }
  }

  // PRIORITY 4: ETF/name pattern matching
  if (matchedThemes.length === 0) {
    for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
      for (const pattern of patterns.etfPatterns) {
        if (pattern.test(nameLower) || pattern.test(tickerUpper)) {
          matchedThemes.push({ theme: themeName, weight: 0.9 });
          break;
        }
      }
      if (matchedThemes.length > 0) break;
    }
  }

  // PRIORITY 5: Name pattern matching
  if (matchedThemes.length === 0) {
    for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
      for (const pattern of patterns.namePatterns) {
        if (pattern.test(nameLower)) {
          matchedThemes.push({ theme: themeName, weight: 0.8 });
          break;
        }
      }
      if (matchedThemes.length > 0) break;
    }
  }

  // PRIORITY 6: Asset class fallbacks
  if (matchedThemes.length === 0) {
    if (assetClass === "crypto") {
      matchedThemes.push({ theme: "Fintech & Crypto", weight: 0.8 });
    } else if (assetClass === "forex") {
      matchedThemes.push({ theme: "Fintech & Crypto", weight: 0.6 });
      matchedThemes.push({ theme: "International & Emerging", weight: 0.4 });
    } else if (assetClass === "commodity") {
      matchedThemes.push({ theme: "Commodities & Mining", weight: 0.8 });
    } else if (assetClass === "etf" || assetClass === "mutual_fund") {
      matchedThemes.push({ theme: "Big Tech & Consumer", weight: 0.4 });
      matchedThemes.push({ theme: "Banks & Financials", weight: 0.3 });
    } else if (assetClass === "stock") {
      matchedThemes.push({ theme: "Big Tech & Consumer", weight: 0.4 });
    }
  }

  // Ultimate fallback
  if (matchedThemes.length === 0) {
    matchedThemes.push({ theme: "Big Tech & Consumer", weight: 0.3 });
  }

  const totalWeight = matchedThemes.reduce((sum, m) => sum + m.weight, 0);
  return {
    themes: matchedThemes.map(m => m.theme),
    weights: matchedThemes.map(m => m.weight / totalWeight)
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("[THEME-SCORING] Starting theme computation for 17 sector themes...");

    // Fetch themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name');

    if (themesError) throw themesError;
    console.log(`[THEME-SCORING] Found ${themes?.length || 0} themes`);

    // Initialize theme scores and track coverage BY TICKER (not asset_id)
    const themeScores: Record<string, {
      signalCount: number;
      totalMagnitude: number;
      positiveSignals: number;
      negativeSignals: number;
      sources: Set<string>;
      tickersWithData: Set<string>;  // Track by ticker for accurate coverage
      totalTickers: Set<string>;      // Track by ticker for accurate coverage
    }> = {};

    for (const theme of themes || []) {
      themeScores[theme.name] = {
        signalCount: 0,
        totalMagnitude: 0,
        positiveSignals: 0,
        negativeSignals: 0,
        sources: new Set(),
        tickersWithData: new Set(),
        totalTickers: new Set()
      };
    }

    // Fetch all assets (Supabase max is 1000 per query, so we paginate)
    const allAssets: any[] = [];
    let assetOffset = 0;
    const ASSET_BATCH = 1000; // Supabase default limit
    while (true) {
      const { data: batch, error } = await supabaseClient
        .from('assets')
        .select('id, ticker, name, asset_class, metadata')
        .range(assetOffset, assetOffset + ASSET_BATCH - 1);
      
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      allAssets.push(...batch);
      assetOffset += batch.length;
      // Only break if we got fewer than requested (end of data)
      if (batch.length < ASSET_BATCH) break;
    }
    console.log(`[THEME-SCORING] Loaded ${allAssets.length} assets`);

    // OPTIMIZED: Build mappings - NO SLOW PATH (use default for unclassified)
    const assetToThemes = new Map<string, { themes: string[]; weights: number[] }>();
    const tickerToAssetId = new Map<string, string>();
    const assetIdToTicker = new Map<string, string>(); // REVERSE LOOKUP - O(1) instead of O(n)
    const tickerToAssetThemes = new Map<string, { themes: string[]; weights: number[] }>();
    
    const DEFAULT_MAPPING = { themes: ["Big Tech & Consumer"], weights: [1.0] };
    
    for (const asset of allAssets) {
      const sector = (asset.metadata?.sector || '').toLowerCase().trim();
      const tickerUpper = asset.ticker.toUpperCase();
      let mapping: { themes: string[]; weights: number[] };
      
      // FAST PATH ONLY - no expensive regex
      if (sector && SECTOR_TO_THEME[sector]) {
        mapping = SECTOR_TO_THEME[sector];
      } else if (asset.asset_class === 'crypto') {
        mapping = { themes: ["Fintech & Crypto"], weights: [1.0] };
      } else if (asset.asset_class === 'forex') {
        mapping = { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] };
      } else if (asset.asset_class === 'commodity') {
        mapping = { themes: ["Commodities & Mining"], weights: [1.0] };
      } else {
        // Default for unclassified - NO SLOW REGEX
        mapping = DEFAULT_MAPPING;
      }
      
      assetToThemes.set(asset.id, mapping);
      tickerToAssetId.set(tickerUpper, asset.id);
      assetIdToTicker.set(asset.id, tickerUpper); // O(1) reverse lookup
      tickerToAssetThemes.set(tickerUpper, mapping);
      
      // Track total tickers per theme
      for (const themeName of mapping.themes) {
        if (themeScores[themeName]) {
          themeScores[themeName].totalTickers.add(tickerUpper);
        }
      }
    }
    console.log(`[THEME-SCORING] Mapped ${allAssets.length} assets`);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ========================================================================
    // LAYER 1: Process signals table
    // ========================================================================
    console.log("[THEME-SCORING] Processing signals table...");
    
    let signalsProcessed = 0;
    let signalOffset = 0;
    const SIGNAL_BATCH = 5000;
    
    while (true) {
      const { data: signals, error } = await supabaseClient
        .from('signals')
        .select('id, signal_type, asset_id, magnitude, direction, observed_at')
        .gte('observed_at', thirtyDaysAgo.toISOString())
        .range(signalOffset, signalOffset + SIGNAL_BATCH - 1);
      
      if (error) throw error;
      if (!signals || signals.length === 0) break;
      
      for (const signal of signals) {
        let signalThemes: string[] = [];
        let weights: number[] = [];
        
        // Try asset_id mapping first
        if (signal.asset_id && assetToThemes.has(signal.asset_id)) {
          const mapping = assetToThemes.get(signal.asset_id)!;
          signalThemes = mapping.themes;
          weights = mapping.weights;
        }
        
        // Try signal_type mapping
        if (signalThemes.length === 0 && signal.signal_type) {
          const typeMapping = SIGNAL_TYPE_TO_THEMES[signal.signal_type];
          if (typeMapping) {
            signalThemes = typeMapping.themes;
            weights = typeMapping.weights;
          }
        }
        
        // Fallback
        if (signalThemes.length === 0) {
          signalThemes = ["Big Tech & Consumer"];
          weights = [1.0];
        }
        
        // Apply to themes
        for (let i = 0; i < signalThemes.length; i++) {
          const themeName = signalThemes[i];
          const weight = weights[i];
          
          if (themeScores[themeName]) {
            themeScores[themeName].signalCount++;
            themeScores[themeName].totalMagnitude += (signal.magnitude || 1) * weight;
            themeScores[themeName].sources.add('signals');
            
            // Track ticker for coverage - O(1) lookup
            if (signal.asset_id) {
              const ticker = assetIdToTicker.get(signal.asset_id);
              if (ticker) {
                themeScores[themeName].tickersWithData.add(ticker);
              }
            }
            
            if (signal.direction === 'up' || signal.direction === 'bullish') {
              themeScores[themeName].positiveSignals++;
            } else if (signal.direction === 'down' || signal.direction === 'bearish') {
              themeScores[themeName].negativeSignals++;
            }
          }
        }
        signalsProcessed++;
      }
      
      signalOffset += signals.length;
      if (signals.length < SIGNAL_BATCH) break;
    }
    console.log(`[THEME-SCORING] Processed ${signalsProcessed} signals from signals table`);

    // ========================================================================
    // LAYER 2: Process direct data source tables - PAGINATED FOR FULL COVERAGE
    // ========================================================================
    console.log("[THEME-SCORING] Processing direct data sources with full pagination...");
    
    let directSourcesProcessed = 0;
    
    for (const config of DATA_SOURCE_CONFIGS) {
      try {
        let sourceOffset = 0;
        const SOURCE_BATCH = 1000;
        let tableRecordsProcessed = 0;
        const MAX_BATCHES = 10; // Limit to 10k records per table to prevent timeout
        let batchCount = 0;
        
        // PAGINATE through records with limit to prevent timeout
        while (batchCount < MAX_BATCHES) {
          const { data: records, error } = await supabaseClient
            .from(config.table)
            .select('*')
            .gte(config.dateColumn, thirtyDaysAgo.toISOString())
            .order(config.dateColumn, { ascending: false })
            .range(sourceOffset, sourceOffset + SOURCE_BATCH - 1);
          
          if (error) {
            console.log(`[THEME-SCORING] Skipping ${config.table}: ${error.message}`);
            break;
          }
          
          if (!records || records.length === 0) break;
          
          for (const record of records) {
            const ticker = record[config.tickerColumn]?.toUpperCase();
            let recordThemes = config.themes;
            let recordWeights = config.weights;
            
            if (ticker && tickerToAssetThemes.has(ticker)) {
              const assetMapping = tickerToAssetThemes.get(ticker)!;
              recordThemes = assetMapping.themes;
              recordWeights = assetMapping.weights;
            }
            
            let direction = 'neutral';
            if (config.directionField && record[config.directionField]) {
              const dirVal = String(record[config.directionField]).toLowerCase();
              if (dirVal.includes('bull') || dirVal.includes('up') || dirVal.includes('buy') || dirVal.includes('inflow') || dirVal.includes('positive')) {
                direction = 'up';
              } else if (dirVal.includes('bear') || dirVal.includes('down') || dirVal.includes('sell') || dirVal.includes('outflow') || dirVal.includes('negative')) {
                direction = 'down';
              }
            }
            
            let magnitude = 1;
            if (config.magnitudeField && record[config.magnitudeField]) {
              magnitude = Math.abs(Number(record[config.magnitudeField])) || 1;
              magnitude = Math.min(10, Math.log10(magnitude + 1) + 1);
            }
            
            for (let i = 0; i < recordThemes.length; i++) {
              const themeName = recordThemes[i];
              const weight = recordWeights[i];
              
              if (themeScores[themeName]) {
                themeScores[themeName].signalCount++;
                themeScores[themeName].totalMagnitude += magnitude * weight;
                themeScores[themeName].sources.add(config.table);
                
                if (ticker) {
                  themeScores[themeName].tickersWithData.add(ticker);
                }
                
                if (direction === 'up') {
                  themeScores[themeName].positiveSignals++;
                } else if (direction === 'down') {
                  themeScores[themeName].negativeSignals++;
                }
              }
            }
            tableRecordsProcessed++;
          }
          
          sourceOffset += records.length;
          batchCount++;
          if (records.length < SOURCE_BATCH) break;
        }
        
        directSourcesProcessed += tableRecordsProcessed;
        console.log(`[THEME-SCORING] Processed ${tableRecordsProcessed} records from ${config.table}`);
        
      } catch (err) {
        console.log(`[THEME-SCORING] Error processing ${config.table}:`, err);
      }
    }
    
    console.log(`[THEME-SCORING] Processed ${directSourcesProcessed} records from direct sources`);

    // ========================================================================
    // 8-COMPONENT RESEARCH-BACKED SCORING MODEL
    // Based on backend/scoring.py - uses exponential decay + signal classification
    // ========================================================================
    
    // Component weights from backend/scoring.py (spec values)
    const COMPONENT_WEIGHTS: Record<string, number> = {
      PolicyMomentum: 1.0,
      FlowPressure: 1.0,
      BigMoneyConfirm: 1.0,
      InsiderPoliticianConfirm: 0.8,
      Attention: 0.5,
      TechEdge: 0.4,
      RiskFlags: -1.0,
      CapexMomentum: 0.6,
    };
    
    // Signal type → component mapping
    const SIGNAL_TO_COMPONENT: Record<string, string> = {
      // PolicyMomentum
      'policy_keyword': 'PolicyMomentum',
      'policy_mention': 'PolicyMomentum',
      'policy_approval': 'PolicyMomentum',
      'policy_rejection': 'PolicyMomentum',
      
      // FlowPressure
      'flow_pressure': 'FlowPressure',
      'flow_pressure_etf': 'FlowPressure',
      'etf_inflow': 'FlowPressure',
      'etf_outflow': 'FlowPressure',
      'dark_pool_activity': 'FlowPressure',
      'darkpool_block': 'FlowPressure',
      'darkpool_accumulation': 'FlowPressure',
      'darkpool_distribution': 'FlowPressure',
      
      // BigMoneyConfirm
      'filing_13f_new': 'BigMoneyConfirm',
      'filing_13f_increase': 'BigMoneyConfirm',
      'filing_13f_decrease': 'BigMoneyConfirm',
      '13f_new_position': 'BigMoneyConfirm',
      '13f_increase': 'BigMoneyConfirm',
      '13f_decrease': 'BigMoneyConfirm',
      'institutional_13f': 'BigMoneyConfirm',
      
      // InsiderPoliticianConfirm
      'insider_buy': 'InsiderPoliticianConfirm',
      'insider_sell': 'InsiderPoliticianConfirm',
      'form4_buy': 'InsiderPoliticianConfirm',
      'form4_sell': 'InsiderPoliticianConfirm',
      'politician_buy': 'InsiderPoliticianConfirm',
      'politician_sell': 'InsiderPoliticianConfirm',
      'congressional_buy': 'InsiderPoliticianConfirm',
      'congressional_sell': 'InsiderPoliticianConfirm',
      
      // Attention
      'social_mention': 'Attention',
      'social_bullish': 'Attention',
      'social_bearish': 'Attention',
      'news_mention': 'Attention',
      'breaking_news': 'Attention',
      'news_alert': 'Attention',
      'reddit_mention': 'Attention',
      'stocktwits_mention': 'Attention',
      'search_interest': 'Attention',
      'search_spike': 'Attention',
      'trending_topic': 'Attention',
      'sentiment_shift': 'Attention',
      'sentiment_bullish': 'Attention',
      'sentiment_bearish': 'Attention',
      'sentiment_extreme': 'Attention',
      
      // TechEdge
      'technical_breakout': 'TechEdge',
      'technical_breakdown': 'TechEdge',
      'chart_pattern': 'TechEdge',
      'pattern_detected': 'TechEdge',
      'options_unusual': 'TechEdge',
      'unusual_options': 'TechEdge',
      'options_sweep': 'TechEdge',
      'options_block': 'TechEdge',
      
      // RiskFlags
      'risk_high_volatility': 'RiskFlags',
      'risk_liquidity': 'RiskFlags',
      'risk_concentration': 'RiskFlags',
      'risk_regulatory': 'RiskFlags',
      'short_interest_high': 'RiskFlags',
      'short_squeeze': 'RiskFlags',
      
      // CapexMomentum
      'capex_hiring': 'CapexMomentum',
      'hiring_surge': 'CapexMomentum',
      'job_growth': 'CapexMomentum',
      'patent_filed': 'CapexMomentum',
      'patent_granted': 'CapexMomentum',
      'innovation_signal': 'CapexMomentum',
      'earnings_surprise': 'CapexMomentum',
      'earnings_beat': 'CapexMomentum',
      'revenue_surprise': 'CapexMomentum',
    };
    
    // Signal classification multipliers (rewards conviction)
    const CLASSIFICATION_MULTIPLIER: Record<string, number> = {
      'strong_bullish': 1.5,
      'strong_bearish': 1.5,
      'bullish': 1.2,
      'bearish': 1.2,
      'weak_bullish': 0.7,
      'weak_bearish': 0.7,
      'weak signal': 0.5,
      'noise': 0.1,
    };
    
    // Exponential decay function (30-day half-life per spec)
    const HALF_LIFE_DAYS = 30;
    function exponentialDecay(daysAgo: number): number {
      if (daysAgo <= 0) return 1.0;
      return Math.exp(-Math.LN2 * daysAgo / HALF_LIFE_DAYS);
    }
    
    const results: any[] = [];
    const now = new Date();

    // Fetch scored signals with composite_score for accurate weighting
    console.log('[THEME-SCORING] Fetching scored signals for component aggregation...');
    const scoredSignalsCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: scoredSignals, error: scoredError } = await supabaseClient
      .from('signals')
      .select('id, signal_type, asset_id, theme_id, direction, magnitude, composite_score, signal_classification, observed_at')
      .gte('observed_at', scoredSignalsCutoff)
      .not('composite_score', 'is', null)
      .limit(50000);
    
    if (scoredError) {
      console.log('[THEME-SCORING] Error fetching scored signals:', scoredError.message);
    }
    
    const scoredSignalsList = scoredSignals || [];
    console.log(`[THEME-SCORING] Found ${scoredSignalsList.length} scored signals for component analysis`);

    for (const theme of themes || []) {
      const stats = themeScores[theme.name];
      if (!stats) continue;

      // Initialize 8-component scores
      const componentScores: Record<string, number> = {
        PolicyMomentum: 0,
        FlowPressure: 0,
        BigMoneyConfirm: 0,
        InsiderPoliticianConfirm: 0,
        Attention: 0,
        TechEdge: 0,
        RiskFlags: 0,
        CapexMomentum: 0,
      };
      
      const componentCounts: Record<string, number> = { ...componentScores };

      // Get theme-related tickers for signal filtering
      const themeTickers = new Set(stats.totalTickers);
      
      // Process scored signals that belong to this theme
      for (const signal of scoredSignalsList) {
        // Check if signal belongs to this theme via asset mapping
        const signalThemes = SIGNAL_TYPE_TO_THEMES[signal.signal_type];
        const belongsToTheme = signalThemes?.themes.includes(theme.name);
        
        if (!belongsToTheme) continue;
        
        // Get component for this signal type
        const component = SIGNAL_TO_COMPONENT[signal.signal_type];
        if (!component) continue;
        
        // Calculate days ago and apply decay
        const observedAt = new Date(signal.observed_at);
        const daysAgo = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
        const decay = exponentialDecay(daysAgo);
        
        // Get classification multiplier
        const classification = signal.signal_classification?.toLowerCase() || 'weak signal';
        const classMultiplier = CLASSIFICATION_MULTIPLIER[classification] || 0.5;
        
        // Base score from composite_score (0-100 scale)
        const baseScore = (signal.composite_score || 50) / 100;
        
        // Direction adjustment: up signals boost positive components, down signals boost RiskFlags
        let directionFactor = 1.0;
        if (component === 'RiskFlags') {
          // Risk signals are always counted (negative weight will handle)
          directionFactor = 1.0;
        } else if (signal.direction === 'down') {
          // Bearish signals on positive components are weaker
          directionFactor = 0.3;
        } else if (signal.direction === 'up') {
          directionFactor = 1.2;
        }
        
        // Calculate weighted contribution
        const contribution = baseScore * decay * classMultiplier * directionFactor;
        
        componentScores[component] += contribution;
        componentCounts[component]++;
      }
      
      // ====================================================================
      // Map direct data sources to 8 components
      // This ensures scores are populated even without scored signals
      // ====================================================================
      if (stats.signalCount > 0) {
        const avgMagnitude = stats.totalMagnitude / stats.signalCount;
        const positiveRatio = (stats.positiveSignals + stats.negativeSignals) > 0 
          ? stats.positiveSignals / (stats.positiveSignals + stats.negativeSignals) 
          : 0.5;
        const sentimentStrength = Math.abs(positiveRatio - 0.5) * 2; // 0-1 scale
        const directionBoost = positiveRatio >= 0.5 ? 1.0 : 0.7;
        
        // 1. ATTENTION - news, sentiment, social, search trends
        if (stats.sources.has('breaking_news') || stats.sources.has('news_sentiment_aggregate') || 
            stats.sources.has('reddit_sentiment') || stats.sources.has('stocktwits_sentiment') ||
            stats.sources.has('google_trends') || stats.sources.has('ai_research_reports')) {
          componentScores.Attention += Math.log10(stats.signalCount + 1) * sentimentStrength * directionBoost;
          componentCounts.Attention++;
        }
        // Always add base attention from volume
        componentScores.Attention += Math.log10(stats.signalCount + 1) * 0.2;
        componentCounts.Attention++;
        
        // 2. FLOW PRESSURE - ETF flows, dark pool
        if (stats.sources.has('etf_flows') || stats.sources.has('dark_pool_activity')) {
          componentScores.FlowPressure += positiveRatio * avgMagnitude * 0.8 * directionBoost;
          componentCounts.FlowPressure++;
        }
        
        // 3. BIG MONEY CONFIRM - 13F holdings
        if (stats.sources.has('holdings_13f') || stats.sources.has('signals')) {
          componentScores.BigMoneyConfirm += positiveRatio * avgMagnitude * 0.6 * directionBoost;
          componentCounts.BigMoneyConfirm++;
        }
        
        // 4. INSIDER/POLITICIAN CONFIRM - congressional trades, Form 4
        if (stats.sources.has('congressional_trades') || stats.sources.has('form4_filings')) {
          componentScores.InsiderPoliticianConfirm += positiveRatio * avgMagnitude * 0.7 * directionBoost;
          componentCounts.InsiderPoliticianConfirm++;
        }
        
        // 5. TECH EDGE - technicals, patterns, options
        if (stats.sources.has('advanced_technicals') || stats.sources.has('pattern_recognition') ||
            stats.sources.has('options_flow') || stats.sources.has('forex_technicals')) {
          componentScores.TechEdge += sentimentStrength * avgMagnitude * 0.5 * directionBoost;
          componentCounts.TechEdge++;
        }
        
        // 6. POLICY MOMENTUM - policy feeds, economic indicators
        if (stats.sources.has('policy_feeds') || stats.sources.has('economic_indicators')) {
          componentScores.PolicyMomentum += positiveRatio * avgMagnitude * 0.6 * directionBoost;
          componentCounts.PolicyMomentum++;
        }
        
        // 7. CAPEX MOMENTUM - jobs, patents, earnings
        if (stats.sources.has('job_postings') || stats.sources.has('patent_filings') ||
            stats.sources.has('earnings_sentiment')) {
          componentScores.CapexMomentum += positiveRatio * avgMagnitude * 0.5 * directionBoost;
          componentCounts.CapexMomentum++;
        }
        
        // 8. RISK FLAGS - short interest, high volatility indicators
        const negativeRatio = stats.negativeSignals / (stats.signalCount + 1);
        if (stats.sources.has('short_interest') || negativeRatio > 0.4) {
          componentScores.RiskFlags += negativeRatio * avgMagnitude * 0.4;
          componentCounts.RiskFlags++;
        }
      }
      
      // Normalize each component to 0-100 scale with boosted multiplier
      const normalizedComponents: Record<string, number> = {};
      for (const [comp, rawScore] of Object.entries(componentScores)) {
        // Boosted normalization for meaningful investment scores
        const normalized = rawScore > 0 ? Math.min(100, Math.log10(1 + rawScore) * 50) : 0;
        normalizedComponents[comp] = Math.round(normalized * 100) / 100;
      }
      
      // Calculate weighted sum using COMPONENT_WEIGHTS
      let weightedSum = 0;
      let totalPositiveWeight = 0;
      const activeComponents: string[] = [];
      
      for (const [comp, normalized] of Object.entries(normalizedComponents)) {
        const weight = COMPONENT_WEIGHTS[comp];
        
        if (normalized > 0.1 && weight > 0) {
          activeComponents.push(comp);
        }
        
        // Include all positive weights in denominator for fair comparison
        if (weight > 0) totalPositiveWeight += weight;
        weightedSum += weight * normalized;
      }
      
      // Final score: weighted average of component scores
      // Scale to 0-100 based on theoretical max (all components at 100)
      const theoreticalMax = totalPositiveWeight * 100;
      let score = 0;
      if (theoreticalMax > 0) {
        // Base score from weighted components
        score = (weightedSum / theoreticalMax) * 100;
        // Boost based on active component count (more data = higher confidence)
        const componentBonus = Math.min(20, activeComponents.length * 3);
        score = Math.min(100, score + componentBonus);
      }
      
      // Apply coverage quality adjustment (themes with sparse data get penalized)
      const totalTickerCount = stats.totalTickers.size || 1;
      const tickersWithDataInTheme = [...stats.tickersWithData].filter(t => stats.totalTickers.has(t)).length;
      const coveragePercent = Math.round((tickersWithDataInTheme / totalTickerCount) * 100);
      
      // Coverage penalty: <50% coverage reduces score by up to 30%
      if (coveragePercent < 50) {
        const coveragePenalty = (50 - coveragePercent) / 50 * 0.3;
        score = score * (1 - coveragePenalty);
      }
      
      results.push({
        theme_id: theme.id,
        theme_name: theme.name,
        score: Math.round(score * 100) / 100,
        signal_count: stats.signalCount,
        positive_signals: stats.positiveSignals,
        negative_signals: stats.negativeSignals,
        sources: Array.from(stats.sources),
        total_tickers: totalTickerCount,
        tickers_with_data: tickersWithDataInTheme,
        all_tickers_with_signals: stats.tickersWithData.size,
        coverage_percent: coveragePercent,
        component_scores: normalizedComponents,
        active_components: activeComponents,
        computed_at: now.toISOString()
      });
    }

    results.sort((a, b) => b.score - a.score);

    // Log theme distribution with 8-component breakdown
    console.log("[THEME-SCORING] Theme scores with 8-component model:");
    for (const r of results) {
      const activeComps = r.active_components.join(',') || 'none';
      console.log(`  ${r.theme_name}: score=${r.score.toFixed(1)}, components=[${activeComps}], coverage=${r.coverage_percent}%`);
    }

    // Update database with 8-component scores
    for (const result of results) {
      await supabaseClient
        .from('theme_scores')
        .upsert({
          theme_id: result.theme_id,
          score: result.score,
          signal_count: result.signal_count,
          component_scores: {
            // 8-component model scores
            PolicyMomentum: result.component_scores.PolicyMomentum,
            FlowPressure: result.component_scores.FlowPressure,
            BigMoneyConfirm: result.component_scores.BigMoneyConfirm,
            InsiderPoliticianConfirm: result.component_scores.InsiderPoliticianConfirm,
            Attention: result.component_scores.Attention,
            TechEdge: result.component_scores.TechEdge,
            RiskFlags: result.component_scores.RiskFlags,
            CapexMomentum: result.component_scores.CapexMomentum,
            // Legacy fields
            positive_signals: result.positive_signals,
            negative_signals: result.negative_signals,
            sources: result.sources,
            coverage_percent: result.coverage_percent,
          },
          positive_components: result.active_components,
          computed_at: result.computed_at
        }, { onConflict: 'theme_id' });

      await supabaseClient
        .from('themes')
        .update({ 
          score: result.score, 
          updated_at: now.toISOString(),
          metadata: {
            signal_count: result.signal_count,
            coverage_percent: result.coverage_percent,
            sources: result.sources,
            component_scores: result.component_scores,
            active_components: result.active_components
          }
        })
        .eq('id', result.theme_id);
    }

    const duration = Date.now() - startTime;
    console.log(`[THEME-SCORING] Complete in ${duration}ms. ${results.length} themes, ${signalsProcessed} signals, ${directSourcesProcessed} direct records`);

    await supabaseClient.from('function_status').insert({
      function_name: 'compute-theme-scores',
      status: 'success',
      executed_at: now.toISOString(),
      duration_ms: duration,
      rows_inserted: signalsProcessed + directSourcesProcessed,
      metadata: { 
        themes: results.length, 
        signals_processed: signalsProcessed, 
        direct_sources_processed: directSourcesProcessed,
        total_records: signalsProcessed + directSourcesProcessed
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        themes: results.length, 
        signals_processed: signalsProcessed, 
        direct_sources_processed: directSourcesProcessed,
        duration_ms: duration, 
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[THEME-SCORING] Error:', error);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    await supabaseClient.from('function_status').insert({
      function_name: 'compute-theme-scores',
      status: 'error',
      executed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
