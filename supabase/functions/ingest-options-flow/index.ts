import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v7 - Firecrawl browser scraping for options data
// Uses Barchart options page with HTML parsing
// Fallback to CBOE if Barchart fails

interface ParsedOption {
  ticker: string;
  option_type: string;
  strike_price: number;
  expiration_date: string | null;
  volume: number;
  open_interest: number | null;
  implied_volatility: number | null;
  premium: number | null;
  flow_type: null;
  sentiment: string;
  trade_date: string;
  metadata: Record<string, any>;
}

async function scrapeWithFirecrawl(url: string, waitFor: number = 5000): Promise<{ html: string | null; status: number; error?: string }> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.error('FIRECRAWL_API_KEY not configured');
    return { html: null, status: 500, error: 'FIRECRAWL_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['html'],
        waitFor,
        onlyMainContent: false,
      }),
    });

    const status = response.status;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Firecrawl error: HTTP ${status} - ${errorText.slice(0, 200)}`);
      return { html: null, status, error: errorText.slice(0, 200) };
    }

    const data = await response.json();
    const html = data?.data?.html || data?.html || null;
    
    return { html, status };
  } catch (err) {
    console.error(`Firecrawl fetch error: ${err}`);
    return { html: null, status: 0, error: String(err) };
  }
}

function parseExpirationFromText(text: string): string | null {
  // Try to parse dates like "Jan 17, 2025" or "01/17/25" or "2025-01-17"
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/,  // YYYY-MM-DD
    /(\d{2})\/(\d{2})\/(\d{2,4})/,  // MM/DD/YY or MM/DD/YYYY
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      } else if (pattern === patterns[1]) {
        const year = match[3].length === 2 ? `20${match[3]}` : match[3];
        return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
      } else if (pattern === patterns[2]) {
        const months: Record<string, string> = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        const month = months[match[1].toLowerCase()];
        const day = match[2].padStart(2, '0');
        return `${match[3]}-${month}-${day}`;
      }
    }
  }
  return null;
}

function parseBarchartOptionsHtml(html: string, ticker: string): ParsedOption[] {
  const options: ParsedOption[] = [];
  const warnings: string[] = [];
  
  console.log(`Parsing Barchart HTML for ${ticker}, length=${html.length}`);
  
  // Extract expiration date from page if present
  let pageExpiration: string | null = null;
  const expMatch = html.match(/Expiration[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i) ||
                   html.match(/data-expiration="([^"]+)"/i) ||
                   html.match(/expiry[=:]"?(\d{4}-\d{2}-\d{2})/i);
  if (expMatch) {
    pageExpiration = parseExpirationFromText(expMatch[1] || expMatch[0]);
  }
  
  // If no expiration found, use next Friday as default
  if (!pageExpiration) {
    const today = new Date();
    const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
    const nextFriday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
    pageExpiration = nextFriday.toISOString().split('T')[0];
    warnings.push('expiration_estimated');
  }

  // Barchart specific: Look for data rows with known class patterns
  // They use classes like "bc-table-row" or specific data attributes
  
  // Strategy 1: Look for options symbols pattern (e.g., SPY250124C00600000)
  const symbolPattern = new RegExp(`(${ticker})(\\d{6})([CP])(\\d{8})`, 'gi');
  const symbolMatches = html.matchAll(symbolPattern);
  
  const seenSymbols = new Set<string>();
  
  for (const match of symbolMatches) {
    const fullSymbol = match[0].toUpperCase();
    if (seenSymbols.has(fullSymbol)) continue;
    seenSymbols.add(fullSymbol);
    
    // Parse the symbol: TICKER + YYMMDD + C/P + 00000000 (strike * 1000)
    const dateStr = match[2]; // YYMMDD
    const optType = match[3].toUpperCase() === 'C' ? 'call' : 'put';
    const strikeRaw = parseInt(match[4]); // Strike * 1000
    const strike = strikeRaw / 1000;
    
    // Parse date
    const year = 2000 + parseInt(dateStr.slice(0, 2));
    const month = dateStr.slice(2, 4);
    const day = dateStr.slice(4, 6);
    const expDate = `${year}-${month}-${day}`;
    
    // Now find volume/OI near this symbol in HTML
    const symbolIndex = html.indexOf(fullSymbol);
    const contextStart = Math.max(0, symbolIndex - 200);
    const contextEnd = Math.min(html.length, symbolIndex + 800);
    const context = html.slice(contextStart, contextEnd);
    
    // Extract numbers from the row context
    const numbers: number[] = [];
    const numPattern = />([0-9,]+(?:\.\d+)?)</g;
    let numMatch;
    while ((numMatch = numPattern.exec(context)) !== null) {
      const n = parseFloat(numMatch[1].replace(/,/g, ''));
      if (!isNaN(n) && n > 0) {
        numbers.push(n);
      }
    }
    
    // Find volume (larger integers, typically 3rd-5th column)
    // Barchart order: Last, Change, Bid, Ask, Volume, OI, IV
    let volume = 0;
    let openInterest = 0;
    let premium: number | null = null;
    let iv: number | null = null;
    
    // Look for volume-like numbers (integers > 50, not matching strike)
    for (const n of numbers) {
      if (Math.abs(n - strike) < 1) continue; // Skip strike matches
      
      if (n > 50 && n < 50000000 && Number.isInteger(n)) {
        if (volume === 0) {
          volume = n;
        } else if (openInterest === 0) {
          openInterest = n;
        }
      } else if (n > 0 && n < 500 && !Number.isInteger(n)) {
        // Premium (decimal, option price)
        if (premium === null) {
          premium = Math.round(n * 100);
        }
      } else if (n > 0 && n < 500 && iv === null && n !== volume && n !== openInterest) {
        // IV percentage
        iv = n / 100;
      }
    }
    
    if (volume > 50 && strike >= 10 && strike <= 2000) {
      options.push({
        ticker,
        option_type: optType,
        strike_price: strike,
        expiration_date: expDate,
        volume,
        open_interest: openInterest > 0 ? openInterest : null,
        implied_volatility: iv,
        premium,
        flow_type: null,
        sentiment: optType === 'call' ? 'bullish' : 'bearish',
        trade_date: new Date().toISOString(),
        metadata: {
          source: 'barchart_firecrawl',
          url: `https://www.barchart.com/stocks/quotes/${ticker}/options`,
          parsing_method: 'html_symbol',
          contract_symbol: fullSymbol,
          premium_available: premium !== null,
          iv_available: iv !== null,
          warnings: warnings.length > 0 ? warnings : undefined,
        }
      });
    }
  }
  
  console.log(`Barchart symbol parsing found ${options.length} contracts for ${ticker}`);
  
  // Strategy 2: If symbol parsing found nothing, try table row parsing
  if (options.length === 0) {
    console.log(`Trying fallback table parsing for ${ticker}...`);
    
    // Look for any row containing strike prices in SPY range (400-700)
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    
    while ((match = rowPattern.exec(html)) !== null) {
      const row = match[1];
      
      // Extract all numbers from cells
      const cellNumbers: number[] = [];
      const cellPattern = /<td[^>]*>([^<]*)<\/td>/gi;
      let cellMatch;
      
      while ((cellMatch = cellPattern.exec(row)) !== null) {
        const val = cellMatch[1].replace(/[$,%,\s]/g, '').replace(/,/g, '');
        const n = parseFloat(val);
        if (!isNaN(n) && n > 0) {
          cellNumbers.push(n);
        }
      }
      
      if (cellNumbers.length < 4) continue;
      
      // Find reasonable strike for the ticker
      let strike = 0;
      let volume = 0;
      
      const strikeRanges: Record<string, [number, number]> = {
        'SPY': [400, 700],
        'QQQ': [350, 600],
        'AAPL': [150, 300],
        'MSFT': [350, 500],
        'NVDA': [100, 200],
        'TSLA': [200, 500],
        'AMD': [100, 200],
        'META': [400, 700],
      };
      
      const [minStrike, maxStrike] = strikeRanges[ticker] || [50, 1000];
      
      for (const n of cellNumbers) {
        if (n >= minStrike && n <= maxStrike && strike === 0) {
          strike = n;
        } else if (n > 50 && n < 10000000 && Number.isInteger(n) && volume === 0) {
          volume = n;
        }
      }
      
      if (strike > 0 && volume > 50) {
        const isCall = row.toLowerCase().includes('call') || !row.toLowerCase().includes('put');
        
        options.push({
          ticker,
          option_type: isCall ? 'call' : 'put',
          strike_price: strike,
          expiration_date: pageExpiration,
          volume,
          open_interest: null,
          implied_volatility: null,
          premium: null,
          flow_type: null,
          sentiment: isCall ? 'bullish' : 'bearish',
          trade_date: new Date().toISOString(),
          metadata: {
            source: 'barchart_firecrawl',
            url: `https://www.barchart.com/stocks/quotes/${ticker}/options`,
            parsing_method: 'html_table',
            premium_available: false,
            iv_available: false,
            warnings: ['fallback_parsing'],
          }
        });
      }
    }
    
    console.log(`Barchart table fallback found ${options.length} contracts for ${ticker}`);
  }
  
  return options;
}

