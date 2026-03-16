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

// High-volume financial news RSS feeds
const NEWS_RSS_FEEDS = [
  // Primary news sources - high reliability
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline', priority: 1 },
  { name: 'MarketWatch Top Stories', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', priority: 1 },
  { name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', priority: 1 },
  
  // Tech and market news
  { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', priority: 1 },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', priority: 2 },
  { name: 'Benzinga', url: 'https://www.benzinga.com/feed/', priority: 2 },
  
  // Sector-specific
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', priority: 2 },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', priority: 2 },
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
// FIX: Added negation handling to correctly score "not rising", "no profit", "failed to beat", etc.
const NEGATION_WORDS = ['not', 'no', 'never', "didn't", "doesn't", "won't", "can't", 'cannot', 'failed to', 'unable to'];

function isNegated(text: string, wordIndex: number, windowSize = 5): boolean {
  // Check if any negation word appears in the window of words before the target word
  const words = text.split(/\s+/);
  const start = Math.max(0, wordIndex - windowSize);
  const contextWords = words.slice(start, wordIndex);
  return NEGATION_WORDS.some(neg => contextWords.join(' ').includes(neg));
}

function calculateKeywordSentiment(text: string): number {
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);
  let score = 0;
  
  const positiveWords = ['surge', 'soar', 'rally', 'gain', 'jump', 'rise', 'boost', 'record', 'beat', 'outperform', 'upgrade', 'bullish', 'growth', 'profit'];
  const negativeWords = ['crash', 'plunge', 'drop', 'fall', 'decline', 'slump', 'loss', 'miss', 'downgrade', 'bearish', 'warning', 'concern', 'risk', 'cut'];
  
  for (const word of positiveWords) {
    const idx = words.findIndex(w => w.startsWith(word));
    if (idx !== -1) {
      // FIX: Invert sentiment if negated ("not rally" → negative)
      score += isNegated(textLower, idx) ? -0.15 : 0.15;
    }
  }
  for (const word of negativeWords) {
    const idx = words.findIndex(w => w.startsWith(word));
    if (idx !== -1) {
      // FIX: Invert sentiment if negated ("not falling" → positive)
      score += isNegated(textLower, idx) ? 0.15 : -0.15;
    }
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
    
    // Process all feeds (fast RSS parsing)
    for (const feed of NEWS_RSS_FEEDS) {
      try {
        console.log(`Fetching ${feed.name}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout
        
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/2.0)' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.log(`Feed failed: ${feed.name} (${response.status})`);
          feedsFailed++;
          continue;
        }
        
        const xml = await response.text();
        const items = parseRSSXml(xml, feed.name);
        console.log(`Parsed ${items.length} items from ${feed.name}`);
        feedsProcessed++;
        
        // Process items
        for (const item of items) {
          // Skip duplicates
          if (item.link && seenUrls.has(item.link)) continue;
          if (item.link) seenUrls.add(item.link);
          
          const fullText = `${item.title} ${item.description || ''}`;
          const tickers = extractTickers(fullText, validTickers);
          
          // Create news entry for each matched ticker
          for (const ticker of tickers) {
            const sentiment = calculateKeywordSentiment(fullText);
            
            allNews.push({
              ticker,
              headline: item.title.substring(0, 500),
              summary: item.description?.substring(0, 1000) || null,
              source: item.source,
              url: item.link || null,
              published_at: safeParseDate(item.pubDate),
              sentiment_score: sentiment,
              relevance_score: 0.8,
              metadata: { matched_by: 'ticker_extraction' },
            });
          }
        }
        
      } catch (e) {
        console.error(`Error fetching ${feed.name}:`, e);
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
        .insert(batch);
      
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
