import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { redisCache } from "../_shared/redis-cache.ts";
import { withRetry } from "../_shared/retry-wrapper.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const validateSentiment = (score: number): number => {
  if (isNaN(score) || !isFinite(score)) return 0;
  return Math.max(-1, Math.min(1, score));
};

const sanitizeTicker = (ticker: string): string => {
  return ticker.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
};

interface Asset {
  ticker: string;
  name: string;
  asset_class: string;
  metadata: {
    industry?: string;
    sector?: string;
    country?: string;
    type?: string;
  } | null;
}

interface NewsHeadline {
  headline: string;
  summary: string;
  source: string;
  sentiment: number;
  tickers_mentioned: string[];
  companies_mentioned: string[];
  sectors_mentioned: string[];
}

// Build search terms for each asset for matching
function buildAssetSearchTerms(asset: Asset): string[] {
  const terms: string[] = [];
  
  // Ticker symbol (exact match)
  terms.push(asset.ticker.toUpperCase());
  
  // Company name and variations
  if (asset.name) {
    terms.push(asset.name.toLowerCase());
    // Add significant words from company name (>3 chars, not common words)
    const commonWords = ['inc', 'corp', 'ltd', 'llc', 'company', 'the', 'and', 'etf', 'fund', 'trust', 'class'];
    const nameWords = asset.name.toLowerCase().split(/\s+/)
      .filter(w => w.length > 3 && !commonWords.includes(w));
    terms.push(...nameWords);
  }
  
  // Sector and industry keywords
  if (asset.metadata?.sector) {
    terms.push(asset.metadata.sector.toLowerCase());
  }
  if (asset.metadata?.industry) {
    terms.push(asset.metadata.industry.toLowerCase());
  }
  
  return terms.filter(t => t.length > 0);
}

// Match a headline to assets based on content
function matchHeadlineToAssets(
  headline: NewsHeadline, 
  assets: Asset[]
): Asset[] {
  const matchedAssets: Asset[] = [];
  const headlineText = `${headline.headline} ${headline.summary}`.toLowerCase();
  const mentionedTickers = headline.tickers_mentioned.map(t => t.toUpperCase());
  const mentionedCompanies = headline.companies_mentioned.map(c => c.toLowerCase());
  const mentionedSectors = headline.sectors_mentioned.map(s => s.toLowerCase());
  
  for (const asset of assets) {
    let score = 0;
    
    // Direct ticker mention (highest priority)
    if (mentionedTickers.includes(asset.ticker.toUpperCase())) {
      score += 100;
    }
    
    // Ticker appears in headline text
    const tickerRegex = new RegExp(`\\b${asset.ticker}\\b`, 'i');
    if (tickerRegex.test(headlineText)) {
      score += 80;
    }
    
    // Company name mentioned
    if (asset.name) {
      const nameWords = asset.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const significantMatches = nameWords.filter(word => 
        mentionedCompanies.some(c => c.includes(word)) || headlineText.includes(word)
      );
      if (significantMatches.length >= 2 || (nameWords.length === 1 && significantMatches.length === 1)) {
        score += 60;
      }
    }
    
    // Sector/industry match (lower priority - broad matching)
    if (asset.metadata?.sector && mentionedSectors.some(s => 
      s.includes(asset.metadata!.sector!.toLowerCase()) || 
      asset.metadata!.sector!.toLowerCase().includes(s)
    )) {
      score += 20;
    }
    if (asset.metadata?.industry && mentionedSectors.some(s => 
      s.includes(asset.metadata!.industry!.toLowerCase()) || 
      asset.metadata!.industry!.toLowerCase().includes(s)
    )) {
      score += 15;
    }
    
    // Only include if score > 50 (direct ticker or strong company match)
    if (score >= 50) {
      matchedAssets.push(asset);
    }
  }
  
  return matchedAssets;
}

