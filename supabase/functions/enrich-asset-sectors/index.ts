import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sector/Industry mapping based on company name patterns
const SECTOR_PATTERNS: Record<string, { keywords: string[]; industry?: string }> = {
  // Technology
  'Technology': {
    keywords: ['software', 'tech', 'digital', 'cloud', 'data', 'cyber', 'internet', 'computing', 'systems', 'solutions'],
    industry: 'Software & Services'
  },
  'Semiconductors': {
    keywords: ['semiconductor', 'chip', 'nvidia', 'amd', 'intel', 'qualcomm', 'broadcom', 'micron', 'asml', 'tsmc', 'silicon'],
    industry: 'Semiconductors'
  },
  'AI & Machine Learning': {
    keywords: ['artificial intelligence', ' ai ', 'machine learning', 'neural', 'cognitive', 'automation', 'robotics', 'palantir', 'c3.ai'],
    industry: 'Artificial Intelligence'
  },
  
  // Healthcare
  'Healthcare': {
    keywords: ['health', 'medical', 'hospital', 'clinic', 'care', 'wellness', 'diagnostic'],
    industry: 'Healthcare Services'
  },
  'Biotechnology': {
    keywords: ['biotech', 'pharma', 'therapeutic', 'oncology', 'genomic', 'bioscience', 'gene', 'drug', 'medicine', 'biogen', 'moderna', 'pfizer', 'merck', 'amgen', 'gilead', 'regeneron', 'vertex'],
    industry: 'Biotechnology'
  },
  
  // Finance
  'Financial Services': {
    keywords: ['bank', 'financial', 'capital', 'investment', 'asset', 'wealth', 'credit', 'lending', 'mortgage', 'insurance', 'jpmorgan', 'goldman', 'morgan stanley', 'blackrock', 'visa', 'mastercard', 'paypal'],
    industry: 'Financial Services'
  },
  
  // Energy
  'Energy': {
    keywords: ['energy', 'oil', 'gas', 'petroleum', 'fuel', 'power', 'utility', 'electric', 'exxon', 'chevron', 'conocophillips', 'schlumberger'],
    industry: 'Oil & Gas'
  },
  'Clean Energy': {
    keywords: ['solar', 'wind', 'renewable', 'clean energy', 'green', 'sustainable', 'hydrogen', 'ev ', 'electric vehicle', 'tesla', 'enphase', 'first solar', 'plug power'],
    industry: 'Renewable Energy'
  },
  
  // Consumer
  'Consumer Discretionary': {
    keywords: ['retail', 'consumer', 'apparel', 'fashion', 'luxury', 'restaurant', 'hotel', 'leisure', 'entertainment', 'gaming', 'nike', 'starbucks', 'amazon', 'home depot', 'mcdonalds'],
    industry: 'Consumer Goods'
  },
  'Consumer Staples': {
    keywords: ['food', 'beverage', 'grocery', 'household', 'personal care', 'tobacco', 'coca-cola', 'pepsi', 'procter', 'walmart', 'costco', 'kroger'],
    industry: 'Consumer Staples'
  },
  
  // Industrial
  'Industrials': {
    keywords: ['industrial', 'manufacturing', 'machinery', 'equipment', 'aerospace', 'defense', 'construction', 'engineering', 'caterpillar', 'deere', 'honeywell', 'lockheed', 'boeing', 'raytheon', '3m'],
    industry: 'Industrial Goods'
  },
  'Transportation': {
    keywords: ['transport', 'logistics', 'shipping', 'freight', 'airline', 'railroad', 'trucking', 'fedex', 'ups', 'union pacific', 'delta', 'united airlines'],
    industry: 'Transportation'
  },
  
  // Real Estate
  'Real Estate': {
    keywords: ['reit', 'real estate', 'property', 'realty', 'mortgage', 'housing', 'residential', 'commercial property'],
    industry: 'Real Estate'
  },
  
  // Materials
  'Materials': {
    keywords: ['mining', 'metal', 'steel', 'aluminum', 'copper', 'gold', 'silver', 'chemical', 'materials', 'packaging', 'newmont', 'freeport', 'nucor'],
    industry: 'Basic Materials'
  },
  
  // Communications
  'Communication Services': {
    keywords: ['media', 'telecom', 'communication', 'broadcast', 'streaming', 'social', 'advertising', 'meta', 'alphabet', 'google', 'netflix', 'disney', 'comcast', 'verizon', 'at&t'],
    industry: 'Media & Entertainment'
  },
  
  // Crypto-specific
  'Cryptocurrency': {
    keywords: ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'coinbase', 'binance'],
    industry: 'Digital Assets'
  }
};

