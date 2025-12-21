import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v3 - Optimized: limit tickers, rotate feeds, fix date parsing

// RSS feed sources - grouped for rotation
const RSS_FEED_GROUPS = [
  // Group 1 - General financial news (high volume)
  [
    { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline', type: 'general' },
    { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', type: 'general' },
    { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', type: 'general' },
  ],
  // Group 2 - Tech and crypto
  [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'tech' },
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', type: 'crypto' },
    { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', type: 'general' },
  ],
  // Group 3 - Sector specific
  [
    { name: 'Oil Price', url: 'https://oilprice.com/rss/main', type: 'energy' },
    { name: 'FierceBiotech', url: 'https://www.fiercebiotech.com/rss/xml', type: 'healthcare' },
    { name: 'Benzinga', url: 'https://www.benzinga.com/feed/', type: 'general' },
  ],
  // Group 4 - Additional sources
  [
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'tech' },
    { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', type: 'crypto' },
    { name: 'Investor Place', url: 'https://investorplace.com/feed/', type: 'general' },
  ],
];

// Ticker patterns
const TICKER_PATTERNS = [
  /\$([A-Z]{1,5})\b/g,
  /\(([A-Z]{2,5})\)/g,
  /\bNASDAQ:\s*([A-Z]{1,5})\b/gi,
  /\bNYSE:\s*([A-Z]{1,5})\b/gi,
];

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source: string;
}

// Static company mappings (top 100 most mentioned)
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
  'GameStop': 'GME', 'AMC': 'AMC', 'Delta': 'DAL', 'United': 'UAL',
  'Caterpillar': 'CAT', 'Lockheed Martin': 'LMT', 'AT&T': 'T', 'Verizon': 'VZ',
  'ASML': 'ASML', 'Taiwan Semiconductor': 'TSM', 'TSMC': 'TSM', 'Uber': 'UBER',
  'Airbnb': 'ABNB', 'Snowflake': 'SNOW', 'Datadog': 'DDOG', 'Cloudflare': 'NET',
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
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    // Check if date is reasonable (not too old or in future)
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
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    console.log('[v3] Starting optimized RSS news ingestion...');
    
    // Load only top 500 relevant tickers (popular stocks + watchlist items)
    const validTickers = new Set<string>();
    
    // Get popular tickers from recent activity
    const { data: popularAssets } = await supabase
      .from('assets')
      .select('ticker')
      .in('ticker', [
        // Top 100 most traded/mentioned
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
      ]);
    
    if (popularAssets) {
      for (const asset of popularAssets) {
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
    
    // Add any remaining top tickers to reach ~300
    const { data: moreAssets } = await supabase
      .from('assets')
      .select('ticker')
      .limit(300);
    
    if (moreAssets) {
      for (const asset of moreAssets) {
        if (validTickers.size < 500) {
          validTickers.add(asset.ticker.toUpperCase());
        }
      }
    }
    
    console.log(`Loaded ${validTickers.size} tickers for matching`);

    // Rotate through feed groups based on current hour
    const currentHour = new Date().getUTCHours();
    const groupIndex = currentHour % RSS_FEED_GROUPS.length;
    const feedsToProcess = RSS_FEED_GROUPS[groupIndex];
    
    console.log(`Processing feed group ${groupIndex + 1}/${RSS_FEED_GROUPS.length} (${feedsToProcess.length} feeds)`);

    const allArticles: Array<{
      ticker: string;
      headline: string;
      summary: string | null;
      source: string;
      url: string;
      published_at: string | null;
      checksum: string;
    }> = [];

    let feedsProcessed = 0;
    let feedsFailed = 0;
    
    for (const feed of feedsToProcess) {
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
        feedsProcessed++;
        
        // Process items immediately
        for (const item of items) {
          const tickers = extractTickers(item.title + ' ' + (item.description || ''), validTickers);
          
          for (const ticker of tickers) {
            const checksum = await generateChecksum({
              ticker,
              headline: item.title,
              source: item.source,
            });
            
            allArticles.push({
              ticker,
              headline: item.title,
              summary: item.description || null,
              source: item.source,
              url: item.link,
              published_at: safeParseDate(item.pubDate),
              checksum,
            });
          }
        }
        
        // Save incrementally every feed to avoid timeout
        if (allArticles.length >= 50) {
          const batch = allArticles.splice(0, 50).map(article => ({
            ...article,
            relevance_score: 0.7,
          }));
          
          await supabase
            .from('news_rss_articles')
            .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true });
        }
        
      } catch (e) {
        console.error(`Error: ${feed.name}:`, e);
        feedsFailed++;
      }
    }

    console.log(`Feeds: ${feedsProcessed} ok, ${feedsFailed} failed`);
    console.log(`Remaining articles: ${allArticles.length}`);

    // Deduplicate remaining
    const uniqueArticles = Array.from(
      new Map(allArticles.map(a => [a.checksum, a])).values()
    );

    // Insert remaining articles
    let inserted = 0;
    const insertBatchSize = 50;
    for (let i = 0; i < uniqueArticles.length; i += insertBatchSize) {
      const batch = uniqueArticles.slice(i, i + insertBatchSize).map(article => ({
        ...article,
        relevance_score: 0.7,
      }));
      
      const { error } = await supabase
        .from('news_rss_articles')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true });
      
      if (!error) {
        inserted += batch.length;
      }
    }

    // Update sentiment aggregate for tickers
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

    await logHeartbeat(supabase, {
      function_name: 'ingest-news-rss',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: `RSS Group ${groupIndex + 1}`,
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-news-rss',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: 0,
      duration: duration,
      sourceUsed: `RSS Group ${groupIndex + 1}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        tickers_matched: tickerCounts.size,
        feeds_processed: feedsProcessed,
        feeds_failed: feedsFailed,
        group: groupIndex + 1,
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
