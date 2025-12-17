import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// RSS feed sources for financial news
const RSS_FEEDS = [
  { name: 'Yahoo Finance', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline', type: 'yahoo' },
  { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', type: 'marketwatch' },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', type: 'cnbc' },
  { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance', type: 'reuters' },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', type: 'seekingalpha' },
];

// Common ticker patterns to extract from headlines
const TICKER_PATTERNS = [
  /\$([A-Z]{1,5})\b/g,  // $AAPL format
  /\(([A-Z]{1,5})\)/g,  // (AAPL) format
  /\b([A-Z]{2,5}):\s/g, // AAPL: format
];

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
  
  for (const pattern of TICKER_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const ticker = match[1].toUpperCase();
      if (validTickers.has(ticker)) {
        tickers.add(ticker);
      }
    }
  }
  
  // Also check for company names and map to tickers
  const companyMappings: Record<string, string> = {
    'Apple': 'AAPL', 'Microsoft': 'MSFT', 'Google': 'GOOGL', 'Amazon': 'AMZN',
    'Tesla': 'TSLA', 'Meta': 'META', 'Facebook': 'META', 'Netflix': 'NFLX',
    'Nvidia': 'NVDA', 'AMD': 'AMD', 'Intel': 'INTC', 'Disney': 'DIS',
    'Boeing': 'BA', 'Nike': 'NKE', 'Coca-Cola': 'KO', 'Pepsi': 'PEP',
    'JPMorgan': 'JPM', 'Goldman Sachs': 'GS', 'Morgan Stanley': 'MS',
    'Walmart': 'WMT', 'Target': 'TGT', 'Costco': 'COST',
    'Exxon': 'XOM', 'Chevron': 'CVX', 'Shell': 'SHEL',
    'Pfizer': 'PFE', 'Moderna': 'MRNA', 'Johnson & Johnson': 'JNJ',
  };
  
  for (const [company, ticker] of Object.entries(companyMappings)) {
    if (text.toLowerCase().includes(company.toLowerCase()) && validTickers.has(ticker)) {
      tickers.add(ticker);
    }
  }
  
  return Array.from(tickers);
}

function parseRSSXml(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Simple XML parsing for RSS items
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
  
  // Batch analyze up to 20 headlines at a time
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
        
        // Extract JSON from response
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
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

  try {
    // Get valid tickers from assets table
    const { data: assets } = await supabase
      .from('assets')
      .select('ticker')
      .limit(30000);
    
    const validTickers = new Set((assets || []).map(a => a.ticker.toUpperCase()));
    console.log(`Loaded ${validTickers.size} valid tickers`);

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
    for (const feed of RSS_FEEDS) {
      try {
        console.log(`Fetching ${feed.name}...`);
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' }
        });
        
        if (!response.ok) {
          console.log(`Failed to fetch ${feed.name}: ${response.status}`);
          continue;
        }
        
        const xml = await response.text();
        const items = parseRSSXml(xml, feed.name);
        console.log(`Parsed ${items.length} items from ${feed.name}`);
        
        for (const item of items) {
          const tickers = extractTickers(item.title + ' ' + (item.description || ''), validTickers);
          
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
      }
    }

    console.log(`Total articles with tickers: ${allArticles.length}`);

    // Deduplicate by checksum
    const uniqueArticles = Array.from(
      new Map(allArticles.map(a => [a.checksum, a])).values()
    );

    // Analyze sentiment using Lovable AI
    let sentimentResults = new Map<string, { score: number; label: string }>();
    if (lovableApiKey && uniqueArticles.length > 0) {
      const headlinesForAnalysis = uniqueArticles.map(a => ({
        headline: a.headline,
        ticker: a.ticker
      }));
      sentimentResults = await analyzeSentiment(headlinesForAnalysis, lovableApiKey);
    }

    // Insert articles
    let inserted = 0;
    let skipped = 0;
    
    for (const article of uniqueArticles) {
      const sentiment = sentimentResults.get(article.headline);
      
      const { error } = await supabase
        .from('news_rss_articles')
        .upsert({
          ...article,
          sentiment_score: sentiment?.score || null,
          sentiment_label: sentiment?.label || null,
          relevance_score: 0.7, // Default relevance
        }, { onConflict: 'checksum' });
      
      if (error) {
        if (error.code === '23505') {
          skipped++;
        } else {
          console.error('Insert error:', error);
        }
      } else {
        inserted++;
      }
    }

    // Also update news_sentiment_aggregate for tickers we processed
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
    await supabase.from('ingest_logs').insert({
      etl_name: 'ingest-news-rss',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round(duration / 1000),
      rows_inserted: inserted,
      rows_skipped: skipped,
      source_used: 'RSS Feeds',
      metadata: {
        feeds_processed: RSS_FEEDS.length,
        unique_tickers: tickerCounts.size,
        total_articles: uniqueArticles.length,
      }
    });

    return new Response(JSON.stringify({
      success: true,
      inserted,
      skipped,
      unique_tickers: tickerCounts.size,
      total_articles: uniqueArticles.length,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in ingest-news-rss:', error);
    
    await supabase.from('ingest_logs').insert({
      etl_name: 'ingest-news-rss',
      status: 'error',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
      source_used: 'RSS Feeds',
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