// Well-known ticker to sector mappings
const TICKER_SECTOR_MAP: Record<string, { sector: string; industry: string }> = {
  // AI & Semiconductors
  'NVDA': { sector: 'Semiconductors', industry: 'Semiconductors' },
  'AMD': { sector: 'Semiconductors', industry: 'Semiconductors' },
  'INTC': { sector: 'Semiconductors', industry: 'Semiconductors' },
  'AVGO': { sector: 'Semiconductors', industry: 'Semiconductors' },
  'QCOM': { sector: 'Semiconductors', industry: 'Semiconductors' },
  'MU': { sector: 'Semiconductors', industry: 'Memory' },
  'ASML': { sector: 'Semiconductors', industry: 'Semiconductor Equipment' },
  'TSM': { sector: 'Semiconductors', industry: 'Semiconductor Manufacturing' },
  'MSFT': { sector: 'Technology', industry: 'Software' },
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
  'GOOGL': { sector: 'Technology', industry: 'Internet Services' },
  'GOOG': { sector: 'Technology', industry: 'Internet Services' },
  'META': { sector: 'Communication Services', industry: 'Social Media' },
  'AMZN': { sector: 'Consumer Discretionary', industry: 'E-Commerce' },
  'PLTR': { sector: 'AI & Machine Learning', industry: 'Data Analytics' },
  'AI': { sector: 'AI & Machine Learning', industry: 'AI Software' },
  'SNOW': { sector: 'Technology', industry: 'Cloud Data' },
  'CRM': { sector: 'Technology', industry: 'Enterprise Software' },
  'ORCL': { sector: 'Technology', industry: 'Enterprise Software' },
  'IBM': { sector: 'Technology', industry: 'IT Services' },
  
  // Biotech & Healthcare
  'JNJ': { sector: 'Healthcare', industry: 'Pharmaceuticals' },
  'PFE': { sector: 'Biotechnology', industry: 'Pharmaceuticals' },
  'MRNA': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'LLY': { sector: 'Healthcare', industry: 'Pharmaceuticals' },
  'UNH': { sector: 'Healthcare', industry: 'Health Insurance' },
  'ABBV': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'AMGN': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'GILD': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'BIIB': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'REGN': { sector: 'Biotechnology', industry: 'Biotechnology' },
  'VRTX': { sector: 'Biotechnology', industry: 'Biotechnology' },
  
  // Finance
  'JPM': { sector: 'Financial Services', industry: 'Banks' },
  'BAC': { sector: 'Financial Services', industry: 'Banks' },
  'WFC': { sector: 'Financial Services', industry: 'Banks' },
  'GS': { sector: 'Financial Services', industry: 'Investment Banking' },
  'MS': { sector: 'Financial Services', industry: 'Investment Banking' },
  'BLK': { sector: 'Financial Services', industry: 'Asset Management' },
  'V': { sector: 'Financial Services', industry: 'Payments' },
  'MA': { sector: 'Financial Services', industry: 'Payments' },
  'PYPL': { sector: 'Financial Services', industry: 'Digital Payments' },
  'SQ': { sector: 'Financial Services', industry: 'Fintech' },
  'COIN': { sector: 'Financial Services', industry: 'Crypto Exchange' },
  
  // Energy
  'XOM': { sector: 'Energy', industry: 'Oil & Gas' },
  'CVX': { sector: 'Energy', industry: 'Oil & Gas' },
  'COP': { sector: 'Energy', industry: 'Oil & Gas' },
  'SLB': { sector: 'Energy', industry: 'Oilfield Services' },
  'OXY': { sector: 'Energy', industry: 'Oil & Gas' },
  
  // Clean Energy
  'TSLA': { sector: 'Clean Energy', industry: 'Electric Vehicles' },
  'ENPH': { sector: 'Clean Energy', industry: 'Solar' },
  'FSLR': { sector: 'Clean Energy', industry: 'Solar' },
  'PLUG': { sector: 'Clean Energy', industry: 'Hydrogen' },
  'NEE': { sector: 'Clean Energy', industry: 'Utilities - Renewable' },
  'RIVN': { sector: 'Clean Energy', industry: 'Electric Vehicles' },
  'LCID': { sector: 'Clean Energy', industry: 'Electric Vehicles' },
  
  // Defense
  'LMT': { sector: 'Industrials', industry: 'Defense' },
  'RTX': { sector: 'Industrials', industry: 'Defense' },
  'NOC': { sector: 'Industrials', industry: 'Defense' },
  'BA': { sector: 'Industrials', industry: 'Aerospace' },
  'GD': { sector: 'Industrials', industry: 'Defense' },
  
  // Consumer
  'WMT': { sector: 'Consumer Staples', industry: 'Retail' },
  'COST': { sector: 'Consumer Staples', industry: 'Retail' },
  'TGT': { sector: 'Consumer Discretionary', industry: 'Retail' },
  'HD': { sector: 'Consumer Discretionary', industry: 'Home Improvement' },
  'NKE': { sector: 'Consumer Discretionary', industry: 'Apparel' },
  'SBUX': { sector: 'Consumer Discretionary', industry: 'Restaurants' },
  'MCD': { sector: 'Consumer Discretionary', industry: 'Restaurants' },
  'KO': { sector: 'Consumer Staples', industry: 'Beverages' },
  'PEP': { sector: 'Consumer Staples', industry: 'Beverages' },
  'PG': { sector: 'Consumer Staples', industry: 'Household Products' },
  
  // Materials
  'NEM': { sector: 'Materials', industry: 'Gold Mining' },
  'FCX': { sector: 'Materials', industry: 'Copper Mining' },
  'NUE': { sector: 'Materials', industry: 'Steel' },
  'AA': { sector: 'Materials', industry: 'Aluminum' },
  
  // REITs
  'AMT': { sector: 'Real Estate', industry: 'REITs' },
  'PLD': { sector: 'Real Estate', industry: 'Industrial REITs' },
  'SPG': { sector: 'Real Estate', industry: 'Retail REITs' },
  'O': { sector: 'Real Estate', industry: 'REITs' },
  
  // Travel
  'DAL': { sector: 'Transportation', industry: 'Airlines' },
  'UAL': { sector: 'Transportation', industry: 'Airlines' },
  'AAL': { sector: 'Transportation', industry: 'Airlines' },
  'MAR': { sector: 'Consumer Discretionary', industry: 'Hotels' },
  'HLT': { sector: 'Consumer Discretionary', industry: 'Hotels' },
  'BKNG': { sector: 'Consumer Discretionary', industry: 'Travel Services' },
  'ABNB': { sector: 'Consumer Discretionary', industry: 'Travel Services' },
  
  // Media
  'DIS': { sector: 'Communication Services', industry: 'Entertainment' },
  'NFLX': { sector: 'Communication Services', industry: 'Streaming' },
  'CMCSA': { sector: 'Communication Services', industry: 'Cable' },
  'WBD': { sector: 'Communication Services', industry: 'Entertainment' },
  
  // Crypto
  'BTC': { sector: 'Cryptocurrency', industry: 'Digital Assets' },
  'ETH': { sector: 'Cryptocurrency', industry: 'Smart Contracts' },
  'BTC/USD': { sector: 'Cryptocurrency', industry: 'Digital Assets' },
  'ETH/USD': { sector: 'Cryptocurrency', industry: 'Smart Contracts' },
};

