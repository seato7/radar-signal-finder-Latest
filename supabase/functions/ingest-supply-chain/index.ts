import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v5 - Real supply chain news via Firecrawl search (no synthetic data)

interface FirecrawlResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// Supply chain related search queries
const SUPPLY_CHAIN_QUERIES = [
  'supply chain disruption stocks',
  'shipping delays manufacturing stocks',
  'semiconductor shortage companies',
  'port congestion impact stocks',
  'logistics crisis companies',
  'raw material shortage stocks',
  'inventory shortage retail',
  'supply chain crisis earnings',
  'manufacturing delays automotive',
  'chip shortage technology stocks',
];

// Extract tickers from content
function extractTickersFromContent(content: string, validTickers: Set<string>): string[] {
  const found = new Set<string>();
  const patterns = [
    /\$([A-Z]{1,5})\b/g,
    /\(([A-Z]{2,5})\)/g,
    /\bNASDAQ:\s*([A-Z]{1,5})\b/gi,
    /\bNYSE:\s*([A-Z]{1,5})\b/gi,
  ];
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = content.matchAll(regex);
    for (const match of matches) {
      const ticker = match[1].toUpperCase();
      if (validTickers.has(ticker) && ticker.length >= 2) {
        found.add(ticker);
      }
    }
  }
  
  // Company name mappings for supply chain related companies
  const supplyChainCompanies: Record<string, string> = {
    'FedEx': 'FDX', 'UPS': 'UPS', 'Amazon': 'AMZN', 'Walmart': 'WMT', 'Target': 'TGT',
    'Costco': 'COST', 'Home Depot': 'HD', "Lowe's": 'LOW', 'Nike': 'NKE',
    'Intel': 'INTC', 'AMD': 'AMD', 'Nvidia': 'NVDA', 'TSMC': 'TSM', 'Qualcomm': 'QCOM',
    'Broadcom': 'AVGO', 'Micron': 'MU', 'Applied Materials': 'AMAT',
    'Ford': 'F', 'GM': 'GM', 'Tesla': 'TSLA', 'Toyota': 'TM', 'Honda': 'HMC',
    'Apple': 'AAPL', 'Caterpillar': 'CAT', 'Deere': 'DE', '3M': 'MMM',
    'Boeing': 'BA', 'Lockheed': 'LMT', 'Norfolk Southern': 'NSC', 'Union Pacific': 'UNP',
    'CSX': 'CSX', 'Maersk': 'AMKBY', 'XPO Logistics': 'XPO', 'CH Robinson': 'CHRW',
  };
  
  const contentLower = content.toLowerCase();
  for (const [company, ticker] of Object.entries(supplyChainCompanies)) {
    if (contentLower.includes(company.toLowerCase()) && validTickers.has(ticker)) {
      found.add(ticker);
    }
  }
  
  return Array.from(found);
}

// Determine supply chain signal type from content
function categorizeSignal(content: string): { type: string; indicator: string } {
  const contentLower = content.toLowerCase();
  
  if (contentLower.includes('shipping') || contentLower.includes('port') || contentLower.includes('freight')) {
    return { type: 'shipping', indicator: contentLower.includes('delay') || contentLower.includes('congestion') ? 'bearish' : 'neutral' };
  }
  if (contentLower.includes('semiconductor') || contentLower.includes('chip shortage')) {
    return { type: 'production', indicator: contentLower.includes('shortage') ? 'bearish' : 'neutral' };
  }
  if (contentLower.includes('inventory') || contentLower.includes('stock')) {
    return { type: 'inventory', indicator: contentLower.includes('shortage') || contentLower.includes('low') ? 'bearish' : 'bullish' };
  }
  if (contentLower.includes('supplier') || contentLower.includes('vendor')) {
    return { type: 'supplier', indicator: 'neutral' };
  }
  if (contentLower.includes('logistics') || contentLower.includes('transportation')) {
    return { type: 'logistics', indicator: 'neutral' };
  }
  
  return { type: 'general', indicator: 'neutral' };
}