async function fetchOptionsViaFirecrawl(ticker: string, testMode: boolean = false): Promise<ParsedOption[]> {
  // Primary source: Barchart options page
  const barchartUrl = `https://www.barchart.com/stocks/quotes/${ticker}/options`;
  
  console.log(`Firecrawl scraping ${ticker} from Barchart...`);
  
  const result = await scrapeWithFirecrawl(barchartUrl, 8000);
  
  console.log(`Firecrawl ${ticker}: status=${result.status}, html_length=${result.html?.length || 0}`);
  
  if (result.html && result.html.length > 1000) {
    const options = parseBarchartOptionsHtml(result.html, ticker);
    
    // Test mode: log first 3 contracts
    if (testMode && options.length > 0) {
      console.log(`\n=== TEST MODE: First 3 contracts for ${ticker} ===`);
      for (let i = 0; i < Math.min(3, options.length); i++) {
        const opt = options[i];
        console.log(`  ${i+1}. strike=${opt.strike_price}, exp=${opt.expiration_date}, type=${opt.option_type}, vol=${opt.volume}, OI=${opt.open_interest || 'N/A'}`);
      }
      console.log(`=== END TEST MODE ===\n`);
    }
    
    console.log(`Firecrawl ${ticker}: parsed ${options.length} contracts (volume>50)`);
    
    // Limit to top 10 by volume
    const sorted = options.sort((a, b) => b.volume - a.volume).slice(0, 10);
    console.log(`Firecrawl ${ticker}: keeping top ${sorted.length} by volume`);
    
    return sorted;
  }
  
  // Fallback: CBOE delayed quotes
  console.log(`Barchart failed for ${ticker}, trying CBOE fallback...`);
  const cboeUrl = `https://www.cboe.com/delayed_quotes/${ticker}/quote_table`;
  
  const cboeResult = await scrapeWithFirecrawl(cboeUrl, 6000);
  
  console.log(`CBOE ${ticker}: status=${cboeResult.status}, html_length=${cboeResult.html?.length || 0}`);
  
  if (cboeResult.html && cboeResult.html.length > 1000) {
    // CBOE has simpler table structure
    const options = parseCboeOptionsHtml(cboeResult.html, ticker);
    
    if (testMode && options.length > 0) {
      console.log(`\n=== TEST MODE (CBOE): First 3 contracts for ${ticker} ===`);
      for (let i = 0; i < Math.min(3, options.length); i++) {
        const opt = options[i];
        console.log(`  ${i+1}. strike=${opt.strike_price}, exp=${opt.expiration_date}, type=${opt.option_type}, vol=${opt.volume}, OI=${opt.open_interest || 'N/A'}`);
      }
      console.log(`=== END TEST MODE ===\n`);
    }
    
    const sorted = options.sort((a, b) => b.volume - a.volume).slice(0, 10);
    return sorted;
  }
  
  console.log(`Both sources failed for ${ticker}`);
  return [];
}

