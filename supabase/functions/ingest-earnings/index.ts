// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VERSION = 'v3';

// BATCH CONFIGURATION
const BATCH_SIZE = 2; // Process 2 tickers per invocation (4 at 12.5s = 6.4/min, exceeds 5/min limit)
const AV_DELAY_MS = 15000; // 15 seconds between Alpha Vantage calls (2 calls = 4/min, safely under 5/min)
const CACHE_HOURS = 8; // Don't re-process tickers within 8 hours

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

// Fetch earnings from Alpha Vantage
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
    
    await logApiUsage(supabase, 'Alpha Vantage', endpoint, 'success', responseTimeMs);
    
    // Get the most recent earnings
    const latest = quarterlyEarnings[0];
    // Handle 'N/A' strings from Alpha Vantage — parseFloat('N/A') = NaN which then gets clamped to -100
    const surprisePercentage = (latest.surprisePercentage && latest.surprisePercentage !== 'N/A') ? parseFloat(latest.surprisePercentage) || 0 : 0;
    const reportedEPS = (latest.reportedEPS && latest.reportedEPS !== 'N/A') ? parseFloat(latest.reportedEPS) || 0 : 0;
    const estimatedEPS = (latest.estimatedEPS && latest.estimatedEPS !== 'N/A') ? parseFloat(latest.estimatedEPS) || 0 : 0;
    
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
      revenue_surprise: 0, // Alpha Vantage doesn't provide revenue surprise data
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let supabase: any;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[ingest-earnings ${VERSION}] BATCH MODE - Processing ${BATCH_SIZE} tickers per run`);

    // Priority tickers (most important for earnings data)
    const priorityTickers = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'JNJ', 'V',
      'PG', 'UNH', 'HD', 'MA', 'DIS', 'PYPL', 'ADBE', 'NFLX', 'CRM', 'INTC',
      'VZ', 'KO', 'PEP', 'MRK', 'ABT', 'TMO', 'COST', 'AVGO', 'NKE', 'WMT'
    ];

    // Check which tickers were recently processed WITH Alpha Vantage (not estimation)
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();
    
    const { data: recentlyProcessed } = await supabase
      .from('earnings_sentiment')
      .select('ticker, metadata')
      .gte('created_at', cacheThreshold)
      .in('ticker', priorityTickers);

    // Only consider Alpha Vantage sourced data as "processed"
    const processedSet = new Set(
      (recentlyProcessed || [])
        .filter((r: any) => r.metadata?.source === 'alpha_vantage')
        .map((r: any) => r.ticker)
    );
    const tickersToProcess = priorityTickers.filter(t => !processedSet.has(t));
    
    console.log(`Cache check: ${processedSet.size} recently processed, ${tickersToProcess.length} remaining`);

    // Take only BATCH_SIZE tickers for this run
    const batchTickers = tickersToProcess.slice(0, BATCH_SIZE);
    
    if (batchTickers.length === 0) {
      console.log('All priority tickers recently processed - nothing to do');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-earnings',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: priorityTickers.length,
        duration_ms: Date.now() - startTime,
        source_used: 'cache_skip',
        metadata: { version: VERSION, batch_mode: true, message: 'All tickers cached' },
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'All priority tickers recently processed',
        stats: { batchProcessed: 0, remaining: 0, cached: priorityTickers.length }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`This batch: ${batchTickers.join(', ')}`);

    // Validate Alpha Vantage API key
    if (!alphaVantageKey) {
      console.error('⚠️ ALPHA_VANTAGE_API_KEY not configured!');
      return new Response(JSON.stringify({
        success: false,
        error: 'ALPHA_VANTAGE_API_KEY not configured'
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const earnings: EarningsData[] = [];
    let successCount = 0;
    let errorCount = 0;
    let rateLimitHit = false;

    // Process batch with Alpha Vantage
    for (let i = 0; i < batchTickers.length; i++) {
      const ticker = batchTickers[i];
      
      // Rate limit delay (except for first call)
      if (i > 0) {
        console.log(`Rate limit delay: ${AV_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, AV_DELAY_MS));
      }

      console.log(`[${i + 1}/${batchTickers.length}] Fetching ${ticker}...`);
      
      const earningsData = await fetchAlphaVantageEarnings(ticker, alphaVantageKey, supabase);
      
      if (earningsData) {
        earnings.push(earningsData);
        successCount++;
        console.log(`✓ ${ticker}: ${earningsData.earnings_surprise}% surprise (${earningsData.quarter})`);
      } else {
        errorCount++;
        // Check if we hit rate limit by looking at recent logs
        const { data: recentLogs } = await supabase
          .from('api_usage_logs')
          .select('status')
          .eq('function_name', 'ingest-earnings')
          .eq('status', 'rate_limited')
          .gte('created_at', new Date(Date.now() - 60000).toISOString())
          .limit(1);
        
        if (recentLogs && recentLogs.length > 0) {
          console.log('Rate limit detected - stopping batch early');
          rateLimitHit = true;
          break;
        }
      }
    }

    // Upsert earnings data
    let insertedCount = 0;
    if (earnings.length > 0) {
      const { error } = await supabase
        .from('earnings_sentiment')
        .upsert(earnings, { 
          onConflict: 'ticker,quarter',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error('Upsert error:', error.message);
      } else {
        insertedCount = earnings.length;
        console.log(`✓ Upserted ${insertedCount} records`);
      }
    }

    const durationMs = Date.now() - startTime;
    const remainingTickers = tickersToProcess.length - batchTickers.length;

    console.log('=== BATCH COMPLETE ===');
    console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`Success: ${successCount}, Errors: ${errorCount}`);
    console.log(`Remaining for next batch: ${remainingTickers}`);

    await logHeartbeat(supabase, {
      function_name: 'ingest-earnings',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: errorCount,
      duration_ms: durationMs,
      source_used: 'alpha_vantage',
      metadata: {
        version: VERSION,
        batch_mode: true,
        batch_size: batchTickers.length,
        remaining_tickers: remainingTickers,
        rate_limit_hit: rateLimitHit,
        tickers_processed: batchTickers,
      },
    });
    return new Response(JSON.stringify({ 
      success: true,
      stats: {
        batchProcessed: batchTickers.length,
        success: successCount,
        errors: errorCount,
        inserted: insertedCount,
        remaining: remainingTickers,
        duration: `${(durationMs / 1000).toFixed(1)}s`
      },
      rateLimitHit,
      message: remainingTickers > 0 
        ? `Batch complete. ${remainingTickers} tickers remaining for next run.`
        : 'All priority tickers processed!'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Fatal error:', errMsg);

    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-earnings',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'alpha_vantage',
        metadata: { version: VERSION, error: errMsg },
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: errMsg
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
