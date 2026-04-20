// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { scrapeUrl } from "../_shared/firecrawl-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top tickers to scrape prices for (most traded US stocks)
const TOP_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'JNJ',
  'JPM', 'V', 'PG', 'XOM', 'HD', 'CVX', 'MA', 'ABBV', 'MRK', 'LLY',
  'PEP', 'KO', 'COST', 'AVGO', 'TMO', 'MCD', 'WMT', 'CSCO', 'ABT', 'DHR',
  'ACN', 'NEE', 'VZ', 'ADBE', 'PM', 'TXN', 'CRM', 'NKE', 'BMY', 'UPS',
  'INTC', 'AMD', 'QCOM', 'COP', 'RTX', 'HON', 'ORCL', 'IBM', 'GE', 'CAT'
];

interface PriceData {
  ticker: string;
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

/**
 * Parse Yahoo Finance historical data from HTML
 */
function parseYahooFinanceHtml(html: string, ticker: string): PriceData[] {
  const prices: PriceData[] = [];
  
  try {
    // Look for the historical data table rows
    // Yahoo Finance format: Date, Open, High, Low, Close, Adj Close, Volume
    const tableRowRegex = /<tr[^>]*class="[^"]*yf-[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    
    let match;
    while ((match = tableRowRegex.exec(html)) !== null) {
      const rowHtml = match[1];
      const cells: string[] = [];
      
      let cellMatch;
      const tempCellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      while ((cellMatch = tempCellRegex.exec(rowHtml)) !== null) {
        // Strip HTML tags and get text content
        const text = cellMatch[1].replace(/<[^>]*>/g, '').trim();
        cells.push(text);
      }
      
      // Expected: Date, Open, High, Low, Close, Adj Close, Volume
      if (cells.length >= 5) {
        const dateStr = cells[0];
        const open = parseFloat(cells[1]?.replace(/,/g, ''));
        const high = parseFloat(cells[2]?.replace(/,/g, ''));
        const low = parseFloat(cells[3]?.replace(/,/g, ''));
        const close = parseFloat(cells[4]?.replace(/,/g, ''));
        const volume = cells.length >= 7 ? parseInt(cells[6]?.replace(/,/g, '') || '0') : 0; // guard: cells[6] requires >= 7 columns
        
        // Validate data
        if (dateStr && !isNaN(close) && close > 0) {
          // Parse date from "Dec 20, 2024" format
          const parsedDate = parseYahooDate(dateStr);
          if (parsedDate) {
            prices.push({
              ticker,
              date: parsedDate,
              open: isNaN(open) ? undefined : open,
              high: isNaN(high) ? undefined : high,
              low: isNaN(low) ? undefined : low,
              close,
              volume: isNaN(volume) ? undefined : volume,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(`[ingest-prices-csv] Error parsing Yahoo HTML for ${ticker}:`, error);
  }
  
  return prices;
}

/**
 * Parse Yahoo Finance date format (e.g., "Dec 20, 2024")
 */
function parseYahooDate(dateStr: string): string | null {
  try {
    const months: Record<string, string> = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    
    // Match "Dec 20, 2024" format
    const match = dateStr.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{4})/);
    if (match) {
      const month = months[match[1]];
      const day = match[2].padStart(2, '0');
      const year = match[3];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }
    
    // Try ISO format fallback
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Generate checksum for deduplication
 */
async function generateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Scrape prices from Yahoo Finance for a ticker
 */
async function scrapePricesForTicker(ticker: string): Promise<PriceData[]> {
  // Yahoo Finance historical data URL
  const url = `https://finance.yahoo.com/quote/${ticker}/history/`;
  
  console.log(`[ingest-prices-csv] Scraping prices for ${ticker} from Yahoo Finance`);
  
  try {
    const result = await scrapeUrl(url, {
      formats: ['html'],
      onlyMainContent: false,
      waitFor: 3000, // Wait for JS to render
    });
    
    if (!result.success || !result.data) {
      console.warn(`[ingest-prices-csv] Failed to scrape ${ticker}: ${result.error}`);
      return [];
    }
    
    const html = result.data.html || result.data.rawHtml || '';
    return parseYahooFinanceHtml(html, ticker);
  } catch (error) {
    console.error(`[ingest-prices-csv] Error scraping ${ticker}:`, error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const slackAlerter = new SlackAlerter();

  try {
    // Check if manual CSV URLs provided (backward compatible)
    let manualMode = false;
    let csvUrls: string[] = [];
    
    try {
      const body = await req.json();
      if (body.csv_urls && body.csv_urls.length > 0) {
        manualMode = true;
        csvUrls = body.csv_urls;
      }
    } catch {
      // No body = automated Firecrawl mode
    }
    
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    const sourceUsed = manualMode ? 'CSV Upload' : 'Yahoo Finance (Firecrawl)';
    
    if (manualMode) {
      // Legacy CSV processing mode
      console.log(`[ingest-prices-csv] Processing ${csvUrls.length} CSV URLs (manual mode)`);
      
      for (const csvUrl of csvUrls) {
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        
        const lines = csvText.trim().split('\n');
        const headers = lines[0].toLowerCase().split(',');
        
        const dateIdx = headers.findIndex(h => h.includes('date'));
        const tickerIdx = headers.findIndex(h => h.includes('ticker') || h.includes('symbol'));
        const closeIdx = headers.findIndex(h => h.includes('close') || h.includes('price'));
        
        if (dateIdx === -1 || tickerIdx === -1 || closeIdx === -1) {
          continue;
        }
        
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          const ticker = cols[tickerIdx]?.trim().toUpperCase();
          const date = cols[dateIdx]?.trim();
          const close = parseFloat(cols[closeIdx]);
          
          if (!ticker || !date || isNaN(close)) {
            skipped++;
            continue;
          }
          
          const checksumData = `${ticker}|${date}|${close}|${csvUrl}`;
          const checksum = await generateChecksum(checksumData);
          
          const { data: existing } = await supabaseClient
            .from('prices')
            .select('id')
            .eq('checksum', checksum)
            .maybeSingle();
          
          if (existing) {
            skipped++;
            continue;
          }
          
          const { data: asset } = await supabaseClient
            .from('assets')
            .select('id')
            .eq('ticker', ticker)
            .maybeSingle();
          
          await supabaseClient.from('prices').insert({
            ticker,
            date,
            close,
            asset_id: asset?.id,
            checksum
          });
          
          inserted++;
        }
      }
    } else {
      // Automated Firecrawl mode - scrape Yahoo Finance
      console.log(`[ingest-prices-csv] Starting automated price scraping for ${TOP_TICKERS.length} tickers`);
      
      // Process tickers in batches to avoid rate limits
      const batchSize = 5;
      const delayBetweenBatches = 2000; // 2 seconds
      
      for (let i = 0; i < TOP_TICKERS.length; i += batchSize) {
        const batch = TOP_TICKERS.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(ticker => scrapePricesForTicker(ticker))
        );
        
        for (const prices of batchResults) {
          if (prices.length === 0) {
            failed++;
            continue;
          }
          
          for (const price of prices) {
            try {
              const checksumData = `${price.ticker}|${price.date}|${price.close}|yahoo`;
              const checksum = await generateChecksum(checksumData);
              
              // Check if exists
              const { data: existing } = await supabaseClient
                .from('prices')
                .select('id')
                .eq('checksum', checksum)
                .maybeSingle();
              
              if (existing) {
                skipped++;
                continue;
              }
              
              // Find asset
              const { data: asset } = await supabaseClient
                .from('assets')
                .select('id')
                .eq('ticker', price.ticker)
                .maybeSingle();
              
              // Skip if asset not found - don't insert orphaned rows with null asset_id
              if (!asset?.id) {
                skipped++;
                continue;
              }

              // Insert price
              const { error: insertError } = await supabaseClient
                .from('prices')
                .insert({
                  ticker: price.ticker,
                  date: price.date,
                  open: price.open,
                  high: price.high,
                  low: price.low,
                  close: price.close,
                  volume: price.volume,
                  asset_id: asset.id,
                  checksum,
                });
              
              if (insertError) {
                console.warn(`[ingest-prices-csv] Insert error for ${price.ticker}: ${insertError.message}`);
                skipped++;
              } else {
                inserted++;
              }
            } catch (err) {
              console.warn(`[ingest-prices-csv] Error processing price for ${price.ticker}:`, err);
              skipped++;
            }
          }
        }
        
        // Delay between batches
        if (i + batchSize < TOP_TICKERS.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ingest-prices-csv] Completed: ${inserted} inserted, ${skipped} skipped, ${failed} failed in ${duration}ms`);

    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-prices-csv',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: duration,
      source_used: sourceUsed,
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-prices-csv',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed,
      duration,
    });

    return new Response(JSON.stringify({ 
      success: true,
      inserted, 
      skipped, 
      failed,
      source: sourceUsed,
      tickers_processed: manualMode ? csvUrls.length : TOP_TICKERS.length,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ingest-prices-csv] Fatal error: ${errorMessage}`);
    
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-prices-csv',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Yahoo Finance (Firecrawl)',
      error_message: errorMessage,
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-prices-csv',
      message: `Price scraping failed: ${errorMessage}`,
    });
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
