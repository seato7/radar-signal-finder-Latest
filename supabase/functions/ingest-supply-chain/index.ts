import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v7 - Supply chain news via verified working RSS feeds

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source: string;
}

// Verified working supply chain RSS feeds
const SUPPLY_CHAIN_RSS_FEEDS = [
  // FreightWaves - verified working
  { name: 'FreightWaves', url: 'https://www.freightwaves.com/feed', type: 'logistics' },
  // Supply Chain Dive - verified working
  { name: 'Supply Chain Dive', url: 'https://www.supplychaindive.com/feeds/news/', type: 'supply_chain' },
  // SupplyChainBrain topic feeds - verified URLs from their RSS page
  { name: 'SCB Logistics', url: 'https://www.supplychainbrain.com/rss/topic/1135-logistics', type: 'logistics' },
  { name: 'SCB Ocean Transport', url: 'https://www.supplychainbrain.com/rss/topic/1143-ocean-transportation', type: 'shipping' },
  { name: 'SCB Global Logistics', url: 'https://www.supplychainbrain.com/rss/topic/1140-global-logistics', type: 'logistics' },
  { name: 'SCB Transportation', url: 'https://www.supplychainbrain.com/rss/topic/1147-transportation-distribution', type: 'transportation' },
  { name: 'SCB Manufacturing', url: 'https://www.supplychainbrain.com/rss/topic/1167-manufacturing-production', type: 'manufacturing' },
  { name: 'SCB Sourcing', url: 'https://www.supplychainbrain.com/rss/topic/1169-sourcing-procurement', type: 'sourcing' },
  // Additional general business feeds that cover supply chain
  { name: 'CNBC Supply Chain', url: 'https://www.cnbc.com/id/10000115/device/rss/rss.html', type: 'general' },
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
  'CSX': 'CSX', 'XPO Logistics': 'XPO', 'XPO': 'XPO', 'CH Robinson': 'CHRW', 'JB Hunt': 'JBHT',
  'Old Dominion': 'ODFL', 'Expeditors': 'EXPD', 'Ryder': 'R', 'Werner': 'WERN',
  'Maersk': 'AMKBY', 'Microsoft': 'MSFT', 'Google': 'GOOGL', 'Meta': 'META',
  'Starbucks': 'SBUX', 'McDonald': 'MCD', 'Coca-Cola': 'KO', 'Pepsi': 'PEP',
  'Procter': 'PG', 'Johnson': 'JNJ', 'Pfizer': 'PFE', 'Merck': 'MRK',
  'ExxonMobil': 'XOM', 'Exxon': 'XOM', 'Chevron': 'CVX', 'Shell': 'SHEL',
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
  
  if (contentLower.includes('shipping') || contentLower.includes('port') || contentLower.includes('freight') || contentLower.includes('ocean')) {
    return { type: 'shipping', indicator: contentLower.includes('delay') || contentLower.includes('congestion') ? 'bearish' : 'neutral' };
  }
  if (contentLower.includes('semiconductor') || contentLower.includes('chip')) {
    return { type: 'production', indicator: contentLower.includes('shortage') ? 'bearish' : 'neutral' };
  }
  if (contentLower.includes('inventory') || contentLower.includes('warehouse') || contentLower.includes('fulfillment')) {
    return { type: 'inventory', indicator: contentLower.includes('shortage') || contentLower.includes('low') ? 'bearish' : 'bullish' };
  }
  if (contentLower.includes('truck') || contentLower.includes('rail') || contentLower.includes('transportation') || contentLower.includes('logistics')) {
    return { type: 'logistics', indicator: 'neutral' };
  }
  if (contentLower.includes('manufacturing') || contentLower.includes('production') || contentLower.includes('factory')) {
    return { type: 'production', indicator: contentLower.includes('halt') || contentLower.includes('shutdown') ? 'bearish' : 'neutral' };
  }
  if (contentLower.includes('sourcing') || contentLower.includes('procurement') || contentLower.includes('supplier')) {
    return { type: 'sourcing', indicator: 'neutral' };
  }
  
  return { type: 'general', indicator: 'neutral' };
}

function parseRSSXml(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Try standard RSS format
  let itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const item = extractItemFromXml(itemXml, sourceName);
    if (item) items.push(item);
  }
  
  // Try Atom format if no items found
  if (items.length === 0) {
    itemRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const item = extractAtomItemFromXml(itemXml, sourceName);
      if (item) items.push(item);
    }
  }
  
  return items;
}

function extractItemFromXml(itemXml: string, sourceName: string): RSSItem | null {
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const linkRegex = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;
  const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
  
  const titleMatch = itemXml.match(titleRegex);
  if (!titleMatch) return null;
  
  const linkMatch = itemXml.match(linkRegex);
  const pubDateMatch = itemXml.match(pubDateRegex);
  const descMatch = itemXml.match(descRegex);
  
  return {
    title: titleMatch[1].trim().replace(/<[^>]*>/g, ''),
    link: linkMatch ? linkMatch[1].trim() : '',
    pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined,
    description: descMatch ? descMatch[1].trim().substring(0, 500).replace(/<[^>]*>/g, '') : undefined,
    source: sourceName,
  };
}

