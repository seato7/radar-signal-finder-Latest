import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// COMPREHENSIVE SECTOR CLASSIFICATION - Enriches 26k+ assets with sector data
// ============================================================================

// Expanded sector patterns with more keywords
const SECTOR_PATTERNS: Record<string, { keywords: string[]; industry: string }> = {
  // Technology
  'Technology': {
    keywords: [
      'software', 'tech', 'digital', 'cloud', 'data', 'cyber', 'internet', 'computing', 
      'systems', 'solutions', 'platform', 'saas', 'analytics', 'automation', 'it services',
      'application', 'enterprise', 'web', 'mobile', 'app', 'development', 'api', 'devops'
    ],
    industry: 'Software & Services'
  },
  'Semiconductors': {
    keywords: [
      'semiconductor', 'chip', 'silicon', 'wafer', 'foundry', 'processor', 'memory',
      'integrated circuit', 'ic ', 'fab', 'lithography', 'etch', 'packaging', 'testing',
      'mems', 'sensor', 'analog', 'digital signal', 'microcontroller', 'fpga', 'asic'
    ],
    industry: 'Semiconductors'
  },
  'AI & Machine Learning': {
    keywords: [
      'artificial intelligence', ' ai ', 'machine learning', 'neural', 'cognitive', 
      'deep learning', 'nlp', 'computer vision', 'robotics', 'autonomous', 'predictive',
      'intelligent', 'smart', 'automation', 'algorithm', 'model', 'inference'
    ],
    industry: 'Artificial Intelligence'
  },
  
  // Healthcare
  'Healthcare': {
    keywords: [
      'health', 'medical', 'hospital', 'clinic', 'care', 'wellness', 'diagnostic',
      'patient', 'treatment', 'therapy', 'clinical', 'surgical', 'healthcare provider',
      'nursing', 'ambulatory', 'telemedicine', 'telehealth', 'hmo', 'managed care'
    ],
    industry: 'Healthcare Services'
  },
  'Biotechnology': {
    keywords: [
      'biotech', 'pharma', 'therapeutic', 'oncology', 'genomic', 'bioscience', 'gene',
      'drug', 'medicine', 'biological', 'antibody', 'vaccine', 'cell therapy', 'rna',
      'dna', 'protein', 'molecular', 'clinical trial', 'fda', 'pipeline', 'compound',
      'biopharmaceutical', 'immunology', 'neurology', 'cardiology', 'rare disease'
    ],
    industry: 'Biotechnology'
  },
  'Medical Devices': {
    keywords: [
      'medical device', 'implant', 'surgical instrument', 'imaging', 'diagnostic equipment',
      'pacemaker', 'stent', 'catheter', 'orthopedic', 'prosthetic', 'monitoring', 
      'mri', 'ct scan', 'ultrasound', 'x-ray', 'lab equipment', 'life science'
    ],
    industry: 'Medical Devices'
  },
  
  // Finance
  'Banks': {
    keywords: [
      'bank', 'banking', 'savings', 'checking', 'deposit', 'loan', 'mortgage',
      'credit', 'lending', 'branch', 'atm', 'commercial bank', 'retail bank',
      'community bank', 'regional bank', 'national bank', 'federal'
    ],
    industry: 'Banks'
  },
  'Financial Services': {
    keywords: [
      'financial', 'capital', 'investment', 'asset management', 'wealth', 'advisory',
      'brokerage', 'trading', 'securities', 'exchange', 'clearing', 'custody',
      'private equity', 'venture capital', 'hedge fund', 'mutual fund', 'etf provider'
    ],
    industry: 'Financial Services'
  },
  'Insurance': {
    keywords: [
      'insurance', 'insurer', 'underwriting', 'policy', 'premium', 'claim', 'risk',
      'life insurance', 'health insurance', 'property casualty', 'reinsurance',
      'annuity', 'pension', 'retirement', 'actuarial'
    ],
    industry: 'Insurance'
  },
  'Fintech': {
    keywords: [
      'fintech', 'payment', 'digital payment', 'mobile payment', 'transaction',
      'checkout', 'merchant', 'acquirer', 'processor', 'wallet', 'neobank',
      'buy now pay later', 'bnpl', 'remittance', 'cross-border', 'blockchain'
    ],
    industry: 'Fintech'
  },
  
  // Energy
  'Oil & Gas': {
    keywords: [
      'oil', 'gas', 'petroleum', 'crude', 'drilling', 'exploration', 'production',
      'refining', 'refinery', 'pipeline', 'midstream', 'upstream', 'downstream',
      'oilfield', 'services', 'well', 'fracking', 'shale', 'offshore', 'onshore',
      'lng', 'natural gas', 'propane', 'butane', 'ngl'
    ],
    industry: 'Oil & Gas'
  },
  'Clean Energy': {
    keywords: [
      'solar', 'wind', 'renewable', 'clean energy', 'green', 'sustainable', 'hydrogen',
      'ev ', 'electric vehicle', 'battery', 'energy storage', 'charging', 'fuel cell',
      'geothermal', 'hydro', 'biofuel', 'biomass', 'carbon capture', 'carbon neutral',
      'zero emission', 'sustainability', 'esg', 'climate', 'net zero'
    ],
    industry: 'Renewable Energy'
  },
  'Utilities': {
    keywords: [
      'utility', 'utilities', 'electric', 'power', 'energy company', 'grid',
      'transmission', 'distribution', 'generation', 'water utility', 'gas utility',
      'regulated', 'rate base', 'public utility'
    ],
    industry: 'Utilities'
  },
  
  // Consumer
  'Retail': {
    keywords: [
      'retail', 'store', 'shop', 'merchant', 'outlet', 'mall', 'e-commerce',
      'online shopping', 'marketplace', 'department store', 'discount', 'warehouse',
      'supermarket', 'grocery', 'convenience', 'specialty retail', 'chain'
    ],
    industry: 'Retail'
  },
  'Consumer Goods': {
    keywords: [
      'consumer', 'apparel', 'fashion', 'clothing', 'footwear', 'accessories',
      'luxury', 'brand', 'lifestyle', 'home goods', 'furniture', 'appliance',
      'electronics', 'personal care', 'cosmetics', 'beauty', 'fragrance'
    ],
    industry: 'Consumer Goods'
  },
  'Food & Beverage': {
    keywords: [
      'food', 'beverage', 'drink', 'snack', 'meal', 'grocery', 'packaged food',
      'dairy', 'meat', 'poultry', 'seafood', 'produce', 'organic', 'natural',
      'confectionery', 'candy', 'chocolate', 'soft drink', 'juice', 'water', 
      'coffee', 'tea', 'alcohol', 'beer', 'wine', 'spirits'
    ],
    industry: 'Food & Beverage'
  },
  'Restaurants': {
    keywords: [
      'restaurant', 'dining', 'fast food', 'quick service', 'casual dining',
      'fine dining', 'cafe', 'coffee shop', 'pizza', 'burger', 'taco', 'chicken',
      'delivery', 'takeout', 'drive-thru', 'franchise', 'chain restaurant'
    ],
    industry: 'Restaurants'
  },
  
  // Industrial
  'Aerospace & Defense': {
    keywords: [
      'aerospace', 'defense', 'military', 'aircraft', 'jet', 'helicopter', 'drone',
      'satellite', 'space', 'rocket', 'missile', 'weapon', 'ammunition', 'armor',
      'naval', 'army', 'air force', 'contractor', 'government', 'dod', 'pentagon'
    ],
    industry: 'Aerospace & Defense'
  },
  'Industrial Manufacturing': {
    keywords: [
      'manufacturing', 'industrial', 'machinery', 'equipment', 'tool', 'factory',
      'production', 'assembly', 'automation', 'robotics', 'cnc', 'precision',
      'fabrication', 'metalworking', 'welding', 'casting', 'forging'
    ],
    industry: 'Industrial Manufacturing'
  },
  'Construction': {
    keywords: [
      'construction', 'building', 'infrastructure', 'engineering', 'contractor',
      'civil', 'commercial construction', 'residential', 'heavy equipment',
      'cement', 'concrete', 'aggregate', 'asphalt', 'roofing', 'hvac', 'plumbing'
    ],
    industry: 'Construction'
  },
  'Transportation': {
    keywords: [
      'transport', 'logistics', 'shipping', 'freight', 'cargo', 'trucking', 'rail',
      'railroad', 'airline', 'aviation', 'maritime', 'port', 'terminal', 'warehouse',
      'distribution', 'supply chain', 'delivery', 'courier', 'express'
    ],
    industry: 'Transportation'
  },
  
  // Real Estate
  'Real Estate': {
    keywords: [
      'reit', 'real estate', 'property', 'realty', 'mortgage', 'housing', 'residential',
      'commercial property', 'office', 'industrial property', 'retail property',
      'hotel', 'hospitality', 'multifamily', 'apartment', 'single family', 'land'
    ],
    industry: 'Real Estate'
  },
  
  // Materials
  'Mining & Metals': {
    keywords: [
      'mining', 'mine', 'metal', 'steel', 'aluminum', 'copper', 'gold', 'silver',
      'platinum', 'palladium', 'iron ore', 'zinc', 'nickel', 'lithium', 'cobalt',
      'rare earth', 'uranium', 'coal', 'smelting', 'refining', 'exploration'
    ],
    industry: 'Mining & Metals'
  },
  'Chemicals': {
    keywords: [
      'chemical', 'specialty chemical', 'commodity chemical', 'petrochemical',
      'polymer', 'plastic', 'resin', 'coating', 'paint', 'adhesive', 'fertilizer',
      'agrochemical', 'pesticide', 'herbicide', 'industrial gas'
    ],
    industry: 'Chemicals'
  },
  
  // Communications
  'Telecom': {
    keywords: [
      'telecom', 'telecommunications', 'wireless', 'cellular', 'mobile', '5g', '4g',
      'fiber', 'broadband', 'internet service', 'cable', 'satellite', 'tower',
      'network', 'carrier', 'spectrum'
    ],
    industry: 'Telecommunications'
  },
  'Media & Entertainment': {
    keywords: [
      'media', 'entertainment', 'broadcast', 'television', 'tv', 'radio', 'streaming',
      'content', 'studio', 'film', 'movie', 'music', 'gaming', 'video game', 'esports',
      'publishing', 'news', 'advertising', 'marketing', 'social media', 'digital media'
    ],
    industry: 'Media & Entertainment'
  },
  
  // Crypto
  'Cryptocurrency': {
    keywords: [
      'bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'token',
      'mining', 'exchange', 'wallet', 'staking', 'yield', 'dao', 'web3',
      'decentralized', 'smart contract'
    ],
    industry: 'Digital Assets'
  },
  
  // Agriculture
  'Agriculture': {
    keywords: [
      'agriculture', 'farm', 'crop', 'seed', 'grain', 'corn', 'wheat', 'soybean',
      'cotton', 'livestock', 'cattle', 'poultry', 'dairy farm', 'aquaculture',
      'agricultural equipment', 'tractor', 'harvester', 'irrigation'
    ],
    industry: 'Agriculture'
  }
};