function parseCboeOptionsHtml(html: string, ticker: string): ParsedOption[] {
  const options: ParsedOption[] = [];
  
  // Extract expiration from CBOE page
  let pageExpiration: string | null = null;
  const expMatch = html.match(/(\d{4}-\d{2}-\d{2})/) ||
                   html.match(/([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/);
  if (expMatch) {
    pageExpiration = parseExpirationFromText(expMatch[1]);
  }
  
  if (!pageExpiration) {
    const today = new Date();
    const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
    const nextFriday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
    pageExpiration = nextFriday.toISOString().split('T')[0];
  }
  
  // CBOE table pattern - simpler extraction
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];
    
    // Extract numbers
    const numbers: number[] = [];
    const numPattern = />[\s]*([0-9,]+\.?\d*)[\s]*</g;
    let numMatch;
    
    while ((numMatch = numPattern.exec(row)) !== null) {
      const n = parseFloat(numMatch[1].replace(/,/g, ''));
      if (!isNaN(n) && n > 0) {
        numbers.push(n);
      }
    }
    
    if (numbers.length < 3) continue;
    
    // Find strike (reasonable range) and volume
    let strike = 0;
    let volume = 0;
    
    for (const n of numbers) {
      if (n >= 10 && n <= 2000 && strike === 0) {
        strike = n;
      } else if (n > 50 && n < 10000000 && Number.isInteger(n) && volume === 0) {
        volume = n;
      }
    }
    
    if (strike === 0 || volume <= 50) continue;
    
    const isCall = row.toLowerCase().includes('call') || !row.toLowerCase().includes('put');
    
    options.push({
      ticker,
      option_type: isCall ? 'call' : 'put',
      strike_price: strike,
      expiration_date: pageExpiration,
      volume,
      open_interest: null,
      implied_volatility: null,
      premium: null,
      flow_type: null,
      sentiment: isCall ? 'bullish' : 'bearish',
      trade_date: new Date().toISOString(),
      metadata: {
        source: 'cboe_firecrawl',
        parsing_method: 'html',
        premium_available: false,
        iv_available: false,
      }
    });
  }
  
  return options;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const slackAlerter = new SlackAlerter();

  try {
    console.log('[v7] Options flow ingestion - Firecrawl browser scraping');
    
    const allOptions: ParsedOption[] = [];
    const tickers = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];
    
    // Parse request for test mode
    let testMode = false;
    let testTicker: string | null = null;
    try {
      const body = await req.json();
      testMode = body?.test === true;
      testTicker = body?.ticker || null;
    } catch {
      // No body or invalid JSON
    }
    
    // If test mode with specific ticker, only scrape that one
    if (testMode && testTicker) {
      console.log(`\n🧪 TEST MODE: Scraping only ${testTicker}`);
      const options = await fetchOptionsViaFirecrawl(testTicker, true);
      
      return new Response(JSON.stringify({
        success: true,
        test_mode: true,
        ticker: testTicker,
        contracts_found: options.length,
        sample_contracts: options.slice(0, 5).map(o => ({
          strike: o.strike_price,
          exp: o.expiration_date,
          type: o.option_type,
          volume: o.volume,
          oi: o.open_interest,
        })),
        version: 'v7_firecrawl',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // Full ingestion
    for (const ticker of tickers) {
      const options = await fetchOptionsViaFirecrawl(ticker, false);
      allOptions.push(...options);
      
      // Throttle between tickers to control Firecrawl cost (3 seconds)
      console.log(`Waiting 3s before next ticker...`);
      await new Promise(r => setTimeout(r, 3000));
    }
    
    console.log(`Total options found: ${allOptions.length}`);

    // If zero rows inserted, treat as failure and emit Slack alert
    if (allOptions.length === 0) {
      console.warn('⚠️ WARNING: No options data found - zero rows will be inserted');
      console.log('Possible reasons: pages blocked, parsing failed, or no options meet volume > 50 criteria');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Barchart via Firecrawl', 'CBOE via Firecrawl'],
        reason: 'No options data - scraping failed or no high-volume contracts found'
      });
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl_Barchart_CBOE',
        error_message: 'Zero rows inserted - no data available',
        metadata: { version: 'v7_firecrawl', reason: 'no_data_available' }
      });
      
      return new Response(JSON.stringify({ 
        success: true, 
        count: 0, 
        source: 'Firecrawl_Barchart_CBOE',
        version: 'v7_firecrawl',
        warning: 'No options data found - zero rows inserted'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert options data in batches of 50
    let inserted = 0;
    for (let i = 0; i < allOptions.length; i += 50) {
      const batch = allOptions.slice(i, i + 50);
      const { data, error } = await supabase.from('options_flow').insert(batch).select('id');
      if (error) {
        console.error('Insert error:', error.message);
      } else {
        inserted += (data?.length || 0);
      }
    }
    
    console.log(`✅ Inserted ${inserted} options records via Firecrawl`);

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow', 
      status: inserted > 0 ? 'success' : 'partial',
      rowsInserted: inserted, 
      rowsSkipped: allOptions.length - inserted, 
      sourceUsed: 'Firecrawl_Barchart_CBOE', 
      duration: Date.now() - startTime
    });

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: allOptions.length - inserted,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl_Barchart_CBOE',
      metadata: { version: 'v7_firecrawl', tickers_processed: tickers.length }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      count: inserted, 
      source: 'Firecrawl_Barchart_CBOE',
      version: 'v7_firecrawl',
      message: `Inserted ${inserted} options records from ${tickers.length} tickers`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
  } catch (error) {
    console.error('Error:', error);
    await slackAlerter.sendCriticalAlert({ 
      type: 'halted', 
      etlName: 'ingest-options-flow',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}` 
    });
    return new Response(JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