function classifyAsset(ticker: string, name: string, assetClass: string): { sector: string; industry: string } | null {
  // Check direct ticker mapping first
  const tickerUpper = ticker.toUpperCase();
  if (TICKER_SECTOR_MAP[tickerUpper]) {
    return TICKER_SECTOR_MAP[tickerUpper];
  }
  
  // For crypto assets
  if (assetClass === 'crypto') {
    return { sector: 'Cryptocurrency', industry: 'Digital Assets' };
  }
  
  // For forex assets
  if (assetClass === 'forex') {
    return { sector: 'Currency', industry: 'Foreign Exchange' };
  }
  
  // For commodities
  if (assetClass === 'commodity') {
    return { sector: 'Commodities', industry: 'Commodities' };
  }
  
  // Try name-based classification
  const nameLower = name.toLowerCase();
  
  for (const [sector, config] of Object.entries(SECTOR_PATTERNS)) {
    for (const keyword of config.keywords) {
      if (nameLower.includes(keyword.toLowerCase())) {
        return { sector, industry: config.industry || sector };
      }
    }
  }
  
  // Default based on asset class
  if (assetClass === 'etf') {
    return { sector: 'ETF', industry: 'Exchange Traded Fund' };
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

    // Get batch parameters
    const { batch_size = 1000, offset = 0 } = await req.json().catch(() => ({}));

    console.log(`Enriching assets: batch_size=${batch_size}, offset=${offset}`);

    // Fetch assets that need enrichment (no sector in metadata)
    const { data: assets, error: fetchError } = await supabase
      .from('assets')
      .select('id, ticker, name, asset_class, metadata')
      .range(offset, offset + batch_size - 1);

    if (fetchError) throw fetchError;

    console.log(`Fetched ${assets?.length || 0} assets to process`);

    let enriched = 0;
    let skipped = 0;
    const updates: any[] = [];

    for (const asset of assets || []) {
      // Skip if already has sector
      if (asset.metadata?.sector) {
        skipped++;
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
            industry: classification.industry
          }
        });
        enriched++;
      }
    }

    // Batch update
    if (updates.length > 0) {
      console.log(`Updating ${updates.length} assets with sector data`);
      
      for (let i = 0; i < updates.length; i += 100) {
        const batch = updates.slice(i, i + 100);
        for (const update of batch) {
          const { error: updateError } = await supabase
            .from('assets')
            .update({ metadata: update.metadata })
            .eq('id', update.id);
          
          if (updateError) {
            console.error(`Failed to update ${update.id}:`, updateError);
          }
        }
      }
    }

    const duration = Date.now() - startTime;

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
        total_processed: assets?.length || 0
      }
    });

    return new Response(JSON.stringify({
      success: true,
      enriched,
      skipped,
      total_processed: assets?.length || 0,
      next_offset: offset + batch_size,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error enriching assets:', error);
    return new Response(JSON.stringify({ 
      error: message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