// Well-known ticker mappings (expanded)
const TICKER_SECTOR_MAP: Record<string, { sector: string; industry: string }> = {
  // AI & Semiconductors (50+)
  'NVDA': { sector: 'Semiconductors', industry: 'GPUs' },
  'AMD': { sector: 'Semiconductors', industry: 'Processors' },
  'INTC': { sector: 'Semiconductors', industry: 'Processors' },
  'AVGO': { sector: 'Semiconductors', industry: 'Networking Chips' },
  'QCOM': { sector: 'Semiconductors', industry: 'Mobile Chips' },
  'MU': { sector: 'Semiconductors', industry: 'Memory' },
  'ASML': { sector: 'Semiconductors', industry: 'Equipment' },
  'TSM': { sector: 'Semiconductors', industry: 'Foundry' },
  'AMAT': { sector: 'Semiconductors', industry: 'Equipment' },
  'LRCX': { sector: 'Semiconductors', industry: 'Equipment' },
  'KLAC': { sector: 'Semiconductors', industry: 'Equipment' },
  'MRVL': { sector: 'Semiconductors', industry: 'Data Infrastructure' },
  'TXN': { sector: 'Semiconductors', industry: 'Analog' },
  'ADI': { sector: 'Semiconductors', industry: 'Analog' },
  'NXPI': { sector: 'Semiconductors', industry: 'Automotive' },
  'ON': { sector: 'Semiconductors', industry: 'Power' },
  'MCHP': { sector: 'Semiconductors', industry: 'Microcontrollers' },
  'ARM': { sector: 'Semiconductors', industry: 'IP Licensing' },
  'SMCI': { sector: 'Technology', industry: 'Server Infrastructure' },
  'SNPS': { sector: 'Semiconductors', industry: 'EDA' },
  'CDNS': { sector: 'Semiconductors', industry: 'EDA' },
  'PLTR': { sector: 'AI & Machine Learning', industry: 'Data Analytics' },
  'AI': { sector: 'AI & Machine Learning', industry: 'AI Software' },
  'PATH': { sector: 'AI & Machine Learning', industry: 'Automation' },
  
  // Big Tech
  'MSFT': { sector: 'Technology', industry: 'Software' },
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
  'GOOGL': { sector: 'Technology', industry: 'Internet Services' },
  'GOOG': { sector: 'Technology', industry: 'Internet Services' },
  'META': { sector: 'Media & Entertainment', industry: 'Social Media' },
  'AMZN': { sector: 'Retail', industry: 'E-Commerce' },
  'NFLX': { sector: 'Media & Entertainment', industry: 'Streaming' },
  'CRM': { sector: 'Technology', industry: 'Enterprise Software' },
  'ADBE': { sector: 'Technology', industry: 'Creative Software' },
  'ORCL': { sector: 'Technology', industry: 'Enterprise Software' },
  'IBM': { sector: 'Technology', industry: 'IT Services' },
  'CSCO': { sector: 'Technology', industry: 'Networking' },
  'SAP': { sector: 'Technology', industry: 'Enterprise Software' },
  'NOW': { sector: 'Technology', industry: 'Enterprise Software' },
  'INTU': { sector: 'Technology', industry: 'Financial Software' },
  
  // Banks
  'JPM': { sector: 'Banks', industry: 'Diversified Banks' },
  'BAC': { sector: 'Banks', industry: 'Diversified Banks' },
  'WFC': { sector: 'Banks', industry: 'Diversified Banks' },
  'C': { sector: 'Banks', industry: 'Diversified Banks' },
  'GS': { sector: 'Financial Services', industry: 'Investment Banking' },
  'MS': { sector: 'Financial Services', industry: 'Investment Banking' },
  'USB': { sector: 'Banks', industry: 'Regional Banks' },
  'PNC': { sector: 'Banks', industry: 'Regional Banks' },
  'TFC': { sector: 'Banks', industry: 'Regional Banks' },
  'SCHW': { sector: 'Financial Services', industry: 'Brokerage' },
  'BLK': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Insurance
  'BRK.B': { sector: 'Insurance', industry: 'Diversified' },
  'BRK.A': { sector: 'Insurance', industry: 'Diversified' },
  'PRU': { sector: 'Insurance', industry: 'Life Insurance' },
  'MET': { sector: 'Insurance', industry: 'Life Insurance' },
  'AIG': { sector: 'Insurance', industry: 'P&C Insurance' },
  'ALL': { sector: 'Insurance', industry: 'P&C Insurance' },
  'TRV': { sector: 'Insurance', industry: 'P&C Insurance' },
  'PGR': { sector: 'Insurance', industry: 'Auto Insurance' },
  'CB': { sector: 'Insurance', industry: 'P&C Insurance' },
  
  // Payments/Fintech
  'V': { sector: 'Fintech', industry: 'Payments' },
  'MA': { sector: 'Fintech', industry: 'Payments' },
  'PYPL': { sector: 'Fintech', industry: 'Digital Payments' },
  'SQ': { sector: 'Fintech', industry: 'Fintech' },
  'AXP': { sector: 'Fintech', industry: 'Payments' },
  'COIN': { sector: 'Cryptocurrency', industry: 'Exchange' },
  'MSTR': { sector: 'Cryptocurrency', industry: 'Bitcoin Treasury' },
  'HOOD': { sector: 'Fintech', industry: 'Brokerage' },
  'SOFI': { sector: 'Fintech', industry: 'Digital Banking' },
  'AFRM': { sector: 'Fintech', industry: 'BNPL' },
  
  // Healthcare/Biotech
  'JNJ': { sector: 'Healthcare', industry: 'Pharmaceuticals' },
  'UNH': { sector: 'Healthcare', industry: 'Health Insurance' },
  'PFE': { sector: 'Biotechnology', industry: 'Pharmaceuticals' },
  'MRK': { sector: 'Biotechnology', industry: 'Pharmaceuticals' },
  'ABBV': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'LLY': { sector: 'Biotechnology', industry: 'Pharmaceuticals' },
  'TMO': { sector: 'Healthcare', industry: 'Life Sciences' },
  'DHR': { sector: 'Healthcare', industry: 'Life Sciences' },
  'BMY': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'AMGN': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'GILD': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'VRTX': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'REGN': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'MRNA': { sector: 'Biotechnology', industry: 'mRNA Therapeutics' },
  'ISRG': { sector: 'Medical Devices', industry: 'Surgical Robots' },
  
  // Energy
  'XOM': { sector: 'Oil & Gas', industry: 'Integrated' },
  'CVX': { sector: 'Oil & Gas', industry: 'Integrated' },
  'COP': { sector: 'Oil & Gas', industry: 'E&P' },
  'SLB': { sector: 'Oil & Gas', industry: 'Services' },
  'EOG': { sector: 'Oil & Gas', industry: 'E&P' },
  'OXY': { sector: 'Oil & Gas', industry: 'E&P' },
  'MPC': { sector: 'Oil & Gas', industry: 'Refining' },
  'VLO': { sector: 'Oil & Gas', industry: 'Refining' },
  'PSX': { sector: 'Oil & Gas', industry: 'Refining' },
  'HAL': { sector: 'Oil & Gas', industry: 'Services' },
  
  // Clean Energy
  'TSLA': { sector: 'Clean Energy', industry: 'Electric Vehicles' },
  'RIVN': { sector: 'Clean Energy', industry: 'Electric Vehicles' },
  'LCID': { sector: 'Clean Energy', industry: 'Electric Vehicles' },
  'NIO': { sector: 'Clean Energy', industry: 'Electric Vehicles' },
  'ENPH': { sector: 'Clean Energy', industry: 'Solar' },
  'SEDG': { sector: 'Clean Energy', industry: 'Solar' },
  'FSLR': { sector: 'Clean Energy', industry: 'Solar' },
  'NEE': { sector: 'Utilities', industry: 'Renewable Utilities' },
  'PLUG': { sector: 'Clean Energy', industry: 'Hydrogen' },
  
  // Aerospace & Defense
  'LMT': { sector: 'Aerospace & Defense', industry: 'Defense' },
  'RTX': { sector: 'Aerospace & Defense', industry: 'Defense' },
  'NOC': { sector: 'Aerospace & Defense', industry: 'Defense' },
  'GD': { sector: 'Aerospace & Defense', industry: 'Defense' },
  'BA': { sector: 'Aerospace & Defense', industry: 'Aerospace' },
  'LHX': { sector: 'Aerospace & Defense', industry: 'Defense Electronics' },
  
  // Consumer Staples
  'WMT': { sector: 'Retail', industry: 'Discount Retail' },
  'COST': { sector: 'Retail', industry: 'Warehouse Clubs' },
  'TGT': { sector: 'Retail', industry: 'Discount Retail' },
  'KO': { sector: 'Food & Beverage', industry: 'Beverages' },
  'PEP': { sector: 'Food & Beverage', industry: 'Beverages' },
  'PG': { sector: 'Consumer Goods', industry: 'Household Products' },
  
  // Consumer Discretionary
  'HD': { sector: 'Retail', industry: 'Home Improvement' },
  'LOW': { sector: 'Retail', industry: 'Home Improvement' },
  'NKE': { sector: 'Consumer Goods', industry: 'Apparel' },
  'SBUX': { sector: 'Restaurants', industry: 'Coffee' },
  'MCD': { sector: 'Restaurants', industry: 'Fast Food' },
  
  // Industrial
  'CAT': { sector: 'Industrial Manufacturing', industry: 'Construction Equipment' },
  'DE': { sector: 'Industrial Manufacturing', industry: 'Agricultural Equipment' },
  'HON': { sector: 'Industrial Manufacturing', industry: 'Diversified Industrial' },
  'UNP': { sector: 'Transportation', industry: 'Railroads' },
  'UPS': { sector: 'Transportation', industry: 'Logistics' },
  'FDX': { sector: 'Transportation', industry: 'Logistics' },
  
  // REITs
  'AMT': { sector: 'Real Estate', industry: 'Tower REITs' },
  'PLD': { sector: 'Real Estate', industry: 'Industrial REITs' },
  'EQIX': { sector: 'Real Estate', industry: 'Data Center REITs' },
  'SPG': { sector: 'Real Estate', industry: 'Retail REITs' },
  'O': { sector: 'Real Estate', industry: 'Net Lease REITs' },
  
  // Mining
  'FCX': { sector: 'Mining & Metals', industry: 'Copper' },
  'NEM': { sector: 'Mining & Metals', industry: 'Gold' },
  'GOLD': { sector: 'Mining & Metals', industry: 'Gold' },
  'NUE': { sector: 'Mining & Metals', industry: 'Steel' },
  
  // Crypto
  'BTC': { sector: 'Cryptocurrency', industry: 'Digital Assets' },
  'ETH': { sector: 'Cryptocurrency', industry: 'Smart Contracts' },
  'BTC/USD': { sector: 'Cryptocurrency', industry: 'Digital Assets' },
  'ETH/USD': { sector: 'Cryptocurrency', industry: 'Smart Contracts' },
  'SOL': { sector: 'Cryptocurrency', industry: 'Layer 1' },
  'XRP': { sector: 'Cryptocurrency', industry: 'Payments' },
  'DOGE': { sector: 'Cryptocurrency', industry: 'Meme Coins' },
  'ADA': { sector: 'Cryptocurrency', industry: 'Layer 1' },
  'AVAX': { sector: 'Cryptocurrency', industry: 'Layer 1' },
  'DOT': { sector: 'Cryptocurrency', industry: 'Interoperability' },
  'LINK': { sector: 'Cryptocurrency', industry: 'Oracles' },
  'MATIC': { sector: 'Cryptocurrency', industry: 'Layer 2' },
};

