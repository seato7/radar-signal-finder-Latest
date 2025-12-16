import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// COMPREHENSIVE THEME SCORING ENGINE
// Processes ALL 37 ingestion functions → 22 investment themes
// ============================================================================

// Theme patterns for asset-to-theme mapping
const THEME_PATTERNS: Record<string, {
  tickers: string[];
  etfPatterns: RegExp[];
  namePatterns: RegExp[];
  sectorKeywords: string[];
}> = {
  "AI & Semiconductors": {
    tickers: ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "MU", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "MRVL", "TXN", "ADI", "NXPI", "ON", "MCHP", "SWKS", "QRVO", "ARM"],
    etfPatterns: [/semicon/i, /chip/i, /\bai\b/i, /artificial/i, /robot/i, /smh/i, /soxx/i],
    namePatterns: [/semiconductor/i, /artificial intelligence/i, /machine learning/i, /neural/i, /gpu/i, /processor/i, /chip/i],
    sectorKeywords: ["semiconductor", "chips", "artificial intelligence", "machine learning"]
  },
  "Big Tech & Consumer": {
    tickers: ["AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "TSLA", "CRM", "ADBE", "ORCL", "IBM", "CSCO", "SAP", "NOW", "INTU", "SNOW", "DDOG", "ZS", "CRWD"],
    etfPatterns: [/tech/i, /qqq/i, /nasdaq/i, /growth/i, /innovation/i, /xlk/i, /vgt/i, /ftec/i],
    namePatterns: [/technology/i, /software/i, /internet/i, /digital/i, /e-commerce/i, /cloud/i, /saas/i],
    sectorKeywords: ["technology", "software", "internet", "digital", "big tech"]
  },
  "Cloud & Cybersecurity": {
    tickers: ["PANW", "CRWD", "ZS", "FTNT", "NET", "OKTA", "S", "CYBR", "TENB", "VRNS", "QLYS", "RPD", "AKAM", "SAIC", "LDOS"],
    etfPatterns: [/cyber/i, /cloud/i, /security/i, /hack/i, /cibr/i, /bug/i, /wcld/i, /skyy/i],
    namePatterns: [/cybersecurity/i, /cloud computing/i, /network security/i, /firewall/i, /encryption/i, /data protection/i],
    sectorKeywords: ["cybersecurity", "cloud", "security", "network", "data protection"]
  },
  "Biotech & Healthcare": {
    tickers: ["JNJ", "UNH", "PFE", "MRK", "ABBV", "LLY", "TMO", "DHR", "BMY", "AMGN", "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ISRG", "SYK", "MDT", "ABT", "ZTS"],
    etfPatterns: [/health/i, /biotech/i, /pharma/i, /med/i, /xbi/i, /ibb/i, /xlv/i, /vht/i, /fbt/i, /drug/i],
    namePatterns: [/healthcare/i, /biotech/i, /pharmaceutical/i, /medical/i, /therapeutic/i, /clinical/i, /hospital/i, /medicine/i, /vaccine/i, /oncology/i],
    sectorKeywords: ["healthcare", "biotech", "pharmaceutical", "medical", "hospital", "drug"]
  },
  "Clean Energy & EVs": {
    tickers: ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI", "ENPH", "SEDG", "FSLR", "PLUG", "BE", "CHPT", "BLNK", "NEE", "AES", "CEG", "VST", "RUN", "NOVA"],
    etfPatterns: [/clean/i, /solar/i, /wind/i, /renew/i, /green/i, /\bev\b/i, /electric/i, /icln/i, /qcln/i, /tan/i, /fan/i, /lit/i, /driv/i],
    namePatterns: [/clean energy/i, /renewable/i, /solar/i, /wind/i, /electric vehicle/i, /battery/i, /sustainable/i, /green/i, /lithium/i, /hydrogen/i],
    sectorKeywords: ["clean energy", "renewable", "solar", "wind", "electric", "battery", "sustainable"]
  },
  "Defense & Aerospace": {
    tickers: ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "TDG", "HII", "LDOS", "SAIC", "KTOS", "PLTR", "AXON", "RKLB", "LUNR"],
    etfPatterns: [/defense/i, /aerospace/i, /space/i, /military/i, /ita/i, /xar/i, /ppa/i, /dfen/i, /ufo/i],
    namePatterns: [/defense/i, /aerospace/i, /military/i, /weapons/i, /aviation/i, /satellite/i, /rocket/i, /space/i],
    sectorKeywords: ["defense", "aerospace", "military", "weapons", "aviation", "space"]
  },
  "Banks & Financials": {
    tickers: ["JPM", "BAC", "WFC", "C", "GS", "MS", "USB", "PNC", "TFC", "SCHW", "BLK", "AXP", "SPGI", "CME", "ICE", "BK", "STT", "COF", "DFS"],
    etfPatterns: [/bank/i, /financ/i, /xlf/i, /vfh/i, /kbe/i, /kre/i, /iai/i, /kie/i],
    namePatterns: [/bank/i, /financial/i, /capital/i, /investment/i, /credit/i, /lending/i, /insurance/i, /asset management/i],
    sectorKeywords: ["bank", "financial", "investment", "insurance", "credit"]
  },
  "Fintech & Crypto": {
    tickers: ["V", "MA", "PYPL", "SQ", "COIN", "MSTR", "HOOD", "SOFI", "AFRM", "UPST", "NU", "BILL", "TOST", "GPN", "FIS", "FISV", "ADP", "PAYX", "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK", "UNI", "LTC"],
    etfPatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital asset/i, /arkf/i, /gbtc/i, /bito/i, /blok/i, /bitq/i, /btc/i, /eth/i],
    namePatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital payment/i, /mobile payment/i, /defi/i, /ethereum/i],
    sectorKeywords: ["fintech", "crypto", "blockchain", "digital payment", "cryptocurrency"]
  },
  "Energy & Oil": {
    tickers: ["XOM", "CVX", "COP", "SLB", "EOG", "PXD", "MPC", "VLO", "PSX", "OXY", "HAL", "DVN", "BKR", "FANG", "HES", "OKE", "WMB", "KMI", "ET"],
    etfPatterns: [/oil/i, /gas/i, /energy(?!.*clean)/i, /petro/i, /xle/i, /vde/i, /oih/i, /xop/i, /uso/i, /ung/i, /mlp/i],
    namePatterns: [/oil/i, /gas/i, /petroleum/i, /crude/i, /natural gas/i, /pipeline/i, /drilling/i, /refin/i, /fossil/i],
    sectorKeywords: ["oil", "gas", "petroleum", "energy", "pipeline", "drilling"]
  },
  "Real Estate & REITs": {
    tickers: ["AMT", "PLD", "EQIX", "PSA", "CCI", "DLR", "O", "SPG", "WELL", "AVB", "EQR", "VTR", "ARE", "MAA", "UDR", "ESS", "INVH", "SBAC"],
    etfPatterns: [/reit/i, /real estate/i, /property/i, /xlre/i, /vnq/i, /iyr/i, /schh/i, /usrt/i, /rem/i, /mort/i],
    namePatterns: [/reit/i, /real estate/i, /property/i, /housing/i, /apartment/i, /commercial property/i, /mortgage/i, /residential/i],
    sectorKeywords: ["reit", "real estate", "property", "housing", "mortgage"]
  },
  "Industrial & Infrastructure": {
    tickers: ["CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "RTX", "MMM", "ETN", "EMR", "ITW", "PH", "ROK", "CMI", "PCAR", "WM", "RSG"],
    etfPatterns: [/industrial/i, /infrastr/i, /construct/i, /xli/i, /vir/i, /pave/i, /ifra/i],
    namePatterns: [/industrial/i, /infrastructure/i, /manufacturing/i, /construction/i, /machinery/i, /equipment/i, /engineering/i, /transport/i, /railroad/i, /logistics/i],
    sectorKeywords: ["industrial", "infrastructure", "manufacturing", "construction", "machinery"]
  },
  "Commodities & Mining": {
    tickers: ["FCX", "NEM", "GOLD", "BHP", "RIO", "VALE", "NUE", "STLD", "CLF", "AA", "SCCO", "TECK", "WPM", "FNV", "RGLD", "PAAS", "HL", "AG", "SLV", "GLD", "IAU"],
    etfPatterns: [/gold/i, /silver/i, /metal/i, /mining/i, /commod/i, /gdx/i, /gdxj/i, /slv/i, /gld/i, /iau/i, /dbc/i, /dba/i, /dbo/i, /ung/i, /corn/i, /weat/i, /soyb/i, /cper/i],
    namePatterns: [/gold/i, /silver/i, /mining/i, /metal/i, /commodity/i, /copper/i, /platinum/i, /palladium/i, /iron/i, /steel/i, /aluminum/i, /zinc/i, /nickel/i],
    sectorKeywords: ["gold", "silver", "mining", "metal", "commodity", "steel"]
  },
  "Retail & E-commerce": {
    tickers: ["WMT", "COST", "TGT", "HD", "LOW", "AMZN", "EBAY", "ETSY", "W", "SHOP", "MELI", "JD", "BABA", "PDD", "SE", "DG", "DLTR", "TJX", "ROST", "BBY"],
    etfPatterns: [/retail/i, /consumer/i, /e-?commerce/i, /xrt/i, /xly/i, /ibuy/i, /onln/i],
    namePatterns: [/retail/i, /consumer/i, /e-commerce/i, /shopping/i, /department store/i, /discount/i, /online retail/i, /marketplace/i],
    sectorKeywords: ["retail", "consumer", "e-commerce", "shopping", "department store"]
  },
  "Travel & Leisure": {
    tickers: ["MAR", "HLT", "H", "ABNB", "BKNG", "EXPE", "DAL", "UAL", "LUV", "AAL", "ALK", "CCL", "RCL", "NCLH", "DIS", "CMCSA", "PARA", "WBD", "LYV", "MTN"],
    etfPatterns: [/travel/i, /leisure/i, /hotel/i, /airline/i, /cruise/i, /jets/i, /away/i, /pej/i],
    namePatterns: [/travel/i, /hotel/i, /airline/i, /cruise/i, /resort/i, /vacation/i, /tourism/i, /hospitality/i, /entertainment/i, /casino/i, /gaming/i],
    sectorKeywords: ["travel", "hotel", "airline", "cruise", "resort", "tourism", "leisure"]
  },
  "Media & Entertainment": {
    tickers: ["DIS", "NFLX", "CMCSA", "WBD", "PARA", "FOX", "FOXA", "SPOT", "ROKU", "TTD", "MGNI", "PUBM", "ZD", "TTWO", "EA", "RBLX", "U", "ATVI"],
    etfPatterns: [/media/i, /entertain/i, /stream/i, /gaming/i, /esport/i, /pej/i, /gamr/i, /espo/i],
    namePatterns: [/media/i, /entertainment/i, /streaming/i, /broadcast/i, /content/i, /gaming/i, /video game/i, /esport/i, /movie/i, /film/i, /music/i, /podcast/i],
    sectorKeywords: ["media", "entertainment", "streaming", "broadcast", "gaming", "movie"]
  },
  "Food & Agriculture": {
    tickers: ["ADM", "BG", "CTVA", "FMC", "DE", "AGCO", "MOS", "NTR", "CF", "TSN", "HRL", "GIS", "K", "KHC", "MDLZ", "HSY", "CAG", "SJM", "CPB"],
    etfPatterns: [/agri/i, /food/i, /farm/i, /crop/i, /grain/i, /corn/i, /wheat/i, /soy/i, /dba/i, /cow/i, /vegi/i, /crop/i, /moo/i],
    namePatterns: [/agriculture/i, /food/i, /farm/i, /crop/i, /grain/i, /livestock/i, /fertilizer/i, /seed/i, /meat/i, /dairy/i, /beverage/i, /packaged food/i],
    sectorKeywords: ["agriculture", "food", "farm", "crop", "grain", "fertilizer", "livestock"]
  },
  "Fixed Income & Bonds": {
    tickers: ["BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "MUB", "TIP", "VCIT", "VCSH", "GOVT", "SCHZ", "BSV", "BIV", "BLV"],
    etfPatterns: [/bond/i, /treasury/i, /fixed income/i, /corporate/i, /municipal/i, /high yield/i, /aggregate/i, /govt/i, /tip/i],
    namePatterns: [/bond/i, /treasury/i, /fixed income/i, /debt/i, /corporate bond/i, /municipal/i, /government/i, /yield/i],
    sectorKeywords: ["bond", "treasury", "fixed income", "debt", "municipal", "corporate bond"]
  },
  "Growth & Allocation": {
    tickers: ["VTI", "VOO", "IVV", "SPY", "VT", "VXUS", "ACWI", "AOR", "AOM", "AOA", "AOK"],
    etfPatterns: [/allocation/i, /balanced/i, /moderate/i, /multi.?asset/i, /strategy/i, /tactical/i],
    namePatterns: [/allocation/i, /balanced/i, /growth/i, /value/i, /blend/i, /portfolio/i, /multi-asset/i],
    sectorKeywords: ["allocation", "balanced", "growth", "value", "blend", "multi-asset", "portfolio"]
  },
  "International & Emerging": {
    tickers: ["EFA", "VEA", "IEFA", "EEM", "VWO", "IEMG", "VXUS", "IXUS", "EWJ", "FXI", "EWZ", "EWT", "EWY", "INDA", "KWEB", "MCHI"],
    etfPatterns: [/international/i, /emerging/i, /global/i, /foreign/i, /ex.?u\.?s/i, /europe/i, /asia/i, /china/i, /japan/i, /india/i, /brazil/i, /eafe/i],
    namePatterns: [/international/i, /emerging market/i, /global/i, /foreign/i, /developed market/i, /world/i, /ex-us/i],
    sectorKeywords: ["international", "emerging", "global", "foreign", "world", "developed markets"]
  },
  "Index & Passive": {
    tickers: ["SPY", "IVV", "VOO", "VTI", "QQQ", "IWM", "VB", "VTV", "VUG", "VIG", "SCHD", "NOBL", "RSP"],
    etfPatterns: [/s\&?p\s?500/i, /index/i, /total market/i, /passive/i, /russell/i, /nasdaq.?100/i, /dow/i, /mid.?cap/i, /small.?cap/i, /large.?cap/i],
    namePatterns: [/index/i, /s\&p 500/i, /total stock/i, /total market/i, /passive/i, /tracker/i, /benchmark/i],
    sectorKeywords: ["index", "s&p 500", "total market", "passive", "benchmark", "market cap"]
  },
  "Income & Dividend": {
    tickers: ["SCHD", "VYM", "HDV", "DVY", "SPHD", "SPYD", "VIG", "DGRO", "SDY", "NOBL", "DIVO", "JEPI", "JEPQ", "QYLD", "XYLD"],
    etfPatterns: [/dividend/i, /income/i, /yield/i, /equity income/i, /high dividend/i, /covered call/i, /aristocrat/i],
    namePatterns: [/dividend/i, /income/i, /yield/i, /distribution/i, /equity income/i, /covered call/i],
    sectorKeywords: ["dividend", "income", "yield", "distribution", "equity income", "high dividend"]
  },
  "Forex & Currencies": {
    tickers: ["UUP", "FXE", "FXY", "FXB", "FXA", "FXC", "FXF", "CYB", "CEW"],
    etfPatterns: [/currency/i, /forex/i, /fx/i, /dollar/i, /euro/i, /yen/i, /pound/i],
    namePatterns: [/currency/i, /forex/i, /foreign exchange/i, /dollar/i, /euro/i, /yen/i],
    sectorKeywords: ["currency", "forex", "foreign exchange", "fx", "dollar"]
  }
};

// ============================================================================
// COMPREHENSIVE SIGNAL TYPE → THEME MAPPING
// Maps ALL signal types from 37 functions to appropriate themes
// ============================================================================
const SIGNAL_TYPE_TO_THEMES: Record<string, { themes: string[]; weights: number[] }> = {
  // --- FROM: ingest-13f-holdings (Function #1) ---
  "filing_13f_new": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "filing_13f_increase": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "filing_13f_decrease": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "13f_new_position": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "13f_increase": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "13f_decrease": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  
  // --- FROM: ingest-form4 (Function #2) ---
  "insider_buy": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "insider_sell": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "form4_buy": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "form4_sell": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-congressional-trades (Function #3) ---
  "politician_buy": { themes: ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"], weights: [0.4, 0.3, 0.3] },
  "politician_sell": { themes: ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"], weights: [0.4, 0.3, 0.3] },
  "congressional_buy": { themes: ["Defense & Aerospace", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "congressional_sell": { themes: ["Defense & Aerospace", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-etf-flows (Function #4) ---
  "flow_pressure_etf": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.6, 0.4] },
  "etf_inflow": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.6, 0.4] },
  "etf_outflow": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.6, 0.4] },
  "flow_pressure": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.6, 0.4] },
  
  // --- FROM: ingest-options-flow (Function #5) ---
  "options_unusual": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "unusual_options": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "options_sweep": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "options_block": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-dark-pool / ingest-finra-darkpool (Functions #6, #26) ---
  "darkpool_block": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "dark_pool_activity": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "darkpool_accumulation": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "darkpool_distribution": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-short-interest (Function #7) ---
  "short_squeeze": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "short_interest_high": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "short_interest_low": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-policy-feeds (Function #8) ---
  "policy_keyword": { themes: ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  "policy_mention": { themes: ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  "policy_approval": { themes: ["Banks & Financials", "Clean Energy & EVs"], weights: [0.5, 0.5] },
  "policy_rejection": { themes: ["Banks & Financials", "Clean Energy & EVs"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-breaking-news (Function #9) ---
  "news_mention": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "breaking_news": { themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  "news_alert": { themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-news-sentiment (Function #10) ---
  "sentiment_shift": { themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  "sentiment_bullish": { themes: ["Big Tech & Consumer", "Growth & Allocation"], weights: [0.5, 0.5] },
  "sentiment_bearish": { themes: ["Big Tech & Consumer", "Growth & Allocation"], weights: [0.5, 0.5] },
  "sentiment_extreme": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-reddit-sentiment / ingest-stocktwits (Functions #11, #12) ---
  "social_mention": { themes: ["Fintech & Crypto", "Media & Entertainment", "Big Tech & Consumer"], weights: [0.4, 0.3, 0.3] },
  "social_bullish": { themes: ["Fintech & Crypto", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "social_bearish": { themes: ["Fintech & Crypto", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "reddit_mention": { themes: ["Fintech & Crypto", "Media & Entertainment"], weights: [0.5, 0.5] },
  "stocktwits_mention": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-google-trends / ingest-search-trends (Function #13) ---
  "search_interest": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  "search_spike": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  "trending_topic": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-earnings (Function #14) ---
  "earnings_surprise": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "earnings_beat": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "earnings_miss": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "revenue_surprise": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-job-postings (Function #15) ---
  "capex_hiring": { themes: ["AI & Semiconductors", "Big Tech & Consumer", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  "hiring_surge": { themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "job_growth": { themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-patents (Function #16) ---
  "patent_filed": { themes: ["AI & Semiconductors", "Biotech & Healthcare", "Clean Energy & EVs"], weights: [0.4, 0.3, 0.3] },
  "patent_granted": { themes: ["AI & Semiconductors", "Biotech & Healthcare"], weights: [0.5, 0.5] },
  "innovation_signal": { themes: ["AI & Semiconductors", "Biotech & Healthcare"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-cot-reports / ingest-cot-cftc (Functions #17) ---
  "cot_positioning": { themes: ["Commodities & Mining", "Forex & Currencies", "Fintech & Crypto"], weights: [0.4, 0.3, 0.3] },
  "cot_bullish": { themes: ["Commodities & Mining", "Energy & Oil"], weights: [0.5, 0.5] },
  "cot_bearish": { themes: ["Commodities & Mining", "Energy & Oil"], weights: [0.5, 0.5] },
  "commercial_positioning": { themes: ["Commodities & Mining", "Energy & Oil"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-crypto-onchain (Function #18) ---
  "onchain_whale": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "crypto_whale_activity": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "crypto_exchange_flow": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "whale_accumulation": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "whale_distribution": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "exchange_inflow": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "exchange_outflow": { themes: ["Fintech & Crypto"], weights: [1.0] },
  
  // --- FROM: ingest-forex-sentiment (Function #19) ---
  "forex_sentiment": { themes: ["Forex & Currencies", "International & Emerging"], weights: [0.6, 0.4] },
  "forex_bullish": { themes: ["Forex & Currencies"], weights: [1.0] },
  "forex_bearish": { themes: ["Forex & Currencies"], weights: [1.0] },
  "retail_positioning": { themes: ["Forex & Currencies"], weights: [1.0] },
  
  // --- FROM: ingest-forex-technicals (Function #20) ---
  "forex_technical": { themes: ["Forex & Currencies"], weights: [1.0] },
  "forex_breakout": { themes: ["Forex & Currencies"], weights: [1.0] },
  "forex_breakdown": { themes: ["Forex & Currencies"], weights: [1.0] },
  
  // --- FROM: ingest-advanced-technicals (Function #21) ---
  "technical_signal": { themes: ["Index & Passive", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "technical_breakout": { themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  "technical_breakdown": { themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  "support_bounce": { themes: ["Index & Passive", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "resistance_break": { themes: ["Index & Passive", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "vwap_signal": { themes: ["Index & Passive"], weights: [1.0] },
  "stochastic_signal": { themes: ["Index & Passive"], weights: [1.0] },
  
  // --- FROM: ingest-pattern-recognition (Function #22) ---
  "pattern_detected": { themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  "bullish_pattern": { themes: ["Big Tech & Consumer", "Growth & Allocation"], weights: [0.5, 0.5] },
  "bearish_pattern": { themes: ["Big Tech & Consumer", "Growth & Allocation"], weights: [0.5, 0.5] },
  "reversal_pattern": { themes: ["Index & Passive"], weights: [1.0] },
  "continuation_pattern": { themes: ["Index & Passive"], weights: [1.0] },
  
  // --- FROM: ingest-economic-calendar (Function #23) ---
  "macro_event": { themes: ["Index & Passive", "Fixed Income & Bonds", "Forex & Currencies"], weights: [0.4, 0.3, 0.3] },
  "fed_decision": { themes: ["Fixed Income & Bonds", "Banks & Financials"], weights: [0.5, 0.5] },
  "gdp_release": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.5, 0.5] },
  "inflation_data": { themes: ["Fixed Income & Bonds", "Income & Dividend"], weights: [0.5, 0.5] },
  "employment_data": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-fred-economics (Function #24) ---
  "macro_indicator": { themes: ["Income & Dividend", "Fixed Income & Bonds", "Index & Passive"], weights: [0.4, 0.3, 0.3] },
  "interest_rate_change": { themes: ["Fixed Income & Bonds", "Banks & Financials"], weights: [0.5, 0.5] },
  "yield_curve_signal": { themes: ["Fixed Income & Bonds"], weights: [1.0] },
  "economic_indicator": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-supply-chain (Function #25) ---
  "supply_chain": { themes: ["AI & Semiconductors", "Clean Energy & EVs", "Industrial & Infrastructure"], weights: [0.4, 0.3, 0.3] },
  "supply_disruption": { themes: ["Industrial & Infrastructure", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "supply_recovery": { themes: ["Industrial & Infrastructure", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-smart-money (Function #27) ---
  "smart_money": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "smart_money_flow": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "institutional_buying": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "institutional_selling": { themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // --- FROM: ingest-ai-research (Function #28) ---
  "ai_insight": { themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "ai_recommendation": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  "ai_analysis": { themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // --- FROM: generate-signals-from-* (Functions #29-37) ---
  // These generate derived signals and are covered by the types above
  
  // --- GENERIC/FALLBACK SIGNAL TYPES ---
  "price_alert": { themes: ["Index & Passive", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  "volume_spike": { themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  "momentum_shift": { themes: ["Growth & Allocation", "Index & Passive"], weights: [0.5, 0.5] },
  "trend_change": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.5, 0.5] },
  "volatility_spike": { themes: ["Index & Passive", "Growth & Allocation"], weights: [0.5, 0.5] },
};

// ============================================================================
// DIRECT DATA SOURCE QUERIES
// Pulls data directly from source tables when signals table is incomplete
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
  // ETF Flows → Index & Passive, Growth & Allocation
  { table: 'etf_flows', tickerColumn: 'ticker', dateColumn: 'flow_date', directionField: 'flow_direction', magnitudeField: 'net_flow_millions', themes: ["Index & Passive", "Growth & Allocation"], weights: [0.6, 0.4] },
  
  // Dark Pool Activity → Banks & Financials
  { table: 'dark_pool_activity', tickerColumn: 'ticker', dateColumn: 'trade_date', directionField: 'signal_type', magnitudeField: 'dark_pool_percentage', themes: ["Banks & Financials", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // Congressional Trades → Defense & Aerospace, Big Tech
  { table: 'congressional_trades', tickerColumn: 'ticker', dateColumn: 'transaction_date', directionField: 'transaction_type', magnitudeField: 'amount_max', themes: ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"], weights: [0.4, 0.3, 0.3] },
  
  // Options Flow → Big Tech & Consumer, AI
  { table: 'options_flow', tickerColumn: 'ticker', dateColumn: 'trade_date', directionField: 'sentiment', magnitudeField: 'premium', themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // Short Interest → Various
  { table: 'short_interest', tickerColumn: 'ticker', dateColumn: 'report_date', magnitudeField: 'float_percentage', themes: ["Big Tech & Consumer", "AI & Semiconductors"], weights: [0.5, 0.5] },
  
  // COT Reports → Commodities, Forex
  { table: 'cot_reports', tickerColumn: 'ticker', dateColumn: 'report_date', directionField: 'sentiment', magnitudeField: 'noncommercial_net', themes: ["Commodities & Mining", "Forex & Currencies", "Energy & Oil"], weights: [0.4, 0.3, 0.3] },
  
  // Crypto Onchain → Fintech & Crypto
  { table: 'crypto_onchain_metrics', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'whale_signal', magnitudeField: 'exchange_net_flow', themes: ["Fintech & Crypto"], weights: [1.0] },
  
  // Forex Sentiment → Forex
  { table: 'forex_sentiment', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'retail_sentiment', magnitudeField: 'news_sentiment_score', themes: ["Forex & Currencies", "International & Emerging"], weights: [0.6, 0.4] },
  
  // Forex Technicals → Forex
  { table: 'forex_technicals', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'rsi_signal', themes: ["Forex & Currencies"], weights: [1.0] },
  
  // Advanced Technicals → Index & Passive
  { table: 'advanced_technicals', tickerColumn: 'ticker', dateColumn: 'timestamp', directionField: 'breakout_signal', magnitudeField: 'adx', themes: ["Index & Passive", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // News Sentiment → Big Tech & Consumer
  { table: 'news_sentiment_aggregate', tickerColumn: 'ticker', dateColumn: 'date', directionField: 'sentiment_label', magnitudeField: 'sentiment_score', themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.5, 0.5] },
  
  // Earnings → Big Tech, Financials
  { table: 'earnings_sentiment', tickerColumn: 'ticker', dateColumn: 'earnings_date', magnitudeField: 'earnings_surprise', themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  
  // Job Postings → AI, Biotech
  { table: 'job_postings', tickerColumn: 'ticker', dateColumn: 'posted_date', magnitudeField: 'growth_indicator', themes: ["AI & Semiconductors", "Big Tech & Consumer", "Biotech & Healthcare"], weights: [0.4, 0.3, 0.3] },
  
  // Patents → AI, Biotech, Clean Energy
  { table: 'patent_filings', tickerColumn: 'ticker', dateColumn: 'filing_date', themes: ["AI & Semiconductors", "Biotech & Healthcare", "Clean Energy & EVs"], weights: [0.4, 0.3, 0.3] },
  
  // Supply Chain → Semiconductors, EVs, Industrial
  { table: 'supply_chain_signals', tickerColumn: 'ticker', dateColumn: 'report_date', magnitudeField: 'change_percentage', themes: ["AI & Semiconductors", "Clean Energy & EVs", "Industrial & Infrastructure"], weights: [0.4, 0.3, 0.3] },
  
  // Breaking News → Big Tech
  { table: 'breaking_news', tickerColumn: 'ticker', dateColumn: 'published_at', magnitudeField: 'sentiment_score', themes: ["Big Tech & Consumer", "Index & Passive"], weights: [0.5, 0.5] },
  
  // AI Research Reports → AI, Big Tech
  { table: 'ai_research_reports', tickerColumn: 'ticker', dateColumn: 'generated_at', magnitudeField: 'confidence_score', themes: ["AI & Semiconductors", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // Pattern Recognition → Index, Big Tech
  { table: 'pattern_recognition', tickerColumn: 'ticker', dateColumn: 'detected_at', directionField: 'pattern_category', magnitudeField: 'confidence_score', themes: ["Index & Passive", "Big Tech & Consumer"], weights: [0.5, 0.5] },
  
  // Economic Indicators → Bonds, Index
  { table: 'economic_indicators', tickerColumn: 'indicator_type', dateColumn: 'release_date', directionField: 'impact', themes: ["Fixed Income & Bonds", "Index & Passive", "Forex & Currencies"], weights: [0.4, 0.3, 0.3] },
];

function assignAssetToThemes(
  ticker: string,
  assetName: string,
  assetClass: string | null,
  sector: string | null
): { themes: string[]; weights: number[] } {
  const matchedThemes: { theme: string; weight: number }[] = [];
  const nameLower = (assetName || "").toLowerCase();
  const sectorLower = (sector || "").toLowerCase();
  const tickerUpper = ticker.toUpperCase();

  for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
    let matched = false;
    let weight = 1.0;

    if (patterns.tickers.includes(tickerUpper)) {
      matched = true;
      weight = 1.0;
    }

    if (!matched) {
      for (const pattern of patterns.etfPatterns) {
        if (pattern.test(nameLower) || pattern.test(tickerUpper)) {
          matched = true;
          weight = 0.9;
          break;
        }
      }
    }

    if (!matched) {
      for (const pattern of patterns.namePatterns) {
        if (pattern.test(nameLower)) {
          matched = true;
          weight = 0.8;
          break;
        }
      }
    }

    if (!matched && sectorLower) {
      for (const keyword of patterns.sectorKeywords) {
        if (sectorLower.includes(keyword.toLowerCase())) {
          matched = true;
          weight = 0.7;
          break;
        }
      }
    }

    if (matched) {
      matchedThemes.push({ theme: themeName, weight });
    }
  }

  // Asset class fallbacks
  if (matchedThemes.length === 0) {
    if (assetClass === "crypto") {
      matchedThemes.push({ theme: "Fintech & Crypto", weight: 0.8 });
    } else if (assetClass === "forex") {
      matchedThemes.push({ theme: "Forex & Currencies", weight: 0.8 });
    } else if (assetClass === "commodity") {
      matchedThemes.push({ theme: "Commodities & Mining", weight: 0.8 });
    } else if (assetClass === "etf" || assetClass === "mutual_fund") {
      matchedThemes.push({ theme: "Index & Passive", weight: 0.6 });
    } else if (assetClass === "bond") {
      matchedThemes.push({ theme: "Fixed Income & Bonds", weight: 0.8 });
    } else if (assetClass === "stock") {
      matchedThemes.push({ theme: "Big Tech & Consumer", weight: 0.4 });
    }
  }

  if (matchedThemes.length === 0) {
    matchedThemes.push({ theme: "Growth & Allocation", weight: 0.3 });
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

    console.log("[THEME-SCORING] Starting COMPREHENSIVE theme computation with all 37 data sources...");

    // Fetch all themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name');

    if (themesError) throw themesError;
    console.log(`[THEME-SCORING] Found ${themes?.length || 0} themes`);

    const themeNameToId = new Map(themes?.map(t => [t.name, t.id]) || []);

    // Initialize theme scores
    const themeScores: Record<string, {
      signalCount: number;
      totalMagnitude: number;
      positiveSignals: number;
      negativeSignals: number;
      sources: Set<string>;
    }> = {};

    for (const theme of themes || []) {
      themeScores[theme.name] = {
        signalCount: 0,
        totalMagnitude: 0,
        positiveSignals: 0,
        negativeSignals: 0,
        sources: new Set()
      };
    }

    // Fetch assets for ticker mapping
    const allAssets: any[] = [];
    let assetOffset = 0;
    const ASSET_BATCH = 5000;
    while (true) {
      const { data: batch, error } = await supabaseClient
        .from('assets')
        .select('id, ticker, name, asset_class, metadata')
        .range(assetOffset, assetOffset + ASSET_BATCH - 1);
      
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      allAssets.push(...batch);
      assetOffset += batch.length;
      if (batch.length < ASSET_BATCH) break;
    }
    console.log(`[THEME-SCORING] Loaded ${allAssets.length} assets`);

    // Build mappings
    const assetToThemes = new Map<string, { themes: string[]; weights: number[] }>();
    const tickerToAssetThemes = new Map<string, { themes: string[]; weights: number[] }>();
    
    for (const asset of allAssets) {
      const sector = asset.metadata?.sector || asset.metadata?.industry || null;
      const mapping = assignAssetToThemes(asset.ticker, asset.name, asset.asset_class, sector);
      assetToThemes.set(asset.id, mapping);
      tickerToAssetThemes.set(asset.ticker.toUpperCase(), mapping);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ========================================================================
    // LAYER 1: Process signals table (traditional approach)
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
          signalThemes = ["Growth & Allocation"];
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
    // LAYER 2: Process direct data source tables
    // ========================================================================
    console.log("[THEME-SCORING] Processing direct data sources...");
    
    let directSourcesProcessed = 0;
    
    for (const config of DATA_SOURCE_CONFIGS) {
      try {
        const { data: records, error } = await supabaseClient
          .from(config.table)
          .select('*')
          .gte(config.dateColumn, thirtyDaysAgo.toISOString())
          .limit(2000);
        
        if (error) {
          console.log(`[THEME-SCORING] Skipping ${config.table}: ${error.message}`);
          continue;
        }
        
        if (!records || records.length === 0) continue;
        
        for (const record of records) {
          const ticker = record[config.tickerColumn]?.toUpperCase();
          let recordThemes = config.themes;
          let recordWeights = config.weights;
          
          // Try to get more specific theme from ticker
          if (ticker && tickerToAssetThemes.has(ticker)) {
            const assetMapping = tickerToAssetThemes.get(ticker)!;
            recordThemes = assetMapping.themes;
            recordWeights = assetMapping.weights;
          }
          
          // Determine direction
          let direction = 'neutral';
          if (config.directionField && record[config.directionField]) {
            const dirVal = String(record[config.directionField]).toLowerCase();
            if (dirVal.includes('bull') || dirVal.includes('up') || dirVal.includes('buy') || dirVal.includes('inflow') || dirVal.includes('positive')) {
              direction = 'up';
            } else if (dirVal.includes('bear') || dirVal.includes('down') || dirVal.includes('sell') || dirVal.includes('outflow') || dirVal.includes('negative')) {
              direction = 'down';
            }
          }
          
          // Get magnitude
          let magnitude = 1;
          if (config.magnitudeField && record[config.magnitudeField]) {
            magnitude = Math.abs(Number(record[config.magnitudeField])) || 1;
            magnitude = Math.min(10, Math.log10(magnitude + 1) + 1); // Normalize
          }
          
          // Apply to themes
          for (let i = 0; i < recordThemes.length; i++) {
            const themeName = recordThemes[i];
            const weight = recordWeights[i];
            
            if (themeScores[themeName]) {
              themeScores[themeName].signalCount++;
              themeScores[themeName].totalMagnitude += magnitude * weight;
              themeScores[themeName].sources.add(config.table);
              
              if (direction === 'up') {
                themeScores[themeName].positiveSignals++;
              } else if (direction === 'down') {
                themeScores[themeName].negativeSignals++;
              }
            }
          }
          directSourcesProcessed++;
        }
        
        console.log(`[THEME-SCORING] Processed ${records.length} records from ${config.table}`);
        
      } catch (err) {
        console.log(`[THEME-SCORING] Error processing ${config.table}:`, err);
      }
    }
    
    console.log(`[THEME-SCORING] Processed ${directSourcesProcessed} records from direct sources`);

    // ========================================================================
    // Calculate final scores
    // ========================================================================
    const results: any[] = [];
    const now = new Date();

    for (const theme of themes || []) {
      const stats = themeScores[theme.name];
      if (!stats) continue;

      let score = 50;
      
      if (stats.signalCount > 0) {
        // Signal count contribution (log scale)
        const signalBoost = Math.min(25, Math.log10(stats.signalCount + 1) * 12);
        
        // Sentiment contribution
        const totalDirectional = stats.positiveSignals + stats.negativeSignals;
        let sentimentScore = 0;
        if (totalDirectional > 0) {
          const positiveRatio = stats.positiveSignals / totalDirectional;
          sentimentScore = (positiveRatio - 0.5) * 30;
        }
        
        // Magnitude contribution
        const avgMagnitude = stats.totalMagnitude / stats.signalCount;
        const magnitudeBoost = Math.min(10, avgMagnitude * 3);
        
        // Source diversity bonus
        const sourceBonus = Math.min(10, stats.sources.size * 2);
        
        score = 50 + signalBoost + sentimentScore + magnitudeBoost + sourceBonus;
        score = Math.max(0, Math.min(100, score));
      }

      results.push({
        theme_id: theme.id,
        theme_name: theme.name,
        score: Math.round(score * 100) / 100,
        signal_count: stats.signalCount,
        positive_signals: stats.positiveSignals,
        negative_signals: stats.negativeSignals,
        sources: Array.from(stats.sources),
        computed_at: now.toISOString()
      });
    }

    results.sort((a, b) => b.score - a.score);

    // Log theme distribution
    console.log("[THEME-SCORING] Theme signal distribution:");
    for (const r of results) {
      console.log(`  ${r.theme_name}: ${r.signal_count} signals, score=${r.score.toFixed(1)}, sources=[${r.sources.join(',')}]`);
    }

    // Update database
    for (const result of results) {
      await supabaseClient
        .from('theme_scores')
        .upsert({
          theme_id: result.theme_id,
          score: result.score,
          signal_count: result.signal_count,
          component_scores: {
            positive_signals: result.positive_signals,
            negative_signals: result.negative_signals,
            sources: result.sources
          },
          positive_components: result.positive_signals > result.negative_signals ? ['bullish_momentum'] : [],
          computed_at: result.computed_at
        }, { onConflict: 'theme_id' });

      await supabaseClient
        .from('themes')
        .update({ score: result.score, updated_at: now.toISOString() })
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
