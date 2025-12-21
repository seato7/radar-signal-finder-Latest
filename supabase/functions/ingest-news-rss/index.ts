import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v2 - Enhanced RSS feeds with sector-specific sources and dynamic ticker loading

// Expanded RSS feed sources for financial news - sector-specific
const RSS_FEEDS = [
  // General financial news
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline', type: 'general' },
  { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', type: 'general' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', type: 'general' },
  { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance', type: 'general' },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', type: 'general' },
  
  // Technology sector
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'tech' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'tech' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', type: 'tech' },
  
  // Crypto
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', type: 'crypto' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', type: 'crypto' },
  
  // Energy sector
  { name: 'Oil Price', url: 'https://oilprice.com/rss/main', type: 'energy' },
  
  // Healthcare/Biotech
  { name: 'FierceBiotech', url: 'https://www.fiercebiotech.com/rss/xml', type: 'healthcare' },
  
  // Additional financial sources
  { name: 'Benzinga', url: 'https://www.benzinga.com/feed/', type: 'general' },
  { name: 'Investor Place', url: 'https://investorplace.com/feed/', type: 'general' },
];

// Enhanced ticker patterns
const TICKER_PATTERNS = [
  /\$([A-Z]{1,5})\b/g,           // $AAPL format
  /\(([A-Z]{1,5})\)/g,           // (AAPL) format
  /\b([A-Z]{2,5}):\s/g,          // AAPL: format
  /\bNASDAQ:\s*([A-Z]{1,5})\b/gi,  // NASDAQ: AAPL format
  /\bNYSE:\s*([A-Z]{1,5})\b/gi,    // NYSE: AAPL format
  /stock\s+([A-Z]{2,5})\b/gi,      // stock AAPL format
  /shares\s+of\s+([A-Z]{2,5})\b/gi, // shares of AAPL format
];

interface RSSItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  source: string;
}

