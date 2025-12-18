import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { redisCache } from "../_shared/redis-cache.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { searchWeb } from "../_shared/firecrawl-client.ts";

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
  url: string;
  sentiment: number;
  tickers_mentioned: string[];
  companies_mentioned: string[];
  sectors_mentioned: string[];
}

// Match a headline to assets based on content
function matchHeadlineToAssets(headline: NewsHeadline, assets: Asset[]): Asset[] {
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
    
    // Sector/industry match (lower priority)
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
    
    // Only include if score >= 50 (direct ticker or strong company match)
    if (score >= 50) {
      matchedAssets.push(asset);
    }
  }
  
  return matchedAssets;
}

// Use Lovable AI to analyze news content and extract structured data
async function analyzeNewsWithAI(
  searchResults: Array<{ title: string; description: string; url: string; markdown?: string }>,
  lovableApiKey: string
): Promise<NewsHeadline[]> {
  const headlines: NewsHeadline[] = [];
  
  // Prepare content for AI analysis
  const newsContent = searchResults.slice(0, 15).map((r, i) => 
    `[${i + 1}] Title: ${r.title}\nDescription: ${r.description || 'N/A'}\nURL: ${r.url}\nContent: ${(r.markdown || '').substring(0, 500)}`
  ).join('\n\n---\n\n');
  
  const prompt = `Analyze these financial news articles and extract structured data for each.

NEWS ARTICLES:
${newsContent}

For each article, provide:
1. A clean headline
2. A one-sentence summary
3. The source name (extract from URL domain)
4. Sentiment score (-1 to 1, where -1 is very negative, 0 is neutral, 1 is very positive)
5. Any stock/crypto tickers mentioned (e.g., AAPL, NVDA, BTC)
6. Any company names mentioned
7. Any sectors mentioned (e.g., technology, healthcare, energy, cryptocurrency)

Return as JSON array:
[
  {
    "headline": "string",
    "summary": "string",
    "source": "string",
    "url": "string",
    "sentiment": number,
    "tickers": ["string"],
    "companies": ["string"],
    "sectors": ["string"]
  }
]

Only return the JSON array, no other text.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a financial news analyst. Extract structured data from news articles. Always return valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error('Lovable AI error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    let parsed: any[];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.log('Raw response:', content.substring(0, 500));
      return [];
    }
    
    for (const item of parsed) {
      if (item.headline) {
        headlines.push({
          headline: item.headline.substring(0, 500),
          summary: (item.summary || '').substring(0, 1000),
          source: item.source || 'Unknown',
          url: item.url || '',
          sentiment: validateSentiment(item.sentiment || 0),
          tickers_mentioned: (item.tickers || []).map((t: string) => t.toUpperCase()).filter((t: string) => t.length <= 6),
          companies_mentioned: item.companies || [],
          sectors_mentioned: (item.sectors || []).map((s: string) => s.toLowerCase()),
        });
      }
    }
    
    console.log(`🤖 AI extracted ${headlines.length} structured headlines`);
  } catch (error) {
    console.error('AI analysis error:', error);
  }
  
  return headlines;
}

// Fetch news using Firecrawl Search
async function fetchMarketHeadlines(firecrawlKey: string, lovableApiKey: string): Promise<NewsHeadline[]> {
  console.log('🔥 Fetching market news with Firecrawl Search...');
  
  // Search for recent financial news
  const searchQueries = [
    'stock market news today site:cnbc.com OR site:bloomberg.com OR site:reuters.com',
    'cryptocurrency bitcoin ethereum news today',
    'earnings report stock market breaking news',
  ];
  
  const allResults: Array<{ title: string; description: string; url: string; markdown?: string }> = [];
  
  for (const query of searchQueries) {
    try {
      const result = await searchWeb(query, {
        limit: 5,
        scrapeOptions: { formats: ['markdown'] }
      });
      
      if (result.success && result.data) {
        console.log(`  → Query "${query.substring(0, 40)}..." returned ${result.data.length} results`);
        for (const item of result.data) {
          allResults.push({
            title: item.title || '',
            description: item.description || '',
            url: item.url || '',
            markdown: item.markdown || '',
          });
        }
      }
    } catch (error) {
      console.error(`Search query failed: ${query}`, error);
    }
  }
  
  console.log(`📰 Total search results: ${allResults.length}`);
  
  if (allResults.length === 0) {
    return [];
  }
  
  // Use Lovable AI to analyze and structure the results
  const headlines = await analyzeNewsWithAI(allResults, lovableApiKey);
  
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
    source_used: 'Firecrawl Search',
    cache_hit: false,
    fallback_count: 0,
    latency_ms: 0,
  });

  try {
    console.log('Starting breaking news ingestion with Firecrawl...');
    
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    // Fetch ALL assets with metadata for matching
    const { data: allAssets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, asset_class, metadata')
      .in('asset_class', ['stock', 'crypto', 'etf', 'forex', 'commodity']);
    
    if (assetsError) throw assetsError;
    const assets: Asset[] = allAssets || [];
    console.log(`📊 Loaded ${assets.length} assets for matching`);
    
    let newsItems: any[] = [];
    let sourceUsed = 'Firecrawl Search';
    let cacheHit = false;
    let fallbackUsed = false;
    const fetchStartTime = Date.now();
    
    // Check cache first
    const cacheResult = await redisCache.get('breaking-news:global');
    if (cacheResult.hit && cacheResult.data) {
      console.log(`✅ Cache HIT for breaking-news:global (${cacheResult.age_seconds?.toFixed(1)}s old)`);
      cacheHit = true;
      newsItems = cacheResult.data;
    } else if (!firecrawlKey || !lovableApiKey) {
      // No API keys - use sample data
      console.log('⚠️ Missing API keys, using sample news data');
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
      // Use Firecrawl Search + Lovable AI
      console.log('🔍 Fetching market headlines with Firecrawl Search...');
      
      const headlines = await fetchMarketHeadlines(firecrawlKey, lovableApiKey);
      
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
              url: headline.url || null,
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
          await redisCache.set('breaking-news:global', newsItems, 'Firecrawl Search');
        }
      }
    }

    // Insert news items (deduplicate by ticker+headline)
    if (newsItems.length > 0) {
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
        headlines_fetched: cacheHit ? 'cached' : 'firecrawl',
        unique_tickers: new Set(newsItems.map(n => n.ticker)).size,
        api_calls: cacheHit ? 0 : 3
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
        api_calls: cacheHit ? 0 : 3,
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
      metadata: { api_calls: cacheHit ? 0 : 3, cache_hit: cacheHit }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: newsItems.length,
        unique_tickers: new Set(newsItems.map(n => n.ticker)).size,
        source: sourceUsed,
        api_calls: cacheHit ? 0 : 3,
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
      error_message: errorMessage.substring(0, 1000),
    }).eq('id', logId);
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-breaking-news',
      executed_at: new Date().toISOString(),
      status: 'failed',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'error',
      error_message: errorMessage.substring(0, 1000),
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-breaking-news',
      status: 'failed',
      duration: durationSeconds,
      latencyMs: 0,
      sourceUsed: 'error',
      fallbackRatio: 0,
      rowsInserted: 0,
      errorMessage: errorMessage.substring(0, 200),
    });

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        duration_seconds: durationSeconds,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