// ETF to sector mapping
const ETF_SECTOR_MAP: Record<string, { sector: string; industry: string }> = {
  // Sector ETFs
  'XLF': { sector: 'Banks', industry: 'Financial ETF' },
  'XLK': { sector: 'Technology', industry: 'Tech ETF' },
  'XLE': { sector: 'Oil & Gas', industry: 'Energy ETF' },
  'XLV': { sector: 'Healthcare', industry: 'Healthcare ETF' },
  'XLI': { sector: 'Industrial Manufacturing', industry: 'Industrial ETF' },
  'XLP': { sector: 'Food & Beverage', industry: 'Consumer Staples ETF' },
  'XLY': { sector: 'Retail', industry: 'Consumer Discretionary ETF' },
  'XLU': { sector: 'Utilities', industry: 'Utilities ETF' },
  'XLB': { sector: 'Mining & Metals', industry: 'Materials ETF' },
  'XLRE': { sector: 'Real Estate', industry: 'Real Estate ETF' },
  'XLC': { sector: 'Media & Entertainment', industry: 'Communications ETF' },
  
  // Thematic ETFs
  'SMH': { sector: 'Semiconductors', industry: 'Semiconductor ETF' },
  'SOXX': { sector: 'Semiconductors', industry: 'Semiconductor ETF' },
  'QQQ': { sector: 'Technology', industry: 'Nasdaq ETF' },
  'SPY': { sector: 'Financial Services', industry: 'S&P 500 ETF' },
  'IWM': { sector: 'Financial Services', industry: 'Small Cap ETF' },
  'DIA': { sector: 'Financial Services', industry: 'Dow ETF' },
  'VTI': { sector: 'Financial Services', industry: 'Total Market ETF' },
  'ARKK': { sector: 'Technology', industry: 'Innovation ETF' },
  'ARKG': { sector: 'Biotechnology', industry: 'Genomics ETF' },
  'ARKF': { sector: 'Fintech', industry: 'Fintech ETF' },
  'ARKW': { sector: 'Technology', industry: 'Internet ETF' },
  'ARKQ': { sector: 'AI & Machine Learning', industry: 'Autonomous ETF' },
  'IBB': { sector: 'Biotechnology', industry: 'Biotech ETF' },
  'XBI': { sector: 'Biotechnology', industry: 'Biotech ETF' },
  'GDX': { sector: 'Mining & Metals', industry: 'Gold Miners ETF' },
  'GDXJ': { sector: 'Mining & Metals', industry: 'Junior Gold Miners ETF' },
  'SLV': { sector: 'Mining & Metals', industry: 'Silver ETF' },
  'GLD': { sector: 'Mining & Metals', industry: 'Gold ETF' },
  'USO': { sector: 'Oil & Gas', industry: 'Oil ETF' },
  'UNG': { sector: 'Oil & Gas', industry: 'Natural Gas ETF' },
  'TAN': { sector: 'Clean Energy', industry: 'Solar ETF' },
  'ICLN': { sector: 'Clean Energy', industry: 'Clean Energy ETF' },
  'LIT': { sector: 'Mining & Metals', industry: 'Lithium ETF' },
  'ITA': { sector: 'Aerospace & Defense', industry: 'Defense ETF' },
  'HACK': { sector: 'Technology', industry: 'Cybersecurity ETF' },
  'CIBR': { sector: 'Technology', industry: 'Cybersecurity ETF' },
  'BOTZ': { sector: 'AI & Machine Learning', industry: 'Robotics ETF' },
  'ROBO': { sector: 'AI & Machine Learning', industry: 'Robotics ETF' },
  'EEM': { sector: 'Financial Services', industry: 'Emerging Markets ETF' },
  'VWO': { sector: 'Financial Services', industry: 'Emerging Markets ETF' },
  'EFA': { sector: 'Financial Services', industry: 'Developed Markets ETF' },
  'VEA': { sector: 'Financial Services', industry: 'Developed Markets ETF' },
  'FXI': { sector: 'Financial Services', industry: 'China ETF' },
  'MCHI': { sector: 'Financial Services', industry: 'China ETF' },
  'KWEB': { sector: 'Technology', industry: 'China Internet ETF' },
  'EWJ': { sector: 'Financial Services', industry: 'Japan ETF' },
  'EWZ': { sector: 'Financial Services', industry: 'Brazil ETF' },
  
  // Crypto ETFs
  'BITO': { sector: 'Cryptocurrency', industry: 'Bitcoin Futures ETF' },
  'GBTC': { sector: 'Cryptocurrency', industry: 'Bitcoin Trust' },
  'ETHE': { sector: 'Cryptocurrency', industry: 'Ethereum Trust' },
};