// Expanded company name to ticker mappings (200+ companies)
const COMPANY_MAPPINGS: Record<string, string> = {
  // Mega caps
  'Apple': 'AAPL', 'Microsoft': 'MSFT', 'Google': 'GOOGL', 'Alphabet': 'GOOGL', 'Amazon': 'AMZN',
  'Tesla': 'TSLA', 'Meta': 'META', 'Facebook': 'META', 'Netflix': 'NFLX', 'Nvidia': 'NVDA',
  'AMD': 'AMD', 'Intel': 'INTC', 'Disney': 'DIS', 'Boeing': 'BA', 'Nike': 'NKE',
  
  // Financials
  'JPMorgan': 'JPM', 'Goldman Sachs': 'GS', 'Morgan Stanley': 'MS', 'Bank of America': 'BAC',
  'Wells Fargo': 'WFC', 'Citigroup': 'C', 'Visa': 'V', 'Mastercard': 'MA', 'PayPal': 'PYPL',
  'Square': 'SQ', 'Block': 'SQ', 'Coinbase': 'COIN', 'Robinhood': 'HOOD',
  
  // Retail
  'Walmart': 'WMT', 'Target': 'TGT', 'Costco': 'COST', 'Home Depot': 'HD', "Lowe's": 'LOW',
  'CVS': 'CVS', 'Walgreens': 'WBA', 'Kroger': 'KR', 'Dollar General': 'DG',
  
  // Consumer goods
  'Coca-Cola': 'KO', 'Pepsi': 'PEP', 'PepsiCo': 'PEP', 'Procter & Gamble': 'PG', "McDonald's": 'MCD',
  'Starbucks': 'SBUX', 'Chipotle': 'CMG', 'Domino': 'DPZ',
  
  // Energy
  'Exxon': 'XOM', 'ExxonMobil': 'XOM', 'Chevron': 'CVX', 'Shell': 'SHEL', 'BP': 'BP',
  'ConocoPhillips': 'COP', 'Schlumberger': 'SLB', 'Occidental': 'OXY', 'Devon Energy': 'DVN',
  
  // Healthcare/Pharma
  'Pfizer': 'PFE', 'Moderna': 'MRNA', 'Johnson & Johnson': 'JNJ', 'UnitedHealth': 'UNH',
  'CVS Health': 'CVS', 'AbbVie': 'ABBV', 'Merck': 'MRK', 'Eli Lilly': 'LLY', 'Bristol-Myers': 'BMY',
  'Amgen': 'AMGN', 'Gilead': 'GILD', 'Regeneron': 'REGN', 'Vertex': 'VRTX',
  
  // Tech companies
  'Salesforce': 'CRM', 'Adobe': 'ADBE', 'Oracle': 'ORCL', 'IBM': 'IBM', 'Cisco': 'CSCO',
  'Qualcomm': 'QCOM', 'Broadcom': 'AVGO', 'Texas Instruments': 'TXN', 'Micron': 'MU',
  'ServiceNow': 'NOW', 'Workday': 'WDAY', 'Snowflake': 'SNOW', 'Palantir': 'PLTR',
  'CrowdStrike': 'CRWD', 'Datadog': 'DDOG', 'Zscaler': 'ZS', 'Cloudflare': 'NET',
  
  // EVs and Auto
  'Rivian': 'RIVN', 'Lucid': 'LCID', 'NIO': 'NIO', 'Ford': 'F', 'GM': 'GM', 'General Motors': 'GM',
  
  // Social/Media
  'Snap': 'SNAP', 'Snapchat': 'SNAP', 'Pinterest': 'PINS', 'Twitter': 'X', 'Reddit': 'RDDT',
  'Spotify': 'SPOT', 'Roku': 'ROKU', 'Roblox': 'RBLX', 'Unity': 'U',
  
  // Meme stocks
  'GameStop': 'GME', 'AMC': 'AMC', 'Bed Bath': 'BBBY', 'BlackBerry': 'BB',
  
  // Crypto-related
  'Marathon Digital': 'MARA', 'Riot Platforms': 'RIOT', 'MicroStrategy': 'MSTR',
  
  // Airlines
  'Delta': 'DAL', 'United': 'UAL', 'American Airlines': 'AAL', 'Southwest': 'LUV',
  
  // Industrials
  'Caterpillar': 'CAT', 'Deere': 'DE', 'John Deere': 'DE', '3M': 'MMM', 'Honeywell': 'HON',
  'Lockheed Martin': 'LMT', 'Raytheon': 'RTX', 'General Electric': 'GE', 'GE': 'GE',
  
  // Communications
  'AT&T': 'T', 'Verizon': 'VZ', 'T-Mobile': 'TMUS', 'Comcast': 'CMCSA',
  
  // Semiconductors
  'ASML': 'ASML', 'Taiwan Semiconductor': 'TSM', 'TSMC': 'TSM', 'Applied Materials': 'AMAT',
  'Lam Research': 'LRCX', 'KLA': 'KLAC', 'Marvell': 'MRVL', 'ON Semiconductor': 'ON',
  
  // E-commerce/Travel
  'Uber': 'UBER', 'Lyft': 'LYFT', 'DoorDash': 'DASH', 'Airbnb': 'ABNB', 'Booking': 'BKNG',
  'Expedia': 'EXPE', 'Zillow': 'Z', 'Redfin': 'RDFN',
  
  // ETFs
  'SPY': 'SPY', 'QQQ': 'QQQ', 'IWM': 'IWM', 'DIA': 'DIA',
};