function extractAtomItemFromXml(itemXml: string, sourceName: string): RSSItem | null {
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i;
  const linkRegex = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const updatedRegex = /<updated>([\s\S]*?)<\/updated>/i;
  const summaryRegex = /<summary[^>]*>([\s\S]*?)<\/summary>/i;
  
  const titleMatch = itemXml.match(titleRegex);
  if (!titleMatch) return null;
  
  const linkMatch = itemXml.match(linkRegex);
  const updatedMatch = itemXml.match(updatedRegex);
  const summaryMatch = itemXml.match(summaryRegex);
  
  return {
    title: titleMatch[1].trim().replace(/<[^>]*>/g, ''),
    link: linkMatch ? linkMatch[1].trim() : '',
    pubDate: updatedMatch ? updatedMatch[1].trim() : undefined,
    description: summaryMatch ? summaryMatch[1].trim().substring(0, 500).replace(/<[^>]*>/g, '') : undefined,
    source: sourceName,
  };
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

    console.log('[v7] Starting supply chain signals ingestion via verified RSS feeds');
    
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
    let totalItems = 0;
    
    for (const feed of SUPPLY_CHAIN_RSS_FEEDS) {
      try {
        console.log(`Fetching ${feed.name}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(feed.url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
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
        console.log(`✓ Parsed ${items.length} items from ${feed.name}`);
        feedsProcessed++;
        totalItems += items.length;
        
        for (const item of items) {
          if (item.link && processedUrls.has(item.link)) continue;
          if (item.link) processedUrls.add(item.link);
          
          const content = `${item.title} ${item.description || ''}`;
          const tickers = extractTickersFromContent(content, validTickers);
          
          // Even if no direct ticker match, check if it's supply chain relevant
          // and assign to major logistics/retail tickers
          const finalTickers = tickers.length > 0 ? tickers : inferTickersFromContent(content, validTickers);
          
          if (finalTickers.length === 0) continue;
          
          const { type, indicator } = categorizeSignal(content);
          
          for (const ticker of finalTickers) {
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
                version: 'v7_verified_feeds',
              },
            });
          }
        }
        
      } catch (e) {
        console.error(`Error: ${feed.name}:`, e instanceof Error ? e.message : e);
        feedsFailed++;
      }
    }

    console.log(`\n=== SUPPLY CHAIN SUMMARY ===`);
    console.log(`Feeds: ${feedsProcessed}/${SUPPLY_CHAIN_RSS_FEEDS.length} ok, ${feedsFailed} failed`);
    console.log(`Total RSS items: ${totalItems}`);
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
      source_used: 'RSS Supply Chain Feeds v7',
    });

    if (insertedCount > 0 || feedsProcessed > 0) {
      await slackAlerter.sendLiveAlert({
        etlName: 'ingest-supply-chain',
        status: 'success',
        duration: durationMs,
        rowsInserted: insertedCount,
        rowsSkipped: 0,
        sourceUsed: `RSS v7 (${feedsProcessed}/${SUPPLY_CHAIN_RSS_FEEDS.length} feeds)`,
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted: insertedCount,
        feeds_processed: feedsProcessed,
        feeds_failed: feedsFailed,
        total_items: totalItems,
        news_sources: processedUrls.size,
        version: 'v7_verified_feeds',
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
        source_used: 'RSS Supply Chain Feeds v7',
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

// Infer tickers from supply chain content when no direct match
function inferTickersFromContent(content: string, validTickers: Set<string>): string[] {
  const contentLower = content.toLowerCase();
  const inferred: string[] = [];
  
  // Shipping/logistics content -> logistics companies
  if (contentLower.includes('shipping') || contentLower.includes('freight') || contentLower.includes('trucking')) {
    const logisticsTickers = ['FDX', 'UPS', 'XPO', 'JBHT', 'ODFL', 'CHRW'];
    for (const t of logisticsTickers) {
      if (validTickers.has(t)) {
        inferred.push(t);
        break; // Just pick one
      }
    }
  }
  
  // Retail/e-commerce content
  if (contentLower.includes('retail') || contentLower.includes('e-commerce') || contentLower.includes('consumer')) {
    const retailTickers = ['AMZN', 'WMT', 'TGT', 'COST'];
    for (const t of retailTickers) {
      if (validTickers.has(t)) {
        inferred.push(t);
        break;
      }
    }
  }
  
  // Semiconductor/chip content
  if (contentLower.includes('semiconductor') || contentLower.includes('chip') || contentLower.includes('microchip')) {
    const chipTickers = ['TSM', 'INTC', 'AMD', 'NVDA', 'MU'];
    for (const t of chipTickers) {
      if (validTickers.has(t)) {
        inferred.push(t);
        break;
      }
    }
  }
  
  // Automotive content
  if (contentLower.includes('automotive') || contentLower.includes('auto') || contentLower.includes('vehicle')) {
    const autoTickers = ['F', 'GM', 'TSLA', 'TM'];
    for (const t of autoTickers) {
      if (validTickers.has(t)) {
        inferred.push(t);
        break;
      }
    }
  }
  
  return inferred;
}