// Fetch general market headlines (1 API call)
async function fetchMarketHeadlines(
  perplexityKey: string, 
  supabase: any
): Promise<NewsHeadline[]> {
  const headers = {
    'Authorization': `Bearer ${perplexityKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'InsiderPulseBot/1.0'
  };
  
  const payload = {
    model: 'sonar',
    messages: [
      {
        role: 'system',
        content: `You are a financial news aggregator. Return structured data about recent market news.
For each news item, extract:
- The headline
- A brief summary
- The source
- Sentiment score (-1 to 1)
- Any ticker symbols mentioned
- Any company names mentioned
- Any sectors/industries mentioned`
      },
      {
        role: 'user',
        content: `List the 15 most important financial market news headlines from the last 24 hours.
Include news about stocks, crypto, ETFs, commodities, and major market movements.

For EACH headline, provide this EXACT format:
HEADLINE: [the headline]
SUMMARY: [one sentence summary]
SOURCE: [news source name]
SENTIMENT: [number from -1 to 1]
TICKERS: [comma-separated list of any stock/crypto tickers mentioned, or "none"]
COMPANIES: [comma-separated list of company names mentioned]
SECTORS: [comma-separated list of sectors/industries mentioned, e.g. "technology, healthcare, energy"]
---

Separate each news item with "---".`
      }
    ],
    temperature: 0.2,
    max_tokens: 4000,
  };
  
  const result = await withRetry(
    async () => {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      
      const contentType = response.headers.get('content-type');
      const responseText = await response.text();
      
      if (contentType?.includes('text/html') || responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        console.log('⚠️ Rate limit HTML page received - will retry');
        throw new Error('RATE_LIMIT_HTML');
      }
      
      if (response.status === 401) {
        throw new Error('AUTH_ERROR');
      }
      
      if (response.status === 429) {
        throw new Error('RATE_LIMIT_429');
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = JSON.parse(responseText);
      return { response, data };
    },
    {
      maxRetries: 5,
      initialDelayMs: 2000,
      maxDelayMs: 30000,
      onRetry: (attempt, error) => {
        console.log(`⏳ Retry ${attempt}/5: ${error.message}`);
      }
    }
  );
  
  const content = result.data.choices?.[0]?.message?.content || '';
  const headlines: NewsHeadline[] = [];
  
  const newsBlocks = content.split('---').filter((block: string) => block.trim());
  
  for (const block of newsBlocks) {
    const headlineMatch = block.match(/HEADLINE:\s*(.+?)(?=SUMMARY:|$)/s);
    const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=SOURCE:|$)/s);
    const sourceMatch = block.match(/SOURCE:\s*(.+?)(?=SENTIMENT:|$)/s);
    const sentimentMatch = block.match(/SENTIMENT:\s*(-?\d+\.?\d*)/);
    const tickersMatch = block.match(/TICKERS:\s*(.+?)(?=COMPANIES:|$)/s);
    const companiesMatch = block.match(/COMPANIES:\s*(.+?)(?=SECTORS:|$)/s);
    const sectorsMatch = block.match(/SECTORS:\s*(.+?)(?=---|$)/s);
    
    if (headlineMatch) {
      const tickersRaw = tickersMatch?.[1]?.trim() || '';
      const companiesRaw = companiesMatch?.[1]?.trim() || '';
      const sectorsRaw = sectorsMatch?.[1]?.trim() || '';
      
      headlines.push({
        headline: headlineMatch[1].trim(),
        summary: summaryMatch?.[1]?.trim() || '',
        source: sourceMatch?.[1]?.trim() || 'Perplexity',
        sentiment: sentimentMatch ? validateSentiment(parseFloat(sentimentMatch[1])) : 0,
        tickers_mentioned: tickersRaw.toLowerCase() === 'none' ? [] : 
          tickersRaw.split(',').map(t => t.trim().toUpperCase()).filter(t => t.length > 0 && t.length <= 6),
        companies_mentioned: companiesRaw.split(',').map(c => c.trim()).filter(c => c.length > 0),
        sectors_mentioned: sectorsRaw.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0),
      });
    }
  }
  
  console.log(`📰 Parsed ${headlines.length} headlines from Perplexity`);
  return headlines;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const slackAlerter = new SlackAlerter();

  const logId = crypto.randomUUID();
  await supabase.from('ingest_logs').insert({
    id: logId,
    etl_name: 'ingest-breaking-news',
    status: 'running',
    started_at: new Date().toISOString(),
    source_used: 'Perplexity API',
    cache_hit: false,
    fallback_count: 0,
    latency_ms: 0,
  });

  try {
    console.log('Starting efficient breaking news ingestion (scrape once, map to all tickers)...');
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    // Fetch ALL assets with metadata for matching
    const { data: allAssets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, asset_class, metadata')
      .in('asset_class', ['stock', 'crypto', 'etf', 'forex', 'commodity']);
    
    if (assetsError) throw assetsError;
    const assets: Asset[] = allAssets || [];
    console.log(`📊 Loaded ${assets.length} assets for matching`);
    
    let newsItems: any[] = [];
    let sourceUsed = 'Perplexity API';
    let cacheHit = false;
    let fallbackUsed = false;
    const fetchStartTime = Date.now();
    
    // Check cache first
    const cacheResult = await redisCache.get('breaking-news:global');
    if (cacheResult.hit && cacheResult.data) {
      console.log(`✅ Cache HIT for breaking-news:global (${cacheResult.age_seconds?.toFixed(1)}s old)`);
      cacheHit = true;
      newsItems = cacheResult.data;
    } else if (!perplexityKey) {
      // No API key - use sample data
      console.log('⚠️ No Perplexity API key, using sample news data');
      sourceUsed = 'Simulated';
      fallbackUsed = true;
      
      const sampleHeadlines = [
        { headline: 'Tech stocks rally on strong earnings reports', sectors: ['technology'], sentiment: 0.7 },
        { headline: 'Federal Reserve signals interest rate decision', sectors: ['financial services', 'banking'], sentiment: 0.1 },
        { headline: 'Healthcare sector sees gains after FDA approval', sectors: ['healthcare'], sentiment: 0.6 },
        { headline: 'Energy prices surge amid supply concerns', sectors: ['energy'], sentiment: -0.2 },
        { headline: 'Crypto market rebounds following regulatory clarity', sectors: ['cryptocurrency'], sentiment: 0.5 },
      ];
      
      for (const sample of sampleHeadlines) {
        // Match to assets by sector
        const matchedAssets = assets.filter(a => 
          sample.sectors.some(s => 
            a.metadata?.sector?.toLowerCase().includes(s) ||
            a.metadata?.industry?.toLowerCase().includes(s)
          )
        ).slice(0, 20);
        
        for (const asset of matchedAssets) {
          newsItems.push({
            ticker: asset.ticker,
            headline: sample.headline,
            summary: 'Sample breaking news for demonstration.',
            source: 'Market Wire',
            url: null,
            published_at: new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000).toISOString(),
            sentiment_score: sample.sentiment,
            relevance_score: 0.6,
            metadata: { sample: true, matched_by: 'sector' },
            created_at: new Date().toISOString(),
          });
        }
      }
    } else {
      // Make 1 API call for all headlines
      console.log('🔍 Fetching market headlines with single Perplexity API call...');
      
      const headlines = await fetchMarketHeadlines(perplexityKey, supabase);
      
      if (headlines.length === 0) {
        console.log('⚠️ No headlines fetched, using fallback');
        fallbackUsed = true;
        sourceUsed = 'Simulated';
      } else {
        console.log(`🎯 Matching ${headlines.length} headlines to ${assets.length} assets...`);
        
        let totalMatches = 0;
        
        for (const headline of headlines) {
          const matchedAssets = matchHeadlineToAssets(headline, assets);
          
          console.log(`  → "${headline.headline.substring(0, 50)}..." matched to ${matchedAssets.length} assets`);
          
          for (const asset of matchedAssets) {
            newsItems.push({
              ticker: sanitizeTicker(asset.ticker),
              headline: headline.headline.substring(0, 500),
              summary: headline.summary.substring(0, 1000) || 'No summary available',
              source: headline.source.substring(0, 200),
              url: null,
              published_at: new Date().toISOString(),
              sentiment_score: headline.sentiment,
              relevance_score: 0.8,
              metadata: { 
                source_used: sourceUsed,
                tickers_in_headline: headline.tickers_mentioned,
                companies_in_headline: headline.companies_mentioned,
                sectors_in_headline: headline.sectors_mentioned,
                matched_by: headline.tickers_mentioned.includes(asset.ticker) ? 'ticker' : 
                           headline.companies_mentioned.some(c => asset.name.toLowerCase().includes(c.toLowerCase())) ? 'company' : 'sector'
              },
              created_at: new Date().toISOString(),
            });
            totalMatches++;
          }
        }
        
        console.log(`📈 Total matches: ${totalMatches} news items across ${new Set(newsItems.map(n => n.ticker)).size} unique tickers`);
        
        // Cache the results
        if (newsItems.length > 0) {
          await redisCache.set('breaking-news:global', newsItems, 'Perplexity API', 1800); // 30 min cache
        }
      }
    }

    // Insert news items (deduplicate by ticker+headline)
    if (newsItems.length > 0) {
      // Deduplicate
      const seen = new Set<string>();
      const uniqueItems = newsItems.filter(item => {
        const key = `${item.ticker}:${item.headline.substring(0, 100)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      const { error } = await supabase.from('breaking_news').insert(uniqueItems);
      if (error) {
        console.error('❌ Supabase insert error:', error);
        throw new Error(`Database insert failed: ${error.message}`);
      }
      console.log(`✅ Inserted ${uniqueItems.length} breaking news items`);
    }

    const latency = Date.now() - fetchStartTime;
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    
    await supabase.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      rows_inserted: newsItems.length,
      source_used: sourceUsed,
      fallback_count: fallbackUsed ? 1 : 0,
      cache_hit: cacheHit,
      latency_ms: latency,
      metadata: { 
        headlines_fetched: cacheHit ? 'cached' : 'api',
        unique_tickers: new Set(newsItems.map(n => n.ticker)).size,
        api_calls: cacheHit ? 0 : 1
      },
    }).eq('id', logId);
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-breaking-news',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: newsItems.length,
      rows_skipped: 0,
      fallback_used: fallbackUsed ? sourceUsed : null,
      duration_ms: Date.now() - startTime,
      source_used: sourceUsed,
      error_message: null,
      metadata: { 
        api_calls: cacheHit ? 0 : 1,
        cache_hit: cacheHit,
        unique_tickers: new Set(newsItems.map(n => n.ticker)).size
      }
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-breaking-news',
      status: fallbackUsed ? 'partial' : 'success',
      duration: durationSeconds,
      latencyMs: latency,
      sourceUsed,
      fallbackRatio: fallbackUsed ? 1 : 0,
      rowsInserted: newsItems.length,
      metadata: { api_calls: cacheHit ? 0 : 1, cache_hit: cacheHit }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: newsItems.length,
        unique_tickers: new Set(newsItems.map(n => n.ticker)).size,
        source: sourceUsed,
        api_calls: cacheHit ? 0 : 1,
        duration_seconds: durationSeconds,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ FATAL ERROR in ingest-breaking-news:', error);
    
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    
    await supabase.from('ingest_logs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      error_message: errorMessage,
    }).eq('id', logId);
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-breaking-news',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      fallback_used: null,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity API',
      error_message: errorMessage,
      metadata: {}
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-breaking-news',
      status: 'failed',
      duration: durationSeconds,
      errorMessage
    });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
