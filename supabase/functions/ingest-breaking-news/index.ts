// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v5 - Optimized: Uses RSS feeds like ingest-news-rss, no Firecrawl, no AI - fast and reliable

// High-volume financial news RSS feeds — expanded to 40+ sources
const NEWS_RSS_FEEDS = [
  // ── Tier 1: Core financial (0.9) ──
  { name: 'Yahoo Finance',           url: 'https://feeds.finance.yahoo.com/rss/2.0/headline',                        priority: 1, relevanceTier: 0.9 },
  { name: 'Yahoo Finance News',      url: 'https://finance.yahoo.com/news/rssindex',                                 priority: 1, relevanceTier: 0.9 },
  { name: 'MarketWatch Top Stories', url: 'https://feeds.marketwatch.com/marketwatch/topstories/',                   priority: 1, relevanceTier: 0.9 },
  { name: 'MarketWatch',             url: 'https://www.marketwatch.com/rss/topstories',                              priority: 1, relevanceTier: 0.9 },
  { name: 'Reuters Top News',        url: 'https://feeds.reuters.com/reuters/topNews',                               priority: 1, relevanceTier: 0.9 },
  { name: 'Reuters Business',        url: 'https://feeds.reuters.com/reuters/businessNews',                          priority: 1, relevanceTier: 0.9 },
  { name: 'Reuters Technology',      url: 'https://feeds.reuters.com/reuters/technologyNews',                        priority: 1, relevanceTier: 0.85 },
  { name: 'Reuters Health',          url: 'https://feeds.reuters.com/reuters/healthNews',                            priority: 2, relevanceTier: 0.8 },
  { name: 'Reuters Environment',     url: 'https://feeds.reuters.com/reuters/environment',                           priority: 2, relevanceTier: 0.75 },
  { name: 'WSJ World News',          url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',                            priority: 1, relevanceTier: 0.9 },
  { name: 'WSJ Markets',             url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',                          priority: 1, relevanceTier: 0.9 },
  { name: 'WSJ Business',            url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',                        priority: 1, relevanceTier: 0.9 },
  { name: 'WSJ Tech',                url: 'https://feeds.a.dj.com/rss/RSSWSJD.xml',                                 priority: 1, relevanceTier: 0.85 },
  { name: 'FT Home',                 url: 'https://www.ft.com/rss/home',                                            priority: 1, relevanceTier: 0.9 },
  { name: 'Investors.com',           url: 'https://www.investors.com/feed/',                                         priority: 1, relevanceTier: 0.85 },

  // ── Tier 1: CNBC (0.85–0.9) ──
  { name: 'CNBC Top News',           url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',                  priority: 1, relevanceTier: 0.9 },
  { name: 'CNBC World Markets',      url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',                  priority: 1, relevanceTier: 0.9 },
  { name: 'CNBC Earnings',           url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',                   priority: 1, relevanceTier: 0.9 },
  { name: 'CNBC Finance',            url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',                   priority: 1, relevanceTier: 0.85 },
  { name: 'CNBC Business',           url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html',                   priority: 1, relevanceTier: 0.85 },
  { name: 'CNBC Tech',               url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html',                   priority: 1, relevanceTier: 0.85 },

  // ── Tier 1: BBC (0.85) ──
  { name: 'BBC World',               url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                            priority: 1, relevanceTier: 0.85 },
  { name: 'BBC Business',            url: 'https://feeds.bbci.co.uk/news/business/rss.xml',                         priority: 1, relevanceTier: 0.9 },
  { name: 'BBC Technology',          url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',                       priority: 1, relevanceTier: 0.85 },
  { name: 'BBC Health',              url: 'https://feeds.bbci.co.uk/news/health/rss.xml',                           priority: 2, relevanceTier: 0.8 },
  { name: 'BBC Science',             url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',          priority: 2, relevanceTier: 0.75 },

  // ── Tier 1: NYT (0.8) ──
  { name: 'NYT World',               url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',                 priority: 1, relevanceTier: 0.8 },
  { name: 'NYT Business',            url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',              priority: 1, relevanceTier: 0.85 },
  { name: 'NYT Technology',          url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',            priority: 1, relevanceTier: 0.8 },
  { name: 'NYT Health',              url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',                priority: 2, relevanceTier: 0.75 },

  // ── Tier 2: Analysis & opinion (0.75) ──
  { name: 'Seeking Alpha',           url: 'https://seekingalpha.com/market_currents.xml',                           priority: 2, relevanceTier: 0.75 },
  { name: 'Benzinga',                url: 'https://www.benzinga.com/feed/',                                         priority: 2, relevanceTier: 0.75 },
  { name: 'Business Insider',        url: 'https://feeds.feedburner.com/businessinsider',                           priority: 2, relevanceTier: 0.75 },
  { name: 'Politico',                url: 'https://www.politico.com/rss/politicopicks.xml',                         priority: 2, relevanceTier: 0.75 },
  { name: 'The Hill',                url: 'https://thehill.com/feed/',                                              priority: 2, relevanceTier: 0.7 },
  { name: 'Al Jazeera',              url: 'https://www.aljazeera.com/xml/rss/all.xml',                              priority: 2, relevanceTier: 0.75 },
  { name: 'Foreign Policy',          url: 'https://foreignpolicy.com/feed/',                                        priority: 2, relevanceTier: 0.75 },
  { name: 'Defense News',            url: 'https://www.defensenews.com/arc/outboundfeeds/rss/',                     priority: 2, relevanceTier: 0.75 },

  // ── Tier 2: Crypto (0.65) ──
  { name: 'CoinTelegraph',           url: 'https://cointelegraph.com/rss',                                          priority: 2, relevanceTier: 0.65 },
  { name: 'CoinDesk',                url: 'https://coindesk.com/arc/outboundfeeds/rss/',                            priority: 2, relevanceTier: 0.65 },
  { name: 'Decrypt',                 url: 'https://decrypt.co/feed',                                                priority: 2, relevanceTier: 0.65 },

  // ── Tier 2: Commodities & sector (0.65) ──
  { name: 'OilPrice',                url: 'https://oilprice.com/rss/main',                                          priority: 2, relevanceTier: 0.65 },
  { name: 'Mining.com',              url: 'https://www.mining.com/feed/',                                           priority: 2, relevanceTier: 0.65 },

  // ── Tier 3: Tech (0.65) ──
  { name: 'TechCrunch',              url: 'https://techcrunch.com/feed/',                                           priority: 2, relevanceTier: 0.65 },
];

// Ticker patterns for extraction
const TICKER_PATTERNS = [
  /\$([A-Z]{1,5})\b/g,
  /\(([A-Z]{2,5})\)/g,
  /\bNASDAQ:\s*([A-Z]{1,5})\b/gi,
  /\bNYSE:\s*([A-Z]{1,5})\b/gi,
];

// Company to ticker mappings
const COMPANY_MAPPINGS: Record<string, string> = {
  'Apple': 'AAPL', 'Microsoft': 'MSFT', 'Google': 'GOOGL', 'Alphabet': 'GOOGL', 'Amazon': 'AMZN',
  'Tesla': 'TSLA', 'Meta': 'META', 'Netflix': 'NFLX', 'Nvidia': 'NVDA', 'AMD': 'AMD',
  'Intel': 'INTC', 'Disney': 'DIS', 'Boeing': 'BA', 'Nike': 'NKE', 'JPMorgan': 'JPM',
  'Goldman Sachs': 'GS', 'Bank of America': 'BAC', 'Visa': 'V', 'Mastercard': 'MA',
  'PayPal': 'PYPL', 'Coinbase': 'COIN', 'Walmart': 'WMT', 'Target': 'TGT', 'Costco': 'COST',
  'Home Depot': 'HD', 'Coca-Cola': 'KO', 'Pepsi': 'PEP', 'Starbucks': 'SBUX',
  'Exxon': 'XOM', 'Chevron': 'CVX', 'Pfizer': 'PFE', 'Moderna': 'MRNA', 'Johnson & Johnson': 'JNJ',
  'UnitedHealth': 'UNH', 'Salesforce': 'CRM', 'Adobe': 'ADBE', 'Oracle': 'ORCL',
  'Qualcomm': 'QCOM', 'Broadcom': 'AVGO', 'Micron': 'MU', 'Palantir': 'PLTR', 'CrowdStrike': 'CRWD',
  'Rivian': 'RIVN', 'Lucid': 'LCID', 'NIO': 'NIO', 'Ford': 'F', 'GM': 'GM',
  'Snap': 'SNAP', 'Spotify': 'SPOT', 'Roku': 'ROKU', 'Roblox': 'RBLX',
  'GameStop': 'GME', 'AMC': 'AMC', 'Delta': 'DAL', 'United Airlines': 'UAL',
  'Caterpillar': 'CAT', 'Lockheed Martin': 'LMT', 'AT&T': 'T', 'Verizon': 'VZ',
  'ASML': 'ASML', 'Taiwan Semiconductor': 'TSM', 'TSMC': 'TSM', 'Uber': 'UBER',
  'Airbnb': 'ABNB', 'Snowflake': 'SNOW', 'Datadog': 'DDOG', 'Cloudflare': 'NET',
  'Bitcoin': 'BTC', 'Ethereum': 'ETH', 'Solana': 'SOL', 'XRP': 'XRP', 'Dogecoin': 'DOGE',
  'Apple Inc': 'AAPL', 'Microsoft Corp': 'MSFT', 'Amazon.com': 'AMZN',
};

// Topic-to-ticker map: scan title + first 500 chars of content, add matching tickers
const TOPIC_TICKER_MAP: Record<string, string[]> = {
  // ENERGY & OIL
  'oil': ['XOM','CVX','BP','COP','SLB','HAL','OXY','USO','BNO','VLO','PSX','MPC'],
  'crude': ['XOM','CVX','BP','COP','SLB','USO','BNO'],
  'crude oil': ['XOM','CVX','BP','COP','SLB','USO'],
  'opec': ['XOM','CVX','BP','COP','SLB','HAL','USO'],
  'natural gas': ['LNG','AR','EQT','SWN','UNG','RRC','CNX'],
  'lng': ['LNG','AR','EQT','SWN','UNG'],
  'fuel': ['XOM','CVX','VLO','PSX','MPC','BP'],
  'gasoline': ['VLO','PSX','MPC','XOM','CVX'],
  'diesel': ['VLO','PSX','MPC','XOM','CVX'],
  'pipeline': ['KMI','ET','EPD','WMB','ENB','TRP'],
  'refinery': ['VLO','PSX','MPC','PBF','DK'],
  'drilling': ['SLB','HAL','BKR','HP','NBR'],
  'energy': ['XLE','XOM','CVX','NEE','DUK','SO','AEP','EXC'],
  'electricity': ['NEE','DUK','SO','AEP','EXC','CEG','VST'],
  'power grid': ['NEE','DUK','SO','AEP','EXC','PCG','EIX'],
  'blackout': ['NEE','DUK','SO','AEP','PCG','EIX'],
  'coal': ['BTU','ARCH','CEIX','AMR'],
  'uranium': ['CCJ','UEC','NNE','SMR','BWXT','DNN'],
  'nuclear': ['CCJ','UEC','NNE','SMR','BWXT','CEG','VST'],
  'power plant': ['NEE','DUK','SO','AEP','CEG','VST'],
  'energy crisis': ['XOM','CVX','BP','LNG','NEE','UNG'],
  'gas price': ['VLO','PSX','MPC','XOM','CVX','USO'],
  'oil price': ['XOM','CVX','BP','COP','USO','BNO'],
  'oil spill': ['XOM','CVX','BP','COP','SLB'],
  'fracking': ['XOM','CVX','COP','EOG','FANG','MRO'],
  // GEOPOLITICAL & WAR
  'war': ['LMT','RTX','NOC','GD','BA','HII','KTOS','CACI','SAIC'],
  'conflict': ['LMT','RTX','NOC','GD','BA','HII'],
  'military': ['LMT','RTX','NOC','GD','BA','HII','KTOS'],
  'defense': ['LMT','RTX','NOC','GD','BA','HII','KTOS','CACI'],
  'weapon': ['LMT','RTX','NOC','GD','BA','HII'],
  'missile': ['LMT','RTX','NOC','GD','BA'],
  'bomb': ['LMT','RTX','NOC','GD','BA'],
  'drone': ['LMT','RTX','KTOS','AVAV'],
  'navy': ['HII','GD','LMT','RTX','NOC'],
  'army': ['LMT','RTX','NOC','GD','BA','HII'],
  'air force': ['LMT','RTX','NOC','GD','BA'],
  'ukraine': ['LMT','RTX','NOC','GD','BA','XOM','CVX'],
  'russia': ['LMT','RTX','NOC','GOLD','NEM','XOM','UNG'],
  'china': ['BABA','JD','PDD','BIDU','NVDA','AMAT','LRCX','TSM'],
  'taiwan': ['TSM','NVDA','AMD','INTC','AMAT','KLAC','LRCX','ASML'],
  'taiwan strait': ['TSM','NVDA','AMD','INTC','AMAT','KLAC'],
  'middle east': ['XOM','CVX','BP','LMT','RTX','NOC','USO'],
  'israel': ['XOM','CVX','LMT','RTX','NOC','USO'],
  'gaza': ['XOM','CVX','LMT','RTX','NOC'],
  'iran': ['XOM','CVX','LMT','RTX','USO','BNO'],
  'saudi': ['XOM','CVX','BP','SLB','HAL','USO'],
  'saudi arabia': ['XOM','CVX','BP','SLB','HAL','USO'],
  'north korea': ['LMT','RTX','NOC','GD','BA'],
  'pakistan': ['LMT','RTX','NOC'],
  'india pakistan': ['LMT','RTX','NOC','GD'],
  'afghanistan': ['LMT','RTX','NOC','GD','BA'],
  'syria': ['LMT','RTX','NOC','XOM','CVX'],
  'yemen': ['LMT','RTX','NOC','XOM','CVX'],
  'venezuela': ['XOM','CVX','SLB','HAL','USO'],
  'sanctions': ['GS','JPM','MS','C','BAC','XOM','CVX'],
  'tariff': ['CAT','DE','BA','GE','MMM','HON','XLI','AA','NUE'],
  'trade war': ['CAT','DE','BA','BABA','JD','NVDA','AMAT'],
  'trade deal': ['CAT','DE','BA','XOM','AAPL','MSFT'],
  'trade deficit': ['CAT','DE','BA','XOM','CVX','ADM'],
  'import': ['CAT','DE','AA','NUE','STLD','X'],
  'export': ['CAT','DE','BA','XOM','CVX','ADM','BG'],
  'border': ['GEO','CXW','LMT','RTX'],
  'immigration': ['GEO','CXW'],
  'migration': ['GEO','CXW'],
  'terrorism': ['LMT','RTX','NOC','GD','BA'],
  'coup': ['XOM','CVX','LMT','GLD','NEM'],
  'protest': ['XOM','CVX','LMT','RTX'],
  'civil war': ['LMT','RTX','NOC','GD','XOM'],
  'nato': ['LMT','RTX','NOC','GD','BA','HII'],
  'g7': ['GLD','TLT','JPM','GS','XOM'],
  'g20': ['GLD','TLT','JPM','GS','XOM'],
  'geopolitical': ['LMT','RTX','XOM','CVX','GLD','TLT'],
  'espionage': ['LMT','RTX','NOC','CACI','SAIC'],
  // US GOVERNMENT & POLICY
  'federal reserve': ['GLD','TLT','SPY','XLF','JPM','BAC','GS','MS'],
  'fed rate': ['GLD','TLT','XLF','JPM','BAC','WFC','USB','GS'],
  'interest rate': ['GLD','TLT','XLF','JPM','BAC','WFC','USB','RKT'],
  'rate hike': ['GLD','TLT','XLF','JPM','BAC','WFC','USB'],
  'rate cut': ['GLD','TLT','SPY','QQQ','XLF','JPM','RDFN','Z'],
  'jerome powell': ['GLD','TLT','XLF','JPM','BAC','SPY'],
  'inflation': ['GLD','SLV','TIP','XLE','XOM','CVX','MOS','ADM'],
  'cpi': ['GLD','SLV','TIP','XLE','XOM','WMT','AMZN'],
  'pce': ['GLD','TLT','XLF','JPM','WMT'],
  'ppi': ['GLD','SLV','TIP','XLE','MOS','ADM'],
  'recession': ['GLD','TLT','WMT','DG','DLTR','PG','JNJ','KO','PEP'],
  'stimulus': ['SPY','QQQ','XLF','JPM','GS','AMZN','BA'],
  'quantitative easing': ['GLD','TLT','SPY','QQQ','JPM'],
  'gdp': ['SPY','QQQ','XLF','IWM','CAT','DE'],
  'debt ceiling': ['TLT','GLD','JPM','GS','MS'],
  'government shutdown': ['LMT','RTX','NOC','GD','BA','TLT'],
  'unemployment': ['WMT','AMZN','DG','DLTR','JPM','XLF','UNP'],
  'jobs report': ['SPY','QQQ','XLF','JPM','WMT','AMZN'],
  'payroll': ['SPY','QQQ','XLF','JPM','ADP','PAYX'],
  'nonfarm payroll': ['SPY','QQQ','XLF','JPM','ADP'],
  'budget': ['LMT','RTX','NOC','GD','BA','TLT'],
  'deficit': ['TLT','GLD','JPM','GS','MS'],
  'election': ['LMT','RTX','GD','GEO','CXW','XOM','CVX'],
  'trump': ['LMT','XOM','CVX','TSLA','GEO','CXW','BA','COIN'],
  'biden': ['NEE','ENPH','FSLR','F','GM','PLUG'],
  'harris': ['NEE','ENPH','FSLR','F','GM'],
  'congress': ['LMT','RTX','NOC','GD','BA','JPM','GS'],
  'senate': ['LMT','RTX','NOC','GD','BA','JPM','GS'],
  'white house': ['LMT','RTX','XOM','CVX','JPM','GS'],
  'regulation': ['JPM','BAC','GS','META','GOOGL','AMZN','MSFT'],
  'antitrust': ['GOOGL','META','AMZN','MSFT','AAPL'],
  'doge': ['TSLA','COIN'],
  'elon musk': ['TSLA','COIN','SPCE','X'],
  'tax': ['BX','KKR','JPM','GS','MS','BRK-B'],
  'tax cut': ['BX','KKR','JPM','GS','SPY','QQQ'],
  'subsidy': ['TSLA','GM','F','NEE','ENPH','FSLR','BA'],
  'irs': ['JPM','GS','MS','BX','KKR'],
  'sec': ['COIN','MSTR','MARA','RIOT','JPM','GS'],
  'cftc': ['COIN','CME','ICE','NDAQ'],
  'fcc': ['T','VZ','TMUS','CMCSA','CHTR'],
  'epa': ['NEE','ENPH','FSLR','XOM','CVX','DOW'],
  // HEALTHCARE & PHARMA
  'fda': ['PFE','JNJ','MRNA','BNTX','ABBV','BMY','LLY','REGN','AMGN'],
  'drug approval': ['PFE','JNJ','MRNA','BNTX','ABBV','BMY','LLY','REGN'],
  'drug recall': ['PFE','JNJ','MRNA','ABBV','BMY','MRK'],
  'clinical trial': ['PFE','JNJ','MRNA','BNTX','ABBV','BMY','LLY','REGN','AMGN'],
  'phase 3': ['PFE','JNJ','MRNA','BNTX','ABBV','BMY','LLY','REGN'],
  'vaccine': ['PFE','MRNA','BNTX','JNJ','AZN','NVAX'],
  'pandemic': ['PFE','MRNA','BNTX','ZM','TDOC','AMZN','WMT'],
  'epidemic': ['PFE','MRNA','BNTX','JNJ','UNH','HCA'],
  'outbreak': ['PFE','MRNA','BNTX','JNJ','HCA','THC','UNH'],
  'virus': ['PFE','MRNA','BNTX','JNJ','GILD','REGN'],
  'disease': ['PFE','JNJ','MRNA','LLY','BMY','ABBV','MRK'],
  'cancer': ['BMY','MRK','ABBV','AZN','RHHBY','REGN','LLY','AGEN'],
  'tumor': ['BMY','MRK','ABBV','REGN','LLY'],
  'obesity': ['LLY','NVO','AMGN','VKTX'],
  'ozempic': ['NVO','LLY','AMGN'],
  'wegovy': ['NVO','LLY','AMGN'],
  'diabetes': ['LLY','NVO','DXCM','ABBV','BMY'],
  'alzheimer': ['BIIB','REGN','LLY','RHHBY'],
  'dementia': ['BIIB','REGN','LLY','RHHBY','ANAVEX'],
  'mental health': ['JNJ','AZN','ABBV'],
  'opioid': ['JNJ','PFE','TEVA','MNK'],
  'hospital': ['HCA','THC','UHS','CYH'],
  'healthcare': ['UNH','CVS','CI','HUM','CNC','MOH','HCA','THC'],
  'insurance': ['UNH','CVS','CI','HUM','CNC','MOH'],
  'medicare': ['UNH','CVS','CI','HUM','CNC','MOH'],
  'medicaid': ['UNH','CVS','CI','HUM','CNC','MOH'],
  'generic drug': ['TEVA','MYL','AMRX','PRGO'],
  'biotech': ['XBI','IBB','MRNA','BNTX','REGN','VRTX','ALNY'],
  'gene therapy': ['BLUE','CRSP','EDIT','NTLA','BEAM'],
  'gene editing': ['CRSP','EDIT','NTLA','BEAM','BLUE'],
  'medical device': ['MDT','ABT','BSX','SYK','ZBH','EW'],
  'robotic surgery': ['ISRG','MDT','ABT'],
  'pharmacy': ['CVS','WBA','RAD','MCK','CAH','ABC'],
  'drug price': ['PFE','JNJ','MRNA','ABBV','MRK','CVS','UNH'],
  'weight loss': ['LLY','NVO','AMGN','WW','VKTX'],
  'bird flu': ['PFE','MRNA','BNTX','JNJ','NVAX'],
  'mpox': ['PFE','MRNA','BNTX','JNJ','NVAX'],
  'covid': ['PFE','MRNA','BNTX','JNJ','GILD','REGN'],
  'flu': ['PFE','MRNA','BNTX','JNJ','NVAX'],
  'measles': ['PFE','MRNA','JNJ','NVAX'],
  'antibiotic': ['PFE','JNJ','MRK','ABBV','BMY'],
  'heart': ['JNJ','ABT','MDT','BSX','EW','PFE'],
  'cardiac': ['JNJ','ABT','MDT','BSX','EW'],
  'stroke': ['JNJ','PFE','BMY','ABBV','AZN'],
  'immunotherapy': ['BMY','MRK','REGN','AZN','RHHBY'],
  'mrna': ['MRNA','BNTX','PFE','JNJ'],
  // TECHNOLOGY
  'ai': ['NVDA','MSFT','GOOGL','META','AMD','AMZN','TSM','AVGO'],
  'artificial intelligence': ['NVDA','MSFT','GOOGL','META','AMD','AMZN','TSM'],
  'chatgpt': ['MSFT','NVDA','GOOGL','META','AMD'],
  'openai': ['MSFT','NVDA','AMD','GOOGL'],
  'gemini': ['GOOGL','NVDA','AMD','MSFT'],
  'anthropic': ['GOOGL','AMZN','NVDA','AMD'],
  'llm': ['NVDA','MSFT','GOOGL','META','AMD','AMZN'],
  'machine learning': ['NVDA','MSFT','GOOGL','META','AMD','AMZN'],
  'deep learning': ['NVDA','MSFT','GOOGL','META','AMD'],
  'semiconductor': ['NVDA','AMD','INTC','TSM','AMAT','KLAC','LRCX','ASML','MRVL'],
  'chip': ['NVDA','AMD','INTC','TSM','QCOM','AVGO','MU','ON','MCHP'],
  'chip shortage': ['NVDA','AMD','INTC','TSM','QCOM','AVGO','F','GM','AAPL'],
  'chip export': ['NVDA','AMD','INTC','TSM','AMAT','LRCX','KLAC','ASML'],
  'chip ban': ['NVDA','AMD','INTC','TSM','AMAT','LRCX','KLAC'],
  'gpu': ['NVDA','AMD','INTC','MRVL'],
  'cpu': ['INTC','AMD','QCOM','AAPL','MRVL'],
  'memory chip': ['MU','WDC','SKH'],
  'cybersecurity': ['CRWD','PANW','ZS','FTNT','OKTA','S','CYBR','TENB'],
  'hack': ['CRWD','PANW','ZS','FTNT','OKTA','S'],
  'ransomware': ['CRWD','PANW','ZS','FTNT','OKTA','S'],
  'data breach': ['CRWD','PANW','ZS','FTNT','OKTA'],
  'cyberattack': ['CRWD','PANW','ZS','FTNT','OKTA','S'],
  'cloud': ['AMZN','MSFT','GOOGL','CRM','NOW','SNOW','DDOG','NET'],
  'aws': ['AMZN'],
  'azure': ['MSFT'],
  'google cloud': ['GOOGL'],
  'saas': ['CRM','NOW','WDAY','ORCL','SAP','ADBE','VEEV'],
  'data center': ['NVDA','AMD','INTC','EQIX','DLR','AMT','AMZN','MSFT'],
  'electric vehicle': ['TSLA','RIVN','LCID','NIO','LI','XPEV','GM','F','STLA'],
  'ev': ['TSLA','RIVN','LCID','NIO','LI','GM','F','STLA'],
  'self driving': ['TSLA','GOOGL','GM','INTC'],
  'autonomous vehicle': ['TSLA','GOOGL','GM','INTC'],
  'battery': ['TSLA','ALB','SQM','LTHM','LAC','QS'],
  'lithium': ['ALB','SQM','LTHM','LAC','TSLA','PLL'],
  'charging': ['TSLA','CHPT','BLNK','EVGO','ABB'],
  'robotics': ['ISRG','IRBT','ABB','ROK','HON','NVDA'],
  'automation': ['ROK','HON','ABB','FANUC','NVDA'],
  'quantum': ['IBM','IONQ','RGTI','QUBT','MSFT','GOOGL'],
  'space': ['SPCE','BA','LMT','NOC','RKLB','MNTS'],
  'spacex': ['BA','LMT','NOC','RKLB'],
  'satellite': ['SPCE','RKLB','ASTS','GSAT','SATS'],
  'starlink': ['RKLB','ASTS','GSAT'],
  'metaverse': ['META','RBLX','MSFT','NVDA','U','SNAP'],
  'social media': ['META','SNAP','PINS','RDDT','GOOGL'],
  'tiktok': ['META','SNAP','GOOGL','PINS'],
  'streaming': ['NFLX','DIS','PARA','WBD','ROKU','AMZN'],
  'gaming': ['ATVI','EA','TTWO','MSFT','SONY','RBLX','U'],
  'smartphone': ['AAPL','GOOGL','QCOM','AVGO','TSM','MU'],
  'iphone': ['AAPL','QCOM','AVGO','TSM'],
  '5g': ['QCOM','ERIC','NOK','T','VZ','TMUS','AVGO'],
  'internet': ['GOOGL','META','AMZN','NET','FSLY','AKAM'],
  'broadband': ['CMCSA','CHTR','T','VZ','TMUS'],
  'ecommerce': ['AMZN','SHOP','EBAY','ETSY','WMT','TGT'],
  'fintech': ['SQ','PYPL','AFRM','UPST','SOFI','LC','COIN'],
  'software': ['MSFT','CRM','NOW','WDAY','ORCL','SAP','ADBE'],
  'blockchain': ['COIN','MSTR','IBM','MARA','RIOT'],
  'surveillance': ['CACI','SAIC','LMT','AXON','MSFT'],
  '3d printing': ['DDD','SSYS','XONE','NNDM'],
  'storage': ['WDC','STX','NTAP','PURE'],
  // FINANCE & BANKING
  'bank': ['JPM','BAC','WFC','C','GS','MS','USB','TFC','PNC'],
  'banking': ['JPM','BAC','WFC','C','GS','MS','USB','TFC','PNC'],
  'banking crisis': ['GLD','JPM','BAC','WFC','C','XLF'],
  'bank failure': ['GLD','JPM','BAC','WFC','C','TLT'],
  'bank run': ['GLD','JPM','BAC','WFC','TLT'],
  'credit': ['JPM','BAC','WFC','C','GS','MS','AXP','DFS','COF'],
  'credit card': ['AXP','V','MA','DFS','COF','SYF'],
  'credit rating': ['MCO','SPGI','JPM','GS','BAC'],
  'debt': ['JPM','BAC','WFC','GS','MS','TLT','HYG','LQD'],
  'bond': ['TLT','IEF','SHY','HYG','LQD','BND'],
  'treasury': ['TLT','IEF','SHY','BND','GLD'],
  'yield': ['TLT','IEF','JPM','BAC','WFC','GS'],
  'yield curve': ['TLT','IEF','JPM','BAC','WFC','GS'],
  'mortgage': ['RKT','UWMC','PFSI','FNF','FAF','MTG'],
  'housing market': ['DHI','LEN','PHM','TOL','NVR','ITB'],
  'real estate': ['SPG','O','VICI','PLD','EQR','AVB','AMT'],
  'commercial real estate': ['SPG','O','BXP','VNO','SLG'],
  'reit': ['O','VICI','PLD','EQR','AVB','AMT','EQIX'],
  'private equity': ['BX','KKR','APO','CG','ARES'],
  'ipo': ['GS','MS','JPM','COIN'],
  'merger': ['GS','MS','JPM','LAZ','EVR'],
  'acquisition': ['GS','MS','JPM','LAZ','EVR'],
  'buyout': ['BX','KKR','APO','CG','ARES'],
  'hedge fund': ['BX','KKR','APO','MS','GS'],
  'bitcoin': ['COIN','MSTR','MARA','RIOT','CLSK','HUT'],
  'crypto': ['COIN','MSTR','MARA','RIOT','CLSK','HUT'],
  'ethereum': ['COIN'],
  'defi': ['COIN','MSTR'],
  'stablecoin': ['COIN','MSTR','SQ','PYPL'],
  'dollar': ['UUP','GLD','TLT','JPM','GS'],
  'currency': ['UUP','GLD','TLT','FXE','FXY'],
  'forex': ['UUP','FXE','FXY','FXB','FXC'],
  'yen': ['FXY','TM','SONY','HMC','MUFG'],
  'euro': ['FXE','ASML','SAP','LVMUY','BP'],
  'yuan': ['BABA','JD','PDD','BIDU'],
  'pound': ['FXB','BP','AZN','GSK','HSBC'],
  'gold standard': ['GLD','GDX','NEM','GOLD'],
  'central bank': ['GLD','TLT','JPM','GS','SPY'],
  'payment': ['V','MA','PYPL','SQ','AXP','FIS','FI'],
  'visa': ['V','MA','AXP','PYPL'],
  'mastercard': ['MA','V','AXP','PYPL'],
  'paypal': ['PYPL','SQ','V','MA'],
  'insurance claim': ['ALL','TRV','CB','WRB','AIG','MET'],
  'life insurance': ['MET','PRU','LNC','AFL','UNM'],
  'stock market': ['SPY','QQQ','IWM','DIA','VTI'],
  'market crash': ['GLD','TLT','VIX','SPY','QQQ'],
  'bull market': ['SPY','QQQ','IWM','DIA','ARKK'],
  'bear market': ['GLD','TLT','VIX','SH','PSQ'],
  'volatility': ['VIX','VIXY','UVXY','GLD','TLT'],
  'selloff': ['GLD','TLT','VIX','SH','PSQ'],
  // COMMODITIES & MATERIALS
  'gold': ['GLD','GDX','NEM','GOLD','AEM','WPM','KGC','AGI'],
  'silver': ['SLV','WPM','PAAS','AG','CDE','HL'],
  'copper': ['FCX','SCCO','TECK','BHP','RIO','COPX'],
  'iron ore': ['BHP','RIO','VALE','CLF','NUE','STLD','X'],
  'steel': ['NUE','STLD','X','CLF','MT','TX'],
  'aluminum': ['AA','CENX','KALU'],
  'mining': ['BHP','RIO','FCX','NEM','GOLD','NUE','AA','TECK'],
  'rare earth': ['MP','UCORE'],
  'wheat': ['ADM','BG','CTVA','MOS','WEAT'],
  'corn': ['ADM','BG','CTVA','MOS','CORN'],
  'soybean': ['ADM','BG','CTVA','MOS','SOYB'],
  'coffee': ['SBUX','KDP','MDLZ'],
  'cocoa': ['MDLZ','HSY','NESN'],
  'sugar': ['ADM','BG','CANE'],
  'food': ['ADM','BG','TSN','CAG','CPB','GIS','K','SJM'],
  'food prices': ['ADM','BG','TSN','CAG','WMT','KR','SFM'],
  'food shortage': ['ADM','BG','MOS','NTR','DE','AGCO'],
  'agriculture': ['ADM','BG','CTVA','MOS','DE','AGCO','CNH'],
  'fertilizer': ['MOS','NTR','CF','ICL'],
  'drought': ['MOS','NTR','ADM','BG','DE','AGCO'],
  'flood': ['MOS','NTR','ADM','BG','WMT','KR'],
  'water': ['AWK','WTR','YORW','CWT','SJW'],
  'timber': ['WY','RYN','PCH','LPX','OSB'],
  'lumber': ['WY','RYN','LPX'],
  'chemicals': ['DOW','LYB','DD','PPG','SHW','RPM'],
  // TRANSPORT & LOGISTICS
  'shipping': ['ZIM','DAC','MATX','SBLK','GOGL','DSX','EGLE'],
  'container ship': ['ZIM','DAC','MATX','SBLK'],
  'suez canal': ['ZIM','DAC','MATX','SBLK','XOM'],
  'panama canal': ['ZIM','DAC','MATX','SBLK','UPS'],
  'freight': ['UPS','FDX','XPO','CHRW','JBHT','EXPD','GXO'],
  'supply chain': ['UPS','FDX','XPO','CHRW','JBHT','EXPD'],
  'logistics': ['UPS','FDX','XPO','CHRW','JBHT','EXPD','GXO'],
  'port': ['ZIM','DAC','UPS','FDX','MATX'],
  'port strike': ['ZIM','DAC','UPS','FDX','MATX','AMZN'],
  'airline': ['DAL','UAL','AAL','LUV','ALK','HA','JBLU'],
  'aviation': ['DAL','UAL','AAL','LUV','BA','AIR'],
  'aircraft': ['BA','LMT','NOC','GD','HII'],
  'railroad': ['UNP','CSX','NSC','CNI','CP'],
  'truck': ['JBHT','WERN','ODFL','XPO','SAIA','KNX'],
  'ride sharing': ['UBER','LYFT'],
  'delivery': ['AMZN','UPS','FDX','DASH','UBER'],
  // CONSUMER & RETAIL
  'retail': ['WMT','TGT','AMZN','COST','DG','DLTR','BBY','HD','LOW'],
  'consumer spending': ['WMT','TGT','AMZN','COST','SBUX','MCD','NKE'],
  'consumer confidence': ['WMT','TGT','AMZN','COST','XLP','XLY'],
  'holiday': ['WMT','TGT','AMZN','COST','BBY','EBAY','ETSY'],
  'black friday': ['WMT','TGT','AMZN','COST','BBY','HD','LOW'],
  'cyber monday': ['AMZN','SHOP','EBAY','WMT','TGT'],
  'luxury': ['LVMUY','CPRI','TPR','RL','PVH'],
  'fashion': ['LVMUY','CPRI','TPR','RL','NKE','LULU','UA'],
  'restaurant': ['MCD','SBUX','YUM','DPZ','CMG','SHAK','WEN'],
  'fast food': ['MCD','SBUX','YUM','DPZ','CMG','WEN'],
  'food delivery': ['DASH','UBER','GRUB','WMT','AMZN'],
  'grocery': ['KR','SFM','WMT','TGT','COST','ACI'],
  'alcohol': ['STZ','BUD','TAP','SAM','DEO'],
  'beer': ['BUD','TAP','SAM','STZ'],
  'wine': ['DEO','STZ','BF-B'],
  'tobacco': ['MO','PM','BTI','VGR'],
  'vaping': ['MO','PM','BTI'],
  'cannabis': ['TLRY','CGC','ACB','CRON','CURLF'],
  'gambling': ['DKNG','MGM','WYNN','LVS','PENN','CZR'],
  'casino': ['MGM','WYNN','LVS','PENN','CZR'],
  'sports betting': ['DKNG','PENN','MGM','CZR'],
  // CLIMATE & ENVIRONMENT
  'climate change': ['NEE','ENPH','FSLR','PLUG','BE','TSLA','RUN'],
  'global warming': ['NEE','ENPH','FSLR','PLUG','TSLA'],
  'emissions': ['NEE','ENPH','FSLR','TSLA','GM','F','XOM'],
  'net zero': ['NEE','ENPH','FSLR','TSLA','XOM','CVX'],
  'solar': ['ENPH','FSLR','SEDG','RUN','ARRY','NOVA','SHLS'],
  'wind': ['NEE','BEP','CWEN'],
  'clean energy': ['NEE','ENPH','FSLR','PLUG','BE','RUN','CWEN'],
  'renewable energy': ['NEE','ENPH','FSLR','PLUG','BEP','CWEN'],
  'hydrogen': ['PLUG','BE','FCEL','BLDP','ITM'],
  'carbon capture': ['OXY','XOM','CVX','ETR','NEE'],
  'wildfire': ['PCG','EIX','NEE','XOM','CVX'],
  'hurricane': ['ALL','TRV','CB','WRB','RNR','AIG'],
  'tornado': ['ALL','TRV','CB','WRB','RNR'],
  'earthquake': ['ALL','TRV','CB','WRB','RNR'],
  'natural disaster': ['ALL','TRV','CB','WRB','RNR','AIG'],
  'heatwave': ['NEE','DUK','SO','AEP','XOM'],
  'pollution': ['NEE','ENPH','FSLR','XOM','CVX','DOW'],
  'esg': ['NEE','ENPH','FSLR','TSLA','BLK'],
  // REAL ESTATE & CONSTRUCTION
  'housing': ['DHI','LEN','PHM','TOL','NVR','ITB','XHB'],
  'home sales': ['DHI','LEN','PHM','TOL','NVR','RDFN','Z'],
  'construction': ['CAT','DE','VMC','MLM','CRH','USG','OC'],
  'infrastructure': ['CAT','DE','VMC','MLM','XYL'],
  'cement': ['VMC','MLM','CRH','SUM','EXP'],
  'home improvement': ['HD','LOW','SHW','MHK'],
  'work from home': ['ZM','MSFT','GOOGL','AMZN','OKTA'],
  'remote work': ['ZM','MSFT','GOOGL','AMZN','OKTA','DDOG'],
  // MEDIA & ENTERTAINMENT
  'media': ['DIS','PARA','WBD','NFLX','CMCSA','FOXA','NYT'],
  'box office': ['DIS','AMC','CNK','IMAX','PARA','WBD'],
  'streaming': ['NFLX','DIS','PARA','WBD','ROKU','AMZN'],
  'music': ['SPOT','LYV','SONY'],
  'advertising': ['META','GOOGL','TTD','MGNI','PUBM','IPG','OMC'],
  'super bowl': ['CMCSA','GOOGL','META','NFLX','NKE'],
  // LABOUR & WORKERS
  'strike': ['UPS','GM','F','STLA','DAL','UAL','AAL'],
  'union': ['GM','F','STLA','UPS','DAL','UAL','AAL'],
  'minimum wage': ['WMT','MCD','SBUX','YUM','DG','DLTR'],
  'layoff': ['MSFT','META','AMZN','GOOGL','INTC','NFLX'],
  'gig economy': ['UBER','LYFT','DASH','AMZN'],
  // MACRO & GLOBAL
  'stagflation': ['GLD','SLV','XLE','TIP','WMT','DG'],
  'deflation': ['TLT','GLD','WMT','COST','DG'],
  'hyperinflation': ['GLD','SLV','XOM','CVX','WMT'],
  'currency crisis': ['GLD','SLV','TLT','UUP','JPM','GS'],
  'sovereign debt': ['TLT','GLD','JPM','GS','MS'],
  'emerging market': ['EEM','VWO','BABA','VALE','ITUB'],
  'india': ['INFY','WIT','HDB','IBN','TTM'],
  'brazil': ['VALE','ITUB','BBD','PBR'],
  'europe': ['ASML','SAP','LVMUY','UL','DEO','AZN','BP','GSK'],
  'european union': ['ASML','SAP','LVMUY','AZN','BP','GSK'],
  'germany': ['SAP','SIEGY','BAYRY'],
  'japan': ['SONY','TM','HMC','NTT','MUFG','NTDOY'],
  'canada': ['CNI','CP','ENB','RY','TD'],
  'australia': ['BHP','RIO'],
  'imf': ['GLD','TLT','JPM','GS','MS'],
  'world bank': ['GLD','TLT','JPM','GS','MS'],
  'brics': ['VALE','ITUB','BABA','GOLD','NEM'],
  // LEGAL
  'lawsuit': ['JNJ','PFE','MO','PM','GOOGL','META','AMZN','MSFT'],
  'settlement': ['JNJ','PFE','MO','GOOGL','META','AMZN'],
  'patent': ['QCOM','AAPL','MSFT','GOOGL','JNJ','PFE'],
  'data privacy': ['META','GOOGL','AMZN','MSFT','AAPL'],
  'class action': ['JNJ','PFE','MO','GOOGL','META','AMZN'],
  'fine': ['META','GOOGL','AMZN','MSFT','JNJ','PFE'],
  'money laundering': ['GS','JPM','BAC','HSBC','C'],
};

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source: string;
}

async function generateChecksum(data: Record<string, unknown>): Promise<string> {
  const content = JSON.stringify(data, Object.keys(data).sort());
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function extractTickers(text: string, validTickers: Set<string>): string[] {
  const tickers = new Set<string>();
  
  // Pattern-based extraction
  for (const pattern of TICKER_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const ticker = match[1].toUpperCase();
      if (validTickers.has(ticker)) {
        tickers.add(ticker);
      }
    }
  }
  
  // Company name matching
  const textLower = text.toLowerCase();
  for (const [company, ticker] of Object.entries(COMPANY_MAPPINGS)) {
    if (textLower.includes(company.toLowerCase()) && validTickers.has(ticker)) {
      tickers.add(ticker);
    }
  }
  
  return Array.from(tickers);
}

function safeParseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    
    // Check if date is reasonable
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneHourFuture = new Date(now.getTime() + 60 * 60 * 1000);
    
    if (date < oneWeekAgo || date > oneHourFuture) {
      return null;
    }
    
    return date.toISOString();
  } catch {
    return null;
  }
}

function parseRSSXml(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const linkRegex = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;
  const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
  
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const titleMatch = itemXml.match(titleRegex);
    const linkMatch = itemXml.match(linkRegex);
    const pubDateMatch = itemXml.match(pubDateRegex);
    const descMatch = itemXml.match(descRegex);
    
    if (titleMatch) {
      items.push({
        title: titleMatch[1].trim().replace(/<[^>]+>/g, ''),
        link: linkMatch ? linkMatch[1].trim() : '',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined,
        description: descMatch ? descMatch[1].trim().replace(/<[^>]+>/g, '').substring(0, 500) : undefined,
        source: sourceName,
      });
    }
  }
  
  return items;
}

// Keyword-based sentiment heuristic (NOT estimation - this is text analysis of REAL news content)
// Negation handling: word-window check + multi-word phrase pre-pass
const NEGATION_WORDS = ['not', 'no', 'never', "didn't", "doesn't", "won't", "can't", 'cannot', 'failed to', 'unable to'];
const NEGATION_PHRASES = ['no longer', 'fails to', 'unable to', 'not expected to', 'does not', 'did not'];

function isNegated(text: string, wordIndex: number, windowSize = 7): boolean {
  const words = text.split(/\s+/);
  const start = Math.max(0, wordIndex - windowSize);
  const contextWords = words.slice(start, wordIndex);
  return NEGATION_WORDS.some(neg => contextWords.join(' ').includes(neg));
}

function isNegatedByPhrase(text: string, keywordCharIndex: number): boolean {
  const lookback = text.substring(Math.max(0, keywordCharIndex - 60), keywordCharIndex);
  return NEGATION_PHRASES.some(phrase => lookback.includes(phrase));
}

function calculateKeywordSentiment(fullText: string): number {
  const textLower = fullText.toLowerCase();
  const words = textLower.split(/\s+/);
  const headline = textLower.substring(0, 100);
  let score = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let headlinePositive = 0;
  let headlineNegative = 0;

  const positiveWords = [
    // Price action
    'surge', 'soar', 'rally', 'rise', 'jump', 'spike', 'rocket',
    'skyrocket', 'explode', 'moon', 'pump', 'climb', 'advance',
    'rebound', 'bounce', 'recover', 'reverse', 'turnaround',
    'breakout', 'breakthrough', 'peak', 'high', 'record', 'all-time',
    // Earnings/fundamentals
    'beat', 'beats', 'crushed', 'smashed', 'topped', 'exceeded',
    'outperform', 'outperformed', 'profit', 'profitable', 'revenue',
    'growth', 'grew', 'expand', 'expansion', 'accelerate', 'momentum',
    'strong', 'strength', 'robust', 'impressive', 'solid', 'stellar',
    'record-breaking', 'blowout', 'blockbuster', 'massive',
    // Analyst/ratings
    'upgrade', 'upgraded', 'overweight', 'buy',
    'strong buy', 'accumulate', 'bullish', 'optimistic', 'confident',
    'positive', 'raised', 'increases', 'boosted', 'lifted',
    'target raised', 'price target', 'upside',
    // Corporate actions
    'acquisition', 'acquire', 'merger', 'deal', 'partnership',
    'contract', 'win', 'won', 'award', 'awarded', 'approved',
    'approval', 'cleared', 'launched', 'launch', 'unveiled',
    'patent', 'innovation', 'milestone',
    'dividend', 'buyback', 'repurchase', 'raise',
    'investment', 'funding', 'billion', 'expansion',
    // Market sentiment
    'demand', 'boom', 'booming', 'bull',
    'squeeze', 'short squeeze', 'oversold', 'undervalued',
    'opportunity', 'potential', 'promising', 'exciting',
    'leadership', 'dominant', 'dominates', 'market share',
    'ahead of', 'better than', 'above expectations',
    // Crypto specific
    'adoption', 'institutional', 'etf', 'halving',
    'accumulation', 'hodl', 'staking', 'yield', 'apy',
  ];

  const negativeWords = [
    // Price action
    'crash', 'plunge', 'drop', 'fall', 'sink', 'tumble', 'slump',
    'collapse', 'tank', 'crater', 'spiral', 'nosedive', 'freefall',
    'selloff', 'sell-off', 'dump', 'dumping', 'rout', 'wipeout',
    'correction', 'pullback', 'decline', 'dip', 'slide',
    // Earnings/fundamentals
    'miss', 'missed', 'disappoints', 'disappointing', 'disappointed',
    'below', 'weak', 'weakness', 'poor', 'loss', 'losses',
    'deficit', 'shortfall', 'underperform', 'underperformed',
    'worse than', 'below expectations', 'cut guidance',
    'reduced guidance', 'lowered outlook', 'warning', 'warns',
    // Analyst/ratings
    'downgrade', 'downgraded', 'underweight', 'sell', 'avoid',
    'bearish', 'pessimistic', 'concerned', 'worried', 'cautious',
    'target cut', 'price cut', 'downside', 'overvalued',
    // Corporate/legal
    'lawsuit', 'sued', 'litigation', 'fine', 'fined', 'penalty',
    'fraud', 'investigation', 'probe', 'scandal', 'misconduct',
    'recall', 'halt', 'halted', 'suspend', 'suspended', 'ban',
    'banned', 'blocked', 'rejected', 'denied', 'failed',
    'bankruptcy', 'bankrupt', 'insolvent', 'default', 'defaulted',
    'layoffs', 'layoff', 'fired', 'cuts', 'cutting', 'restructure',
    'restructuring', 'writedown', 'write-off', 'impairment',
    // Risk/macro
    'recession', 'slowdown', 'contraction', 'inflation', 'stagflation',
    'bubble', 'volatile', 'volatility', 'uncertainty', 'uncertain',
    'risk', 'threat', 'danger', 'concern', 'fear', 'panic',
    'crisis', 'emergency', 'contagion', 'systemic', 'exposure',
    'debt', 'leverage', 'margin call', 'forced selling',
    'supply chain', 'shortage', 'disruption', 'headwinds',
    // Regulatory
    'regulation', 'regulatory', 'compliance', 'antitrust',
    'monopoly', 'sanction', 'sanctioned', 'restricted',
    // Crypto specific
    'hack', 'hacked', 'exploit', 'rug pull', 'scam', 'delisted',
    'delisting', 'sec', 'securities violation', 'manipulation',
  ];

  for (const word of positiveWords) {
    const idx = words.findIndex(w => w.startsWith(word));
    if (idx !== -1) {
      const charIndex = textLower.indexOf(word);
      const negated = isNegated(textLower, idx) || (charIndex !== -1 && isNegatedByPhrase(textLower, charIndex));
      const delta = negated ? -0.15 : 0.15;
      score += delta;
      if (!negated) {
        positiveCount++;
        if (headline.includes(word)) headlinePositive++;
      } else {
        negativeCount++;
        if (headline.includes(word)) headlineNegative++;
      }
    }
  }

  for (const word of negativeWords) {
    const idx = words.findIndex(w => w.startsWith(word));
    if (idx !== -1) {
      const charIndex = textLower.indexOf(word);
      const negated = isNegated(textLower, idx) || (charIndex !== -1 && isNegatedByPhrase(textLower, charIndex));
      const delta = negated ? 0.15 : -0.15;
      score += delta;
      if (!negated) {
        negativeCount++;
        if (headline.includes(word)) headlineNegative++;
      } else {
        positiveCount++;
        if (headline.includes(word)) headlinePositive++;
      }
    }
  }

  // Headline bonus: keywords in first 100 chars carry extra weight
  if (headlinePositive > 0 && score > 0) score += 0.2;
  else if (headlineNegative > 0 && score < 0) score -= 0.2;

  // Frequency bonus: 3+ keyword hits = stronger signal
  if (positiveCount + negativeCount >= 3) {
    score *= 1.2;
  }

  return Math.max(-1, Math.min(1, score));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    console.log('[v5] Starting optimized breaking news ingestion via RSS...');
    
    // Load valid tickers - limit to 500 most relevant
    const validTickers = new Set<string>();
    
    // Get popular tickers
    const { data: popularAssets } = await supabase
      .from('assets')
      .select('ticker')
      .in('ticker', [
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'INTC', 'NFLX',
        'DIS', 'BA', 'NKE', 'JPM', 'GS', 'MS', 'BAC', 'WFC', 'C', 'V', 'MA', 'PYPL',
        'COIN', 'HOOD', 'WMT', 'TGT', 'COST', 'HD', 'LOW', 'CVS', 'WBA', 'KR',
        'KO', 'PEP', 'PG', 'MCD', 'SBUX', 'CMG', 'XOM', 'CVX', 'COP', 'OXY',
        'PFE', 'MRNA', 'JNJ', 'UNH', 'ABBV', 'MRK', 'LLY', 'BMY', 'AMGN', 'GILD',
        'CRM', 'ADBE', 'ORCL', 'IBM', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'MU', 'NOW',
        'PLTR', 'CRWD', 'DDOG', 'ZS', 'NET', 'RIVN', 'LCID', 'NIO', 'F', 'GM',
        'SNAP', 'SPOT', 'ROKU', 'RBLX', 'GME', 'AMC', 'DAL', 'UAL', 'AAL', 'LUV',
        'CAT', 'LMT', 'RTX', 'GE', 'T', 'VZ', 'UBER', 'ABNB', 'SPY', 'QQQ',
        'BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'LINK', 'AVAX', 'MATIC',
      ]);
    
    if (popularAssets) {
      for (const asset of popularAssets) {
        validTickers.add(asset.ticker.toUpperCase());
      }
    }
    
    // Add watchlist tickers
    const { data: watchlistItems } = await supabase
      .from('watchlist')
      .select('ticker')
      .limit(200);
    
    if (watchlistItems) {
      for (const item of watchlistItems) {
        validTickers.add(item.ticker.toUpperCase());
      }
    }
    
    // Add more assets to reach 500
    const { data: moreAssets } = await supabase
      .from('assets')
      .select('ticker')
      .limit(400);
    
    if (moreAssets) {
      for (const asset of moreAssets) {
        if (validTickers.size < 500) {
          validTickers.add(asset.ticker.toUpperCase());
        }
      }
    }
    
    console.log(`Loaded ${validTickers.size} tickers for matching`);

    const allNews: Array<{
      ticker: string;
      headline: string;
      summary: string | null;
      source: string;
      url: string | null;
      published_at: string | null;
      sentiment_score: number;
      relevance_score: number;
      metadata: Record<string, unknown>;
    }> = [];

    let feedsProcessed = 0;
    let feedsFailed = 0;
    const seenUrls = new Set<string>();

    // Fetch all feeds in parallel instead of sequentially (was up to 48s sequential)
    const feedResults = await Promise.allSettled(
      NEWS_RSS_FEEDS.map(async (feed) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
          const response = await fetch(feed.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/2.0)' },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const xml = await response.text();
          const items = parseRSSXml(xml, feed.name);
          return { feed, items, ok: true };
        } catch (e) {
          clearTimeout(timeoutId);
          throw { feed, error: e };
        }
      })
    );

    for (const result of feedResults) {
      if (result.status === 'fulfilled') {
        const { feed, items } = result.value;
        console.log(`Parsed ${items.length} items from ${feed.name}`);
        feedsProcessed++;
        for (const item of items) {
          if (item.link && seenUrls.has(item.link)) continue;
          if (item.link) seenUrls.add(item.link);
          const fullText = `${item.title} ${item.description || ''}`;

          // Pattern + company name extraction
          const extractedSet = new Set(extractTickers(fullText, validTickers));

          // Topic-based ticker expansion — scan title + first 500 chars
          const textForTopic = `${item.title} ${(item.description || '').substring(0, 500)}`.toLowerCase();
          let topicAdded = 0;
          for (const [topic, topicTickers] of Object.entries(TOPIC_TICKER_MAP)) {
            if (textForTopic.includes(topic)) {
              for (const t of topicTickers) {
                if (validTickers.has(t) && !extractedSet.has(t)) {
                  extractedSet.add(t);
                  topicAdded++;
                }
              }
            }
          }

          // Cap at 10 tickers per article, deduplicated
          const tickers = Array.from(extractedSet).slice(0, 10);
          if (topicAdded > 0) {
            console.log(`[TOPIC-MAP] "${item.title.substring(0, 60)}": +${topicAdded} tickers from topic map (total ${tickers.length})`);
          }

          for (const ticker of tickers) {
            const sentiment = calculateKeywordSentiment(fullText);

            // Calculate relevance based on ticker/company prominence in text
            const tickerLower = ticker.toLowerCase();
            const titleLower = item.title.toLowerCase();
            const summaryLower = (item.description || '').toLowerCase();
            const companyName = Object.entries(COMPANY_MAPPINGS).find(([, t]) => t === ticker)?.[0]?.toLowerCase();

            let relevance = 0;
            if (titleLower.includes(tickerLower) || titleLower.includes(`$${tickerLower}`)) relevance += 0.4;
            if (companyName && titleLower.includes(companyName)) relevance += 0.3;
            if (summaryLower.includes(tickerLower) || summaryLower.includes(`$${tickerLower}`)) relevance += 0.2;
            const mentionCount = (fullText.toLowerCase().split(tickerLower).length - 1)
              + (companyName ? fullText.toLowerCase().split(companyName).length - 1 : 0);
            relevance += Math.min(0.3, mentionCount * 0.05);
            relevance = Math.max(0.1, Math.min(1.0, relevance));

            allNews.push({
              ticker,
              headline: item.title.substring(0, 500),
              summary: item.description?.substring(0, 1000) || null,
              source: item.source,
              url: item.link || null,
              published_at: safeParseDate(item.pubDate),
              sentiment_score: sentiment,
              relevance_score: relevance,
              metadata: { matched_by: 'ticker_extraction' },
            });
          }
        }
      } else {
        const { feed, error } = result.reason;
        console.error(`Feed failed: ${feed?.name}:`, error);
        feedsFailed++;
      }
    }

    console.log(`Feeds: ${feedsProcessed} ok, ${feedsFailed} failed`);
    console.log(`Total news items before dedup: ${allNews.length}`);

    // Deduplicate by headline+ticker
    const uniqueNews = Array.from(
      new Map(allNews.map(n => [`${n.ticker}:${n.headline}`, n])).values()
    );
    console.log(`Unique news items: ${uniqueNews.length}`);

    // Insert in batches
    let inserted = 0;
    const insertBatchSize = 50;
    
    for (let i = 0; i < uniqueNews.length; i += insertBatchSize) {
      const batch = uniqueNews.slice(i, i + insertBatchSize);
      
      const { error } = await supabase
        .from('breaking_news')
        .upsert(batch, { onConflict: 'url,ticker', ignoreDuplicates: true });
      
      if (error) {
        console.error(`Insert batch ${i} error:`, error.message);
      } else {
        inserted += batch.length;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Breaking news complete: ${inserted} inserted in ${duration}ms`);

    await logHeartbeat(supabase, {
      function_name: 'ingest-breaking-news',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: uniqueNews.length - inserted,
      duration_ms: duration,
      source_used: 'RSS Feeds',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-breaking-news',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: uniqueNews.length - inserted,
      duration: duration,
      sourceUsed: 'RSS Feeds',
    });

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        unique_items: uniqueNews.length,
        tickers_matched: new Set(uniqueNews.map(n => n.ticker)).size,
        feeds_processed: feedsProcessed,
        feeds_failed: feedsFailed,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-breaking-news',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'RSS Feeds',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-breaking-news',
      message: `Breaking news failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