async function searchSupplyChainNews(query: string, firecrawlKey: string): Promise<FirecrawlResult[]> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        limit: 10,
        tbs: 'qdr:w', // Last week
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });
    
    if (!response.ok) {
      console.log(`Firecrawl returned ${response.status} for query: ${query}`);
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
    
  } catch (error) {
    console.error(`Firecrawl error for query ${query}:`, error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  let supabase: any;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v5] Starting supply chain signals ingestion with REAL DATA ONLY');
    
    if (!firecrawlKey) {
      console.warn('FIRECRAWL_API_KEY not configured - supply chain ingestion will return 0 rows');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-supply-chain',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'No API key - skipped',
      });
      
      return new Response(
        JSON.stringify({ success: true, count: 0, message: 'No FIRECRAWL_API_KEY configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Load valid tickers
    const validTickers = new Set<string>();
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('assets')
        .select('ticker')
        .range(offset, offset + batchSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      for (const asset of data) {
        validTickers.add(asset.ticker.toUpperCase());
      }
      
      if (data.length < batchSize) break;
      offset += batchSize;
    }
    console.log(`Loaded ${validTickers.size} valid tickers from database`);
    
    const signals: any[] = [];
    const processedUrls = new Set<string>();
    const today = new Date().toISOString().split('T')[0];
    
    // Search for supply chain news using various queries
    for (const query of SUPPLY_CHAIN_QUERIES) {
      console.log(`Searching: ${query}`);
      const results = await searchSupplyChainNews(query, firecrawlKey);
      
      for (const result of results) {
        // Skip duplicates
        if (result.url && processedUrls.has(result.url)) continue;
        if (result.url) processedUrls.add(result.url);
        
        const content = `${result.title || ''} ${result.description || ''} ${result.markdown || ''}`;
        
        // Extract tickers mentioned
        const tickers = extractTickersFromContent(content, validTickers);
        
        if (tickers.length === 0) continue;
        
        // Categorize the signal
        const { type, indicator } = categorizeSignal(content);
        
        // Create signal for each ticker mentioned
        for (const ticker of tickers) {
          signals.push({
            ticker: ticker.substring(0, 10),
            signal_type: type.substring(0, 20),
            metric_name: (result.title || 'Supply Chain Update').substring(0, 50),
            metric_value: 0, // No specific metric value for news-based signals
            change_percentage: 0,
            indicator: indicator.substring(0, 20),
            report_date: today,
            metadata: {
              source: 'firecrawl_news_search',
              query: query,
              url: result.url || null,
              title: result.title || null,
              version: 'v5_real_data_only',
            },
          });
        }
      }
      
      // Rate limit between searches
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    console.log(`\n=== SUPPLY CHAIN SUMMARY ===`);
    console.log(`Total signals with REAL data: ${signals.length}`);
    console.log(`Unique news sources: ${processedUrls.size}`);
    console.log(`Estimated/fake data: 0 (REAL DATA ONLY)`);

    // Deduplicate signals by ticker + signal_type + report_date
    const uniqueSignals = Array.from(
      new Map(signals.map(s => [`${s.ticker}-${s.signal_type}-${s.report_date}`, s])).values()
    );
    console.log(`Unique signals after dedup: ${uniqueSignals.length}`);

    // Insert signals in batches
    let insertedCount = 0;
    if (uniqueSignals.length > 0) {
      const insertBatchSize = 100;
      for (let i = 0; i < uniqueSignals.length; i += insertBatchSize) {
        const batch = uniqueSignals.slice(i, i + insertBatchSize);
        const { error } = await supabase.from('supply_chain_signals').insert(batch);
        
        if (error) {
          console.error(`Insert error at batch ${i}:`, error.message);
        } else {
          insertedCount += batch.length;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-supply-chain',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: durationMs,
      source_used: 'Firecrawl Supply Chain News',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-supply-chain',
      status: 'success',
      duration: durationMs,
      rowsInserted: insertedCount,
      rowsSkipped: 0,
      sourceUsed: 'Firecrawl Supply Chain News',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: insertedCount,
        news_sources: processedUrls.size,
        queries_run: SUPPLY_CHAIN_QUERIES.length,
        version: 'v5_real_data_only',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-supply-chain:', error);
    
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-supply-chain',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl Supply Chain News',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-supply-chain',
      message: `Supply chain ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
