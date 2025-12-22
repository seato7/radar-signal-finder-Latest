import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VERSION = 'v2';

interface EarningsData {
  ticker: string;
  quarter: string;
  earnings_date: string;
  earnings_surprise: number;
  revenue_surprise: number;
  sentiment_score: number;
  metadata: Record<string, any>;
  created_at: string;
}

interface AlphaVantageEarning {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: string;
  estimatedEPS: string;
  surprise: string;
  surprisePercentage: string;
}

// Log API usage to tracking table
async function logApiUsage(
  supabase: any,
  apiName: string,
  endpoint: string,
  status: 'success' | 'failure' | 'rate_limited',
  responseTimeMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from('api_usage_logs').insert({
      api_name: apiName,
      endpoint: endpoint,
      function_name: 'ingest-earnings',
      status: status,
      response_time_ms: responseTimeMs,
      error_message: errorMessage || null,
    });
  } catch (e) {
    console.error('Failed to log API usage:', e);
  }
}

// Fetch earnings from Alpha Vantage EARNINGS API
async function fetchAlphaVantageEarnings(
  ticker: string, 
  apiKey: string,
  supabase: any
): Promise<EarningsData | null> {
  const startTime = Date.now();
  const endpoint = '/query?function=EARNINGS';
  
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}&apikey=${apiKey}`;
    const response = await fetch(url);
    const responseTimeMs = Date.now() - startTime;
    
    if (!response.ok) {
      console.log(`Alpha Vantage HTTP error for ${ticker}: ${response.status}`);
      await logApiUsage(supabase, 'Alpha Vantage', endpoint, 'failure', responseTimeMs, `HTTP ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Check for API errors or rate limits
    if (data['Note'] || data['Information']) {
      console.log(`Alpha Vantage rate limit for ${ticker}: ${data['Note'] || data['Information']}`);
      await logApiUsage(supabase, 'Alpha Vantage', endpoint, 'rate_limited', responseTimeMs, data['Note'] || data['Information']);
      return null;
    }
    
    if (data['Error Message']) {
      console.log(`Alpha Vantage API error for ${ticker}: ${data['Error Message']}`);
      await logApiUsage(supabase, 'Alpha Vantage', endpoint, 'failure', responseTimeMs, data['Error Message']);
      return null;
    }
    
    const quarterlyEarnings = data.quarterlyEarnings as AlphaVantageEarning[] | undefined;
    if (!quarterlyEarnings || quarterlyEarnings.length === 0) {
      console.log(`No quarterly earnings data for ${ticker}`);
      await logApiUsage(supabase, 'Alpha Vantage', endpoint, 'success', responseTimeMs, 'No data available');
      return null;
    }
    
    // Log successful API call
    await logApiUsage(supabase, 'Alpha Vantage', endpoint, 'success', responseTimeMs);
    
    // Get the most recent earnings
    const latest = quarterlyEarnings[0];
    const surprisePercentage = parseFloat(latest.surprisePercentage) || 0;
    const reportedEPS = parseFloat(latest.reportedEPS) || 0;
    const estimatedEPS = parseFloat(latest.estimatedEPS) || 0;
    
    // Determine quarter from fiscal date
    const fiscalDate = new Date(latest.fiscalDateEnding);
    const quarter = `Q${Math.ceil((fiscalDate.getMonth() + 1) / 3)} ${fiscalDate.getFullYear()}`;
    
    // Sentiment based on real surprise data
    const sentiment = surprisePercentage > 5 ? 1 : surprisePercentage < -5 ? -1 : 0;
    
    return {
      ticker: ticker.substring(0, 10),
      quarter: quarter.substring(0, 10),
      earnings_date: latest.reportedDate || latest.fiscalDateEnding,
      earnings_surprise: Math.max(-100, Math.min(100, surprisePercentage)),
      revenue_surprise: 0, // Alpha Vantage doesn't provide revenue surprise
      sentiment_score: sentiment,
      metadata: {
        source: 'alpha_vantage',
        version: VERSION,
        reported_eps: reportedEPS,
        estimated_eps: estimatedEPS,
        surprise_amount: parseFloat(latest.surprise) || 0,
        fiscal_date_ending: latest.fiscalDateEnding,
        data_quality: 'official',
      },
      created_at: new Date().toISOString(),
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    console.error(`Alpha Vantage error for ${ticker}:`, error);
    await logApiUsage(supabase, 'Alpha Vantage', endpoint, 'failure', responseTimeMs, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Fallback: Use Firecrawl to search for earnings data
async function fetchFirecrawlEarnings(
  tickers: string[],
  supabase: any
): Promise<Map<string, EarningsData>> {
  const results = new Map<string, EarningsData>();
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!firecrawlKey || !lovableKey) {
    console.log('Firecrawl or Lovable AI key not configured, skipping fallback');
    return results;
  }
  
  try {
    // Process ALL tickers in batches (expanded from 20 limit)
    const batchSize = 5;
    const maxBatches = Math.ceil(tickers.length / batchSize);
    let processedBatches = 0;
    
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const startTime = Date.now();
      const query = `${batch.join(' ')} earnings surprise Q4 2024 Q3 2024 reported EPS`;
      
      console.log(`[${++processedBatches}/${maxBatches}] Firecrawl search for: ${batch.join(', ')}`);
      
      const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 5,
          scrapeOptions: { formats: ['markdown'] },
        }),
      });
      
      const responseTimeMs = Date.now() - startTime;
      
      if (!searchResponse.ok) {
        console.log(`Firecrawl search failed: ${searchResponse.status}`);
        await logApiUsage(supabase, 'Firecrawl', '/v1/search', 'failure', responseTimeMs, `HTTP ${searchResponse.status}`);
        continue;
      }
      
      await logApiUsage(supabase, 'Firecrawl', '/v1/search', 'success', responseTimeMs);
      
      const searchData = await searchResponse.json();
      if (!searchData.success || !searchData.data || searchData.data.length === 0) {
        continue;
      }
      
      // Combine markdown from search results
      const combinedContent = searchData.data
        .map((r: any) => r.markdown || '')
        .join('\n\n')
        .substring(0, 8000);
      
      // Use Lovable AI to extract structured earnings data
      const aiStartTime = Date.now();
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are a financial data extraction assistant. Extract earnings surprise data from the provided text.
Return ONLY valid JSON array with objects containing:
- ticker: stock symbol (uppercase)
- surprise_percentage: earnings surprise as a percentage number (positive or negative)
- quarter: quarter in format "Q1 2024"
- reported_date: date when earnings were reported (YYYY-MM-DD format)
- reported_eps: actual reported EPS (number)
- estimated_eps: analyst estimated EPS (number)