function classifyAsset(ticker: string, name: string, assetClass: string): { sector: string; industry: string } | null {
  const tickerUpper = ticker.toUpperCase();
  
  // 1. Check direct ticker mapping first
  if (TICKER_SECTOR_MAP[tickerUpper]) {
    return TICKER_SECTOR_MAP[tickerUpper];
  }
  
  // 2. Check ETF mapping
  if (assetClass === 'etf' && ETF_SECTOR_MAP[tickerUpper]) {
    return ETF_SECTOR_MAP[tickerUpper];
  }
  
  // 3. For crypto assets
  if (assetClass === 'crypto') {
    return { sector: 'Cryptocurrency', industry: 'Digital Assets' };
  }
  
  // 4. For forex assets
  if (assetClass === 'forex') {
    return { sector: 'Currency', industry: 'Foreign Exchange' };
  }
  
  // 5. For commodities
  if (assetClass === 'commodity') {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('gold')) return { sector: 'Mining & Metals', industry: 'Gold' };
    if (nameLower.includes('silver')) return { sector: 'Mining & Metals', industry: 'Silver' };
    if (nameLower.includes('copper')) return { sector: 'Mining & Metals', industry: 'Copper' };
    if (nameLower.includes('oil') || nameLower.includes('crude')) return { sector: 'Oil & Gas', industry: 'Oil' };
    if (nameLower.includes('natural gas')) return { sector: 'Oil & Gas', industry: 'Natural Gas' };
    if (nameLower.includes('corn') || nameLower.includes('wheat') || nameLower.includes('soybean')) {
      return { sector: 'Agriculture', industry: 'Grains' };
    }
    return { sector: 'Mining & Metals', industry: 'Commodities' };
  }
  
  // 6. For ETFs without specific mapping, try name analysis
  if (assetClass === 'etf') {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('semiconductor') || nameLower.includes('chip')) {
      return { sector: 'Semiconductors', industry: 'Semiconductor ETF' };
    }
    if (nameLower.includes('tech') || nameLower.includes('technology')) {
      return { sector: 'Technology', industry: 'Technology ETF' };
    }
    if (nameLower.includes('healthcare') || nameLower.includes('health')) {
      return { sector: 'Healthcare', industry: 'Healthcare ETF' };
    }
    if (nameLower.includes('financial') || nameLower.includes('bank')) {
      return { sector: 'Banks', industry: 'Financial ETF' };
    }
    if (nameLower.includes('energy') || nameLower.includes('oil')) {
      return { sector: 'Oil & Gas', industry: 'Energy ETF' };
    }
    if (nameLower.includes('real estate') || nameLower.includes('reit')) {
      return { sector: 'Real Estate', industry: 'Real Estate ETF' };
    }
    return { sector: 'Financial Services', industry: 'ETF' };
  }
  
  // 7. Try name-based classification for stocks
  const nameLower = name.toLowerCase();
  
  for (const [sector, config] of Object.entries(SECTOR_PATTERNS)) {
    for (const keyword of config.keywords) {
      if (nameLower.includes(keyword.toLowerCase())) {
        return { sector, industry: config.industry };
      }
    }
  }
  
  // 8. Default based on asset class
  if (assetClass === 'stock') {
    return { sector: 'Financial Services', industry: 'Equity' };
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get parameters
    const { batch_size = 2000, offset = 0, force = false } = await req.json().catch(() => ({}));

    console.log(`[ENRICH-SECTORS] Starting: batch_size=${batch_size}, offset=${offset}, force=${force}`);

    // Fetch assets
    let query = supabase
      .from('assets')
      .select('id, ticker, name, asset_class, metadata')
      .range(offset, offset + batch_size - 1);

    const { data: assets, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    console.log(`[ENRICH-SECTORS] Fetched ${assets?.length || 0} assets`);

    let enriched = 0;
    let skipped = 0;
    let alreadyHad = 0;
    const updates: any[] = [];

    for (const asset of assets || []) {
      // Skip if already has sector (unless force)
      if (asset.metadata?.sector && !force) {
        alreadyHad++;
        continue;
      }

      const classification = classifyAsset(
        asset.ticker,
        asset.name,
        asset.asset_class
      );

      if (classification) {
        updates.push({
          id: asset.id,
          metadata: {
            ...asset.metadata,
            sector: classification.sector,
            industry: classification.industry,
            enriched_at: new Date().toISOString()
          }
        });
        enriched++;
      } else {
        skipped++;
      }
    }

    // Batch update
    if (updates.length > 0) {
      console.log(`[ENRICH-SECTORS] Updating ${updates.length} assets`);
      
      for (let i = 0; i < updates.length; i += 100) {
        const batch = updates.slice(i, i + 100);
        for (const update of batch) {
          const { error: updateError } = await supabase
            .from('assets')
            .update({ metadata: update.metadata })
            .eq('id', update.id);
          
          if (updateError) {
            console.error(`[ENRICH-SECTORS] Update failed for ${update.id}:`, updateError.message);
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    const hasMore = (assets?.length || 0) >= batch_size;

    console.log(`[ENRICH-SECTORS] Complete: enriched=${enriched}, skipped=${skipped}, already_had=${alreadyHad}, has_more=${hasMore}`);

    // Log status
    await supabase.from('function_status').insert({
      function_name: 'enrich-asset-sectors',
      status: 'success',
      rows_inserted: enriched,
      rows_skipped: skipped,
      duration_ms: duration,
      metadata: {
        batch_size,
        offset,
        total_processed: assets?.length || 0,
        already_had_sector: alreadyHad,
        has_more: hasMore
      }
    });

    return new Response(JSON.stringify({
      success: true,
      enriched,
      skipped,
      already_had_sector: alreadyHad,
      total_processed: assets?.length || 0,
      next_offset: hasMore ? offset + batch_size : null,
      has_more: hasMore,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ENRICH-SECTORS] Error:', error);
    return new Response(JSON.stringify({ 
      error: message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
