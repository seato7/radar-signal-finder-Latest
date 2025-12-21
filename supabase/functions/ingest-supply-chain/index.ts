import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v6 - Supply chain news via RSS feeds (more reliable than Firecrawl search)
// If Firecrawl isn't working, we use RSS feeds as primary source

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source: string;
}

// Supply chain related RSS feeds
const SUPPLY_CHAIN_RSS_FEEDS = [
  { name: 'FreightWaves', url: 'https://www.freightwaves.com/feed', type: 'logistics' },
  { name: 'Supply Chain Dive', url: 'https://www.supplychaindive.com/feeds/news/', type: 'supply_chain' },
  { name: 'Logistics Management', url: 'https://www.logisticsmgmt.com/rss/lm_news.xml', type: 'logistics' },
  { name: 'DC Velocity', url: 'https://www.dcvelocity.com/rss/news.xml', type: 'logistics' },
  { name: 'Reuters Supply Chain', url: 'https://www.reuters.com/business/autos-transportation/', type: 'general' },
];

// Company mappings for supply chain companies
const SUPPLY_CHAIN_COMPANIES: Record<string, string> = {
  'FedEx': 'FDX', 'UPS': 'UPS', 'Amazon': 'AMZN', 'Walmart': 'WMT', 'Target': 'TGT',
  'Costco': 'COST', 'Home Depot': 'HD', "Lowe's": 'LOW', 'Nike': 'NKE',
  'Intel': 'INTC', 'AMD': 'AMD', 'Nvidia': 'NVDA', 'TSMC': 'TSM', 'Qualcomm': 'QCOM',
  'Broadcom': 'AVGO', 'Micron': 'MU', 'Applied Materials': 'AMAT',
  'Ford': 'F', 'GM': 'GM', 'Tesla': 'TSLA', 'Toyota': 'TM', 'Honda': 'HMC',
  'Apple': 'AAPL', 'Caterpillar': 'CAT', 'Deere': 'DE', '3M': 'MMM',
  'Boeing': 'BA', 'Lockheed': 'LMT', 'Norfolk Southern': 'NSC', 'Union Pacific': 'UNP',
  'CSX': 'CSX', 'XPO Logistics': 'XPO', 'CH Robinson': 'CHRW', 'JB Hunt': 'JBHT',
  'Old Dominion': 'ODFL', 'Expeditors': 'EXPD', 'Ryder': 'R', 'Werner': 'WERN',
};

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
  
  const contentLower = content.toLowerCase();
  for (const [company, ticker] of Object.entries(SUPPLY_CHAIN_COMPANIES)) {
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
  if (contentLower.includes('semiconductor') || contentLower.includes('chip')) {
    return { type: 'production', indicator: contentLower.includes('shortage') ? 'bearish' : 'neutral' };
  }
  if (contentLower.includes('inventory') || contentLower.includes('warehouse')) {
    return { type: 'inventory', indicator: contentLower.includes('shortage') || contentLower.includes('low') ? 'bearish' : 'bullish' };
  }
  if (contentLower.includes('truck') || contentLower.includes('rail') || contentLower.includes('transportation')) {
    return { type: 'logistics', indicator: 'neutral' };
  }
  
  return { type: 'general', indicator: 'neutral' };
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
        title: titleMatch[1].trim(),
        link: linkMatch ? linkMatch[1].trim() : '',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined,
        description: descMatch ? descMatch[1].trim().substring(0, 500) : undefined,
        source: sourceName,
      });
    }
  }
  
  return items;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  let supabase: ReturnType<typeof createClient>;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v6] Starting supply chain signals ingestion via RSS feeds');
    
    // Load valid tickers (limit to 500 for performance)
    const validTickers = new Set<string>();
    const { data: assets } = await supabase
      .from('assets')
      .select('ticker')
      .limit(500);
    
    if (assets && Array.isArray(assets)) {
      for (const asset of assets as { ticker: string }[]) {
        validTickers.add(asset.ticker.toUpperCase());
      }
    }
    console.log(`Loaded ${validTickers.size} valid tickers`);
    
    const signals: Array<{
      ticker: string;
      signal_type: string;
      metric_name: string;
      metric_value: number;
      change_percentage: number;
      indicator: string;
      report_date: string;
      metadata: Record<string, unknown>;
    }> = [];
    
    const processedUrls = new Set<string>();
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch RSS feeds
    let feedsProcessed = 0;
    let feedsFailed = 0;
    
    for (const feed of SUPPLY_CHAIN_RSS_FEEDS) {
      try {
        console.log(`Fetching ${feed.name}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SupplyChainBot/2.0)' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.log(`Failed: ${feed.name} (${response.status})`);
          feedsFailed++;
          continue;
        }
        
        const xml = await response.text();
        const items = parseRSSXml(xml, feed.name);
        console.log(`Parsed ${items.length} items from ${feed.name}`);
        feedsProcessed++;
        
        for (const item of items) {
          if (item.link && processedUrls.has(item.link)) continue;
          if (item.link) processedUrls.add(item.link);
          
          const content = `${item.title} ${item.description || ''}`;
          const tickers = extractTickersFromContent(content, validTickers);
          
          if (tickers.length === 0) continue;
          
          const { type, indicator } = categorizeSignal(content);
          
          for (const ticker of tickers) {
            signals.push({
              ticker: ticker.substring(0, 10),
              signal_type: type.substring(0, 20),
              metric_name: item.title.substring(0, 50),
              metric_value: 0,
              change_percentage: 0,
              indicator: indicator.substring(0, 20),
              report_date: today,
              metadata: {
                source: 'rss_supply_chain',
                feed: feed.name,
                url: item.link || null,
                title: item.title,
                version: 'v6_rss_based',
              },
            });
          }
        }
        
      } catch (e) {
        console.error(`Error: ${feed.name}:`, e);
        feedsFailed++;
      }
    }

    console.log(`\n=== SUPPLY CHAIN SUMMARY ===`);
    console.log(`Feeds: ${feedsProcessed} ok, ${feedsFailed} failed`);
    console.log(`Total signals: ${signals.length}`);
    console.log(`Unique sources: ${processedUrls.size}`);

    // Deduplicate signals
    const uniqueSignals = Array.from(
      new Map(signals.map(s => [`${s.ticker}-${s.signal_type}-${s.report_date}`, s])).values()
    );
    console.log(`Unique signals: ${uniqueSignals.length}`);

    // Insert signals
    let insertedCount = 0;
    if (uniqueSignals.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < uniqueSignals.length; i += batchSize) {
        const batch = uniqueSignals.slice(i, i + batchSize);
        // Use explicit any type to bypass strict table typing
        const { error } = await (supabase.from('supply_chain_signals') as any).insert(batch);
        
        if (error) {
          console.error(`Insert error:`, error.message);
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
      source_used: 'RSS Supply Chain Feeds',
    });

    if (insertedCount > 0) {
      await slackAlerter.sendLiveAlert({
        etlName: 'ingest-supply-chain',
        status: 'success',
        duration: durationMs,
        rowsInserted: insertedCount,
        rowsSkipped: 0,
        sourceUsed: 'RSS Supply Chain Feeds',
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted: insertedCount,
        feeds_processed: feedsProcessed,
        feeds_failed: feedsFailed,
        news_sources: processedUrls.size,
        version: 'v6_rss_based',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error:', error);
    
    if (supabase!) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-supply-chain',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'RSS Supply Chain Feeds',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-supply-chain',
      message: `Supply chain ingestion failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