Only include data you can verify from the text. If no earnings data found, return empty array [].`,
            },
            {
              role: 'user',
              content: `Extract earnings surprise data for these tickers if mentioned: ${batch.join(', ')}\n\nText:\n${combinedContent}`,
            },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'extract_earnings',
                description: 'Extract earnings surprise data from text',
                parameters: {
                  type: 'object',
                  properties: {
                    earnings: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          ticker: { type: 'string' },
                          surprise_percentage: { type: 'number' },
                          quarter: { type: 'string' },
                          reported_date: { type: 'string' },
                          reported_eps: { type: 'number' },
                          estimated_eps: { type: 'number' },
                        },
                        required: ['ticker', 'surprise_percentage'],
                      },
                    },
                  },
                  required: ['earnings'],
                },
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'extract_earnings' } },
        }),
      });
      
      const aiResponseTimeMs = Date.now() - aiStartTime;
      
      if (!aiResponse.ok) {
        console.log(`Lovable AI extraction failed: ${aiResponse.status}`);
        await logApiUsage(supabase, 'Lovable AI', '/v1/chat/completions', 'failure', aiResponseTimeMs, `HTTP ${aiResponse.status}`);
        continue;
      }
      
      await logApiUsage(supabase, 'Lovable AI', '/v1/chat/completions', 'success', aiResponseTimeMs);
      
      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      
      if (toolCall?.function?.arguments) {
        try {
          const extracted = JSON.parse(toolCall.function.arguments);
          const earningsArray = extracted.earnings || [];
          
          for (const e of earningsArray) {
            if (e.ticker && typeof e.surprise_percentage === 'number') {
              const ticker = e.ticker.toUpperCase();
              if (batch.includes(ticker) && !results.has(ticker)) {
                const now = new Date();
                const quarter = e.quarter || `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
                const sentiment = e.surprise_percentage > 5 ? 1 : e.surprise_percentage < -5 ? -1 : 0;
                
                results.set(ticker, {
                  ticker: ticker.substring(0, 10),
                  quarter: quarter.substring(0, 10),
                  earnings_date: e.reported_date || now.toISOString().split('T')[0],
                  earnings_surprise: Math.max(-100, Math.min(100, e.surprise_percentage)),
                  revenue_surprise: 0,
                  sentiment_score: sentiment,
                  metadata: {
                    source: 'firecrawl_extraction',
                    version: VERSION,
                    reported_eps: e.reported_eps || null,
                    estimated_eps: e.estimated_eps || null,
                    data_quality: 'ai_extracted',
                  },
                  created_at: now.toISOString(),
                });
                
                console.log(`✓ Extracted earnings for ${ticker}: ${e.surprise_percentage}% surprise`);
              }
            }
          }
        } catch (parseError) {
          console.error('Failed to parse AI extraction:', parseError);
        }
      }
      
      // Rate limiting between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Firecrawl fallback error:', error);
  }
  
  return results;
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
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[ingest-earnings ${VERSION}] Starting earnings ingestion with Alpha Vantage + Firecrawl fallback...`);

    // Validate Alpha Vantage API key
    if (!alphaVantageKey) {
      console.warn('⚠️ ALPHA_VANTAGE_API_KEY not configured - will use Firecrawl only');
    } else {
      console.log('✓ Alpha Vantage API key configured');
    }

    // Fetch ALL stocks (removed limit for expanded coverage)
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker, name')
      .eq('asset_class', 'stock')
      .order('ticker');

    if (assetsError) throw assetsError;
    
    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, count: 0, message: 'No stocks found', version: VERSION }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${assets.length} stocks for earnings (v2 - full coverage)...`);
    const earnings: EarningsData[] = [];
    const tickersWithoutData: string[] = [];
    let alphaVantageCount = 0;
    let alphaVantageErrors = 0;
    let firecrawlCount = 0;
    
    // Alpha Vantage: Free tier = 25 requests/day, process top tickers
    const alphaVantageLimit = alphaVantageKey ? 25 : 0;
    const topTickers = assets.slice(0, alphaVantageLimit);
    
    if (alphaVantageKey && topTickers.length > 0) {
      console.log(`Fetching from Alpha Vantage for ${topTickers.length} top stocks...`);
      
      for (const asset of topTickers) {
        const earningsData = await fetchAlphaVantageEarnings(asset.ticker, alphaVantageKey, supabase);
        
        if (earningsData) {
          earnings.push(earningsData);
          alphaVantageCount++;
          console.log(`✓ Alpha Vantage: ${asset.ticker} - ${earningsData.earnings_surprise}% surprise`);
        } else {
          tickersWithoutData.push(asset.ticker);
          alphaVantageErrors++;
        }
        
        // Rate limiting: 5 calls per minute for free tier (12 seconds between calls)
        await new Promise(resolve => setTimeout(resolve, 12500));
      }
      
      console.log(`Alpha Vantage complete: ${alphaVantageCount} success, ${alphaVantageErrors} failed/no-data`);
    } else {
      console.log('Alpha Vantage API key not configured, using Firecrawl only');
      tickersWithoutData.push(...assets.map((a: any) => a.ticker));
    }
    
    // Add remaining tickers (beyond Alpha Vantage limit) to fallback list
    const remainingTickers = assets.slice(alphaVantageLimit).map((a: any) => a.ticker);
    tickersWithoutData.push(...remainingTickers);
    
    // Fallback: Use Firecrawl + Lovable AI for all remaining tickers
    if (tickersWithoutData.length > 0) {
      console.log(`Using Firecrawl fallback for ${tickersWithoutData.length} tickers...`);
      
      const firecrawlResults = await fetchFirecrawlEarnings(tickersWithoutData, supabase);
      
      for (const [ticker, data] of firecrawlResults) {
        earnings.push(data);
        firecrawlCount++;
      }
      
      console.log(`Firecrawl complete: ${firecrawlCount} records extracted`);
    }

    console.log(`Collected ${earnings.length} earnings records (Alpha Vantage: ${alphaVantageCount}, Firecrawl: ${firecrawlCount})`);

    // Batch insert
    let insertedCount = 0;
    if (earnings.length > 0) {
      for (let i = 0; i < earnings.length; i += 100) {
        const chunk = earnings.slice(i, i + 100);
        const { error } = await supabase
          .from('earnings_sentiment')
          .upsert(chunk, { 
            onConflict: 'ticker,quarter',
            ignoreDuplicates: false 
          });

        if (error) {
          console.error('Batch upsert error:', error.message);
        } else {
          insertedCount += chunk.length;
        }
      }
      console.log(`Upserted ${insertedCount} earnings records`);
    }

    const durationMs = Date.now() - startTime;
    const sourceUsed = alphaVantageCount > 0 
      ? `Alpha_Vantage(${alphaVantageCount}) + Firecrawl(${firecrawlCount})`
      : `Firecrawl(${firecrawlCount})`;

    await logHeartbeat(supabase, {
      function_name: 'ingest-earnings',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: assets.length - insertedCount,
      duration_ms: durationMs,
      source_used: sourceUsed,
      metadata: {
        version: VERSION,
        alpha_vantage_success: alphaVantageCount,
        alpha_vantage_errors: alphaVantageErrors,
        firecrawl_count: firecrawlCount,
        total_stocks_processed: assets.length,
      },
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-earnings',
      status: 'success',
      rowsInserted: insertedCount,
      rowsSkipped: assets.length - insertedCount,
      sourceUsed,
      duration: durationMs,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        version: VERSION,
        count: insertedCount,
        sources: {
          alpha_vantage: alphaVantageCount,
          alpha_vantage_errors: alphaVantageErrors,
          firecrawl: firecrawlCount,
        },
        total_stocks: assets.length,
        message: 'Real earnings data from Alpha Vantage + Firecrawl (v2)'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-earnings:', error);
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-earnings',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Alpha_Vantage + Firecrawl',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        metadata: { version: VERSION },
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-earnings',
      message: `Earnings ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', version: VERSION }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
