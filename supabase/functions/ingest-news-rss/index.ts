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

// v4 - Expanded: More feeds, all processed each run, better extraction

// Verified working RSS feeds - all processed each run
const RSS_FEEDS = [
  // Primary financial news
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline', type: 'general' },
  { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', type: 'general' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', type: 'general' },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', type: 'general' },
  { name: 'Benzinga', url: 'https://www.benzinga.com/feed/', type: 'general' },
  
  // Tech news
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'tech' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'tech' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', type: 'tech' },
  
  // Crypto news
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', type: 'crypto' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', type: 'crypto' },
  
  // Energy/Sector news
  { name: 'Oil Price', url: 'https://oilprice.com/rss/main', type: 'energy' },
  
  // General business
  { name: 'Business Insider', url: 'https://www.businessinsider.com/rss', type: 'general' },
];

// Expanded ticker patterns
const TICKER_PATTERNS = [
  /\$([A-Z]{1,5})\b/g,                     // $AAPL
  /\(([A-Z]{2,5})\)/g,                      // (AAPL)
  /\bNASDAQ:\s*([A-Z]{1,5})\b/gi,           // NASDAQ: AAPL
  /\bNYSE:\s*([A-Z]{1,5})\b/gi,             // NYSE: AAPL
  /\b([A-Z]{2,4})\s+stock\b/gi,             // AAPL stock
  /\b([A-Z]{2,4})\s+shares\b/gi,            // AAPL shares
];

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source: string;
}

// Expanded company mappings for better extraction
const COMPANY_MAPPINGS: Record<string, string> = {
  // Tech giants
  'Apple': 'AAPL', 'Apple Inc': 'AAPL', 'Microsoft': 'MSFT', 'Microsoft Corp': 'MSFT',
  'Google': 'GOOGL', 'Alphabet': 'GOOGL', 'Amazon': 'AMZN', 'Amazon.com': 'AMZN',
  'Tesla': 'TSLA', 'Meta': 'META', 'Meta Platforms': 'META', 'Facebook': 'META',
  'Netflix': 'NFLX', 'Nvidia': 'NVDA', 'AMD': 'AMD', 'Intel': 'INTC',
  
  // Tech/Software
  'Salesforce': 'CRM', 'Adobe': 'ADBE', 'Oracle': 'ORCL', 'IBM': 'IBM',
  'Cisco': 'CSCO', 'Qualcomm': 'QCOM', 'Broadcom': 'AVGO', 'Micron': 'MU',
  'Palantir': 'PLTR', 'CrowdStrike': 'CRWD', 'Datadog': 'DDOG', 'Cloudflare': 'NET',
  'Snowflake': 'SNOW', 'ServiceNow': 'NOW', 'Workday': 'WDAY', 'Zoom': 'ZM',
  
  // Consumer/Retail
  'Disney': 'DIS', 'Nike': 'NKE', 'Walmart': 'WMT', 'Target': 'TGT',
  'Costco': 'COST', 'Home Depot': 'HD', 'Starbucks': 'SBUX', 'McDonald\'s': 'MCD',
  'Coca-Cola': 'KO', 'Pepsi': 'PEP', 'PepsiCo': 'PEP',
  
  // Finance
  'JPMorgan': 'JPM', 'JP Morgan': 'JPM', 'Goldman Sachs': 'GS', 'Goldman': 'GS',
  'Morgan Stanley': 'MS', 'Bank of America': 'BAC', 'Citigroup': 'C', 'Wells Fargo': 'WFC',
  'Visa': 'V', 'Mastercard': 'MA', 'PayPal': 'PYPL', 'Square': 'SQ', 'Block': 'SQ',
  'Coinbase': 'COIN', 'Robinhood': 'HOOD',
  
  // Healthcare
  'Pfizer': 'PFE', 'Moderna': 'MRNA', 'Johnson & Johnson': 'JNJ', 'J&J': 'JNJ',
  'UnitedHealth': 'UNH', 'Abbvie': 'ABBV', 'Merck': 'MRK', 'Eli Lilly': 'LLY', 'Lilly': 'LLY',
  
  // Energy
  'Exxon': 'XOM', 'ExxonMobil': 'XOM', 'Chevron': 'CVX', 'ConocoPhillips': 'COP',
  
  // EV/Auto
  'Rivian': 'RIVN', 'Lucid': 'LCID', 'NIO': 'NIO', 'Ford': 'F', 'GM': 'GM', 'General Motors': 'GM',
  
  // Airlines/Travel
  'Delta': 'DAL', 'United': 'UAL', 'United Airlines': 'UAL', 'American Airlines': 'AAL',
  'Southwest': 'LUV', 'Uber': 'UBER', 'Lyft': 'LYFT', 'Airbnb': 'ABNB', 'Booking': 'BKNG',
  
  // Industrial
  'Boeing': 'BA', 'Caterpillar': 'CAT', 'Lockheed': 'LMT', 'Lockheed Martin': 'LMT',
  'Raytheon': 'RTX', 'General Electric': 'GE', 'GE': 'GE', '3M': 'MMM', 'Honeywell': 'HON',
  
  // Telecom
  'AT&T': 'T', 'Verizon': 'VZ', 'T-Mobile': 'TMUS',
  
  // Meme stocks
  'GameStop': 'GME', 'AMC': 'AMC', 'AMC Entertainment': 'AMC',
  
  // Crypto-related companies
  'MicroStrategy': 'MSTR', 'Marathon': 'MARA', 'Riot': 'RIOT',
  
  // Crypto assets
  'Bitcoin': 'BTC', 'Ethereum': 'ETH', 'Solana': 'SOL', 'XRP': 'XRP', 'Dogecoin': 'DOGE',
  'Cardano': 'ADA', 'Polkadot': 'DOT', 'Avalanche': 'AVAX', 'Chainlink': 'LINK',
  
  // Semiconductors
  'ASML': 'ASML', 'Taiwan Semiconductor': 'TSM', 'TSMC': 'TSM', 'Applied Materials': 'AMAT',
  'Lam Research': 'LRCX', 'KLA': 'KLAC', 'Marvell': 'MRVL', 'ON Semiconductor': 'ON',
  
  // Social/Entertainment
  'Snap': 'SNAP', 'Snapchat': 'SNAP', 'Pinterest': 'PINS', 'Spotify': 'SPOT',
  'Roku': 'ROKU', 'Roblox': 'RBLX',
};

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
      if (validTickers.has(ticker) && ticker.length >= 2 && ticker.length <= 6) { // allow 6-char forex tickers (EURUSD etc)
        tickers.add(ticker);
      }
    }
  }
  
  // Company name matching - more aggressive
  const textLower = text.toLowerCase();
  for (const [company, ticker] of Object.entries(COMPANY_MAPPINGS)) {
    if (textLower.includes(company.toLowerCase())) {
      if (validTickers.has(ticker) || ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'MATIC'].includes(ticker)) {
        tickers.add(ticker);
      }
    }
  }
  
  return Array.from(tickers);
}

function safeParseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneWeekFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    if (date < oneYearAgo || date > oneWeekFuture) {
      return null;
    }
    
    return date.toISOString();
  } catch {
    return null;
  }
}

function parseRSSXml(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Handle both RSS and Atom formats
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const linkRegex = /<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i;
  const linkHrefRegex = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;
  const updatedRegex = /<updated>([\s\S]*?)<\/updated>/i;
  const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
  const summaryRegex = /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i;
  const contentRegex = /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i;
  
  // Try RSS format first
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const titleMatch = itemXml.match(titleRegex);
    const linkMatch = itemXml.match(linkRegex) || itemXml.match(linkHrefRegex);
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
  
  // Try Atom format if no RSS items found
  if (items.length === 0) {
    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];
      
      const titleMatch = entryXml.match(titleRegex);
      const linkMatch = entryXml.match(linkHrefRegex) || entryXml.match(linkRegex);
      const updatedMatch = entryXml.match(updatedRegex);
      const summaryMatch = entryXml.match(summaryRegex) || entryXml.match(contentRegex);
      
      if (titleMatch) {
        items.push({
          title: titleMatch[1].trim().replace(/<[^>]+>/g, ''),
          link: linkMatch ? linkMatch[1].trim() : '',
          pubDate: updatedMatch ? updatedMatch[1].trim() : undefined,
          description: summaryMatch ? summaryMatch[1].trim().replace(/<[^>]+>/g, '').substring(0, 500) : undefined,
          source: sourceName,
        });
      }
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
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    console.log('[v4] Starting expanded RSS news ingestion...');
    
    // Load valid tickers - expanded set
    const validTickers = new Set<string>();
    
    // Popular tickers
    const popularTickers = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'INTC', 'NFLX',
      'DIS', 'BA', 'NKE', 'JPM', 'GS', 'MS', 'BAC', 'WFC', 'C', 'V', 'MA', 'PYPL',
      'COIN', 'HOOD', 'WMT', 'TGT', 'COST', 'HD', 'LOW', 'CVS', 'WBA', 'KR',
      'KO', 'PEP', 'PG', 'MCD', 'SBUX', 'CMG', 'XOM', 'CVX', 'COP', 'OXY',
      'PFE', 'MRNA', 'JNJ', 'UNH', 'ABBV', 'MRK', 'LLY', 'BMY', 'AMGN', 'GILD',
      'CRM', 'ADBE', 'ORCL', 'IBM', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'MU', 'NOW',
      'WDAY', 'SNOW', 'PLTR', 'CRWD', 'DDOG', 'ZS', 'NET', 'RIVN', 'LCID', 'NIO',
      'F', 'GM', 'SNAP', 'PINS', 'SPOT', 'ROKU', 'RBLX', 'U', 'GME', 'AMC',
      'BB', 'MARA', 'RIOT', 'MSTR', 'DAL', 'UAL', 'AAL', 'LUV', 'CAT', 'DE',
      'MMM', 'HON', 'LMT', 'RTX', 'GE', 'T', 'VZ', 'TMUS', 'CMCSA', 'ASML',
      'TSM', 'AMAT', 'LRCX', 'KLAC', 'MRVL', 'ON', 'UBER', 'LYFT', 'DASH', 'ABNB',
      'BKNG', 'EXPE', 'Z', 'SQ', 'SPY', 'QQQ', 'IWM', 'BTC', 'ETH', 'SOL',
      'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'MATIC', 'ZM', 'SHOP', 'SQ',
    ];
    
    for (const ticker of popularTickers) {
      validTickers.add(ticker);
    }
    
    // Add from assets table
    const { data: assets } = await supabase
      .from('assets')
      .select('ticker')
      .limit(500);
    
    if (assets) {
      for (const asset of assets) {
        validTickers.add(asset.ticker.toUpperCase());
      }
    }
    
    // Add watchlist items
    const { data: watchlistItems } = await supabase
      .from('watchlist')
      .select('ticker')
      .limit(200);
    
    if (watchlistItems) {
      for (const item of watchlistItems) {
        validTickers.add(item.ticker.toUpperCase());
      }
    }
    
    console.log(`Loaded ${validTickers.size} tickers for matching`);

    const allArticles: Array<{
      ticker: string;
      headline: string;
      summary: string | null;
      source: string;
      url: string;
      published_at: string | null;
      checksum: string;
      relevance_score: number;
    }> = [];

    let feedsProcessed = 0;
    let feedsFailed = 0;
    let totalItemsParsed = 0;
    
    // Process ALL feeds each run
    for (const feed of RSS_FEEDS) {
      try {
        console.log(`Fetching ${feed.name}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/2.0)' },
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
        totalItemsParsed += items.length;
        feedsProcessed++;
        
        // Process items
        for (const item of items) {
          const fullText = `${item.title} ${item.description || ''}`;
          const tickers = extractTickers(fullText, validTickers);
          
          for (const ticker of tickers) {
            const checksum = await generateChecksum({
              ticker,
              headline: item.title,
              source: item.source,
            });
            
            allArticles.push({
              ticker,
              headline: item.title.substring(0, 500),
              summary: item.description?.substring(0, 500) || null,
              source: item.source,
              url: item.link,
              published_at: safeParseDate(item.pubDate),
              checksum,
              relevance_score: 0.7,
            });
          }
        }
        
      } catch (e) {
        console.error(`Error: ${feed.name}:`, e);
        feedsFailed++;
      }
    }

    console.log(`Feeds: ${feedsProcessed} ok, ${feedsFailed} failed`);
    console.log(`Total items parsed: ${totalItemsParsed}`);
    console.log(`Articles with tickers: ${allArticles.length}`);

    // Deduplicate by checksum
    const uniqueArticles = Array.from(
      new Map(allArticles.map(a => [a.checksum, a])).values()
    );
    console.log(`Unique articles: ${uniqueArticles.length}`);

    // Insert articles in batches
    let inserted = 0;
    const insertBatchSize = 50;
    
    for (let i = 0; i < uniqueArticles.length; i += insertBatchSize) {
      const batch = uniqueArticles.slice(i, i + insertBatchSize);
      
      const { error } = await supabase
        .from('news_rss_articles')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true });
      
      if (!error) {
        inserted += batch.length;
      } else {
        console.error(`Batch insert error:`, error.message);
      }
    }

    // Update sentiment aggregates
    const tickerCounts = new Map<string, number>();
    for (const article of uniqueArticles) {
      tickerCounts.set(article.ticker, (tickerCounts.get(article.ticker) || 0) + 1);
    }

    const today = new Date().toISOString().split('T')[0];
    for (const [ticker, count] of tickerCounts) {
      await supabase
        .from('news_sentiment_aggregate')
        .upsert({
          ticker,
          date: today,
          total_articles: count,
          positive_articles: 0,
          negative_articles: 0,
          neutral_articles: count,
          sentiment_score: 0,
          sentiment_label: 'neutral',
        }, { onConflict: 'ticker,date', ignoreDuplicates: false });
    }

    const duration = Date.now() - startTime;
    console.log(`✅ RSS ingestion complete: ${inserted} inserted, ${tickerCounts.size} tickers in ${duration}ms`);

    await logHeartbeat(supabase, {
      function_name: 'ingest-news-rss',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: uniqueArticles.length - inserted,
      duration_ms: duration,
      source_used: 'RSS Feeds',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-news-rss',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: uniqueArticles.length - inserted,
      duration: duration,
      sourceUsed: 'RSS Feeds',
    });

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        unique_articles: uniqueArticles.length,
        tickers_matched: tickerCounts.size,
        feeds_processed: feedsProcessed,
        feeds_failed: feedsFailed,
        total_items_parsed: totalItemsParsed,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-news-rss',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'RSS Feeds',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-news-rss',
      message: `RSS ingestion failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