async function generateChecksum(data: Record<string, unknown>): Promise<string> {
  const content = JSON.stringify(data, Object.keys(data).sort());
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function extractTickers(text: string, validTickers: Set<string>, companyToTicker: Map<string, string>): string[] {
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
  
  // Company name mapping (check database mappings first, then fallback to static)
  const textLower = text.toLowerCase();
  
  // Check dynamic mappings from database
  for (const [company, ticker] of companyToTicker) {
    if (textLower.includes(company.toLowerCase()) && validTickers.has(ticker)) {
      tickers.add(ticker);
    }
  }
  
  // Static mappings fallback
  for (const [company, ticker] of Object.entries(COMPANY_MAPPINGS)) {
    if (textLower.includes(company.toLowerCase()) && validTickers.has(ticker)) {
      tickers.add(ticker);
    }
  }
  
  return Array.from(tickers);
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

async function analyzeSentiment(
  headlines: { headline: string; ticker: string }[],
  lovableApiKey: string
): Promise<Map<string, { score: number; label: string }>> {
  const results = new Map<string, { score: number; label: string }>();
  
  if (headlines.length === 0) return results;
  
  const batchSize = 20;
  const batches = [];
  for (let i = 0; i < headlines.length; i += batchSize) {
    batches.push(headlines.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    try {
      const prompt = `Analyze the sentiment of these financial news headlines. Return a JSON array with objects containing "index", "score" (-1 to 1), and "label" (bullish/bearish/neutral).

Headlines:
${batch.map((h, i) => `${i}. [${h.ticker}] ${h.headline}`).join('\n')}

Return ONLY valid JSON array, no other text.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a financial sentiment analyzer. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const sentiments = JSON.parse(jsonMatch[0]);
          for (const s of sentiments) {
            if (typeof s.index === 'number' && batch[s.index]) {
              results.set(batch[s.index].headline, {
                score: s.score || 0,
                label: s.label || 'neutral'
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Sentiment analysis error:', e);
    }
  }
  
  return results;
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
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

  try {
    console.log('[v2] Starting enhanced RSS news ingestion with dynamic ticker scanning...');
    
    // Load ALL valid tickers from database with pagination
    const validTickers = new Set<string>();
    const companyToTicker = new Map<string, string>();
    
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data: assets, error } = await supabase
        .from('assets')
        .select('ticker, name')
        .range(offset, offset + batchSize - 1);
      
      if (error) throw error;
      if (!assets || assets.length === 0) break;
      
      for (const asset of assets) {
        validTickers.add(asset.ticker.toUpperCase());
        // Create company name -> ticker mapping
        if (asset.name) {
          companyToTicker.set(asset.name, asset.ticker.toUpperCase());
          // Also add shortened versions (e.g., "Apple Inc" -> "Apple")
          const shortName = asset.name.split(/\s+(Inc|Corp|LLC|Ltd|Co\.|Company)/i)[0];
          if (shortName && shortName.length > 2) {
            companyToTicker.set(shortName, asset.ticker.toUpperCase());
          }
        }
      }
      
      if (assets.length < batchSize) break;
      offset += batchSize;
    }
    
    console.log(`Loaded ${validTickers.size} valid tickers, ${companyToTicker.size} company name mappings`);

    const allArticles: Array<{
      ticker: string;
      headline: string;
      summary: string | null;
      source: string;
      url: string;
      published_at: string | null;
      checksum: string;
    }> = [];

    // Fetch and parse each RSS feed
    let feedsProcessed = 0;
    let feedsFailed = 0;
    
    for (const feed of RSS_FEEDS) {
      try {
        console.log(`Fetching ${feed.name}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/2.0)' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.log(`Failed to fetch ${feed.name}: ${response.status}`);
          feedsFailed++;
          continue;
        }
        
        const xml = await response.text();
        const items = parseRSSXml(xml, feed.name);
        console.log(`Parsed ${items.length} items from ${feed.name}`);
        feedsProcessed++;
        
        for (const item of items) {
          const tickers = extractTickers(item.title + ' ' + (item.description || ''), validTickers, companyToTicker);
          
          for (const ticker of tickers) {
            const checksum = await generateChecksum({
              ticker,
              headline: item.title,
              source: item.source,
              url: item.link,
            });
            
            allArticles.push({
              ticker,
              headline: item.title,
              summary: item.description || null,
              source: item.source,
              url: item.link,
              published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
              checksum,
            });
          }
        }
      } catch (e) {
        console.error(`Error processing ${feed.name}:`, e);
        feedsFailed++;
      }
    }

    console.log(`Total articles with tickers: ${allArticles.length}`);
    console.log(`Feeds processed: ${feedsProcessed}/${RSS_FEEDS.length}, failed: ${feedsFailed}`);

    // Deduplicate by checksum
    const uniqueArticles = Array.from(
      new Map(allArticles.map(a => [a.checksum, a])).values()
    );

    // Analyze sentiment
    let sentimentResults = new Map<string, { score: number; label: string }>();
    if (lovableApiKey && uniqueArticles.length > 0) {
      const headlinesForAnalysis = uniqueArticles.slice(0, 100).map(a => ({
        headline: a.headline,
        ticker: a.ticker
      }));
      sentimentResults = await analyzeSentiment(headlinesForAnalysis, lovableApiKey);
    }

    // Batch insert articles
    let inserted = 0;
    let skipped = 0;
    
    const insertBatchSize = 100;
    for (let i = 0; i < uniqueArticles.length; i += insertBatchSize) {
      const batch = uniqueArticles.slice(i, i + insertBatchSize).map(article => ({
        ...article,
        sentiment_score: sentimentResults.get(article.headline)?.score || null,
        sentiment_label: sentimentResults.get(article.headline)?.label || null,
        relevance_score: 0.7,
      }));
      
      const { error, count } = await supabase
        .from('news_rss_articles')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true });
      
      if (error) {
        console.error('Batch insert error:', error);
        skipped += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    // Update news_sentiment_aggregate
    const tickerCounts = new Map<string, { positive: number; negative: number; neutral: number; total: number }>();
    for (const article of uniqueArticles) {
      const current = tickerCounts.get(article.ticker) || { positive: 0, negative: 0, neutral: 0, total: 0 };
      current.total++;
      const sentiment = sentimentResults.get(article.headline);
      if (sentiment?.label === 'bullish') current.positive++;
      else if (sentiment?.label === 'bearish') current.negative++;
      else current.neutral++;
      tickerCounts.set(article.ticker, current);
    }

    const today = new Date().toISOString().split('T')[0];
    for (const [ticker, counts] of tickerCounts) {
      await supabase
        .from('news_sentiment_aggregate')
        .upsert({
          ticker,
          date: today,
          total_articles: counts.total,
          positive_articles: counts.positive,
          negative_articles: counts.negative,
          neutral_articles: counts.neutral,
          sentiment_score: counts.total > 0 ? (counts.positive - counts.negative) / counts.total : 0,
          sentiment_label: counts.positive > counts.negative ? 'bullish' : counts.negative > counts.positive ? 'bearish' : 'neutral',
        }, { onConflict: 'ticker,date', ignoreDuplicates: false });
    }

    const duration = Date.now() - startTime;

    // Log ingestion
    await logHeartbeat(supabase, {
      function_name: 'ingest-news-rss',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: duration,
      source_used: 'RSS Feeds Enhanced',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-news-rss',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: skipped,
      duration: duration,
      sourceUsed: 'RSS Feeds Enhanced',
    });

    return new Response(JSON.stringify({
      success: true,
      inserted,
      skipped,
      unique_tickers: tickerCounts.size,
      total_articles: uniqueArticles.length,
      feeds_processed: feedsProcessed,
      feeds_failed: feedsFailed,
      duration_ms: duration,
      version: 'v2_dynamic_scanning',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in ingest-news-rss:', error);
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-news-rss',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'RSS Feeds Enhanced',
      error_message: errorMessage,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-news-rss',
      message: `RSS news ingestion failed: ${errorMessage}`,
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
