import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v8 - Firecrawl + embedded JSON extraction from Barchart
// Extracts __NEXT_DATA__ or PRELOADED_STATE JSON instead of HTML table parsing

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

interface ExtractionResult {
  method: '__NEXT_DATA__' | 'PRELOADED_STATE' | 'other_json' | 'none';
  json: any;
  error?: string;
}

async function scrapeWithFirecrawl(url: string): Promise<{ html: string | null; status: number; error?: string }> {
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
        waitFor: 4000, // 4 seconds - balanced for JS render without timeout
        onlyMainContent: false, // Keep script tags
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

function extractJsonFromHtml(html: string, ticker: string): ExtractionResult {
  // Log what patterns exist for debugging
  const hasNextData = html.includes('__NEXT_DATA__');
  const hasPreloaded = html.includes('__PRELOADED_STATE__');
  const hasDataModule = html.includes('data-ng-') || html.includes('ng-init');
  const hasVueData = html.includes('__NUXT__') || html.includes('__VUE__');
  console.log(`${ticker} patterns: NEXT=${hasNextData}, PRELOADED=${hasPreloaded}, Angular=${hasDataModule}, Vue=${hasVueData}`);

  // Priority 1: __NEXT_DATA__ script tag
  const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch && nextDataMatch[1]) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      console.log(`Extracted __NEXT_DATA__ JSON, size=${nextDataMatch[1].length}`);
      return { method: '__NEXT_DATA__', json };
    } catch (e) {
      console.log(`__NEXT_DATA__ parse failed: ${e}`);
    }
  }

  // Priority 2: window.__PRELOADED_STATE__
  const preloadedMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|window\.)/);
  if (preloadedMatch && preloadedMatch[1]) {
    try {
      const json = JSON.parse(preloadedMatch[1]);
      console.log(`Extracted PRELOADED_STATE JSON, size=${preloadedMatch[1].length}`);
      return { method: 'PRELOADED_STATE', json };
    } catch (e) {
      console.log(`PRELOADED_STATE parse failed: ${e}`);
    }
  }

  // Priority 3: Barchart-specific patterns - look for data-ng-init with JSON
  const ngInitMatch = html.match(/data-ng-init="[^"]*optionsData\s*=\s*(\{[\s\S]*?\})\s*[;"]?/);
  if (ngInitMatch && ngInitMatch[1]) {
    try {
      // Angular escapes quotes, need to unescape
      const unescaped = ngInitMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const json = JSON.parse(unescaped);
      console.log(`Extracted ng-init JSON, size=${ngInitMatch[1].length}`);
      return { method: 'other_json', json };
    } catch (e) {
      console.log(`ng-init parse failed: ${e}`);
    }
  }

  // Priority 4: Look for bc-options-table or similar data attributes with JSON
  const bcDataMatch = html.match(/data-options="([^"]+)"/i) || 
                      html.match(/data-options-chain="([^"]+)"/i) ||
                      html.match(/data-symbol-data="([^"]+)"/i);
  if (bcDataMatch && bcDataMatch[1]) {
    try {
      const decoded = bcDataMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const json = JSON.parse(decoded);
      console.log(`Extracted data-attribute JSON, size=${bcDataMatch[1].length}`);
      return { method: 'other_json', json };
    } catch (e) {
      console.log(`data-attribute parse failed: ${e}`);
    }
  }

  // Priority 5: Extract data from HTML table directly (Barchart renders options as table)
  // Look for table rows with options data
  const tableData = extractFromBarchartTable(html, ticker);
  if (tableData.length > 0) {
    console.log(`Extracted ${tableData.length} options from HTML table`);
    return { method: 'other_json', json: { options: tableData } };
  }

  // Priority 6: Any large inline script with optionsData
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    const content = match[1];
    // Look for options-related data
    if (content.includes('options') && content.includes('strike')) {
      // Try to extract JSON object
      const jsonMatch = content.match(/\{[\s\S]*?"strike"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const json = JSON.parse(jsonMatch[0]);
          console.log(`Extracted inline script JSON with strike data`);
          return { method: 'other_json', json };
        } catch { }
      }
    }
  }

  return { method: 'none', json: null, error: 'No extractable JSON found in HTML' };
}

function extractFromBarchartTable(html: string, ticker: string): any[] {
  const options: any[] = [];
  
  // Barchart options page has two tables: Calls and Puts
  // Each row typically has: Symbol, Last, Change, Bid, Ask, Volume, OI, IV
  
  // Find option rows - look for rows containing option symbols like SPY250103C00590000
  const symbolPattern = new RegExp(`(${ticker})(\\d{6})([CP])(\\d{8})`, 'g');
  const matches = html.matchAll(symbolPattern);
  const seenSymbols = new Set<string>();
  
  for (const match of matches) {
    const symbol = match[0].toUpperCase();
    if (seenSymbols.has(symbol)) continue;
    seenSymbols.add(symbol);
    
    // Parse the symbol: TICKER + YYMMDD + C/P + SSSSS000 (strike * 1000)
    const dateStr = match[2]; // YYMMDD
    const optType = match[3].toUpperCase() === 'C' ? 'call' : 'put';
    const strikeRaw = parseInt(match[4]); // Strike * 1000
    const strike = strikeRaw / 1000;
    
    // Parse expiration date
    const year = 2000 + parseInt(dateStr.slice(0, 2));
    const month = dateStr.slice(2, 4);
    const day = dateStr.slice(4, 6);
    const expDate = `${year}-${month}-${day}`;
    
    // Find the table row containing this symbol to extract volume/OI
    const symbolIndex = html.indexOf(symbol);
    const rowStart = html.lastIndexOf('<tr', symbolIndex);
    const rowEnd = html.indexOf('</tr>', symbolIndex);
    
    if (rowStart >= 0 && rowEnd >= 0) {
      const rowHtml = html.slice(rowStart, rowEnd + 5);
      
      // Extract numeric values from table cells
      const cellPattern = /<td[^>]*>[\s]*([0-9,]+(?:\.\d+)?)[\s]*<\/td>/gi;
      const numbers: number[] = [];
      let cellMatch;
      
      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        const n = parseFloat(cellMatch[1].replace(/,/g, ''));
        if (!isNaN(n) && n >= 0) {
          numbers.push(n);
        }
      }
      
      // Also try matching numbers not in td tags (some might be in spans)
      const spanPattern = />([0-9,]+(?:\.\d+)?)</g;
      while ((cellMatch = spanPattern.exec(rowHtml)) !== null) {
        const n = parseFloat(cellMatch[1].replace(/,/g, ''));
        if (!isNaN(n) && n >= 0 && !numbers.includes(n)) {
          numbers.push(n);
        }
      }
      
      // Barchart column order: Last, Change, Bid, Ask, Volume, OI, IV
      // We need Volume (usually 5th number after strike-like numbers are filtered)
      // Filter out strike (which matches our extracted strike)
      const nonStrikeNumbers = numbers.filter(n => Math.abs(n - strike) > 0.5);
      
      // Find volume: should be a larger integer
      let volume = 0;
      let openInterest = 0;
      let lastPrice = 0;
      let iv = 0;
      
      for (const n of nonStrikeNumbers) {
        if (n > 0 && n < 100 && lastPrice === 0) {
          lastPrice = n; // Option prices typically < $100
        } else if (n >= 50 && n < 100000000 && Number.isInteger(n)) {
          if (volume === 0) {
            volume = n;
          } else if (openInterest === 0) {
            openInterest = n;
          }
        } else if (n > 0 && n < 500 && n !== lastPrice) {
          // IV as percentage
          if (iv === 0 && n > 1) {
            iv = n;
          }
        }
      }
      
      if (volume > 50 && strike > 10 && strike < 10000) {
        options.push({
          symbol,
          strike,
          strikePrice: strike,
          expiration: expDate,
          expirationDate: expDate,
          optionType: optType,
          type: optType,
          volume,
          openInterest,
          impliedVolatility: iv > 0 ? iv / 100 : null,
          lastPrice,
          last: lastPrice,
        });
      }
    }
  }
  
  console.log(`Table extraction found ${options.length} options with volume > 50 for ${ticker}`);
  return options;
}

function findOptionsInJson(json: any, ticker: string): any[] {
  // Helper to recursively search for options data
  const options: any[] = [];
  
  function searchObject(obj: any, depth: number = 0): void {
    if (depth > 10 || !obj) return;
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        // Check if item looks like an option contract
        if (item && typeof item === 'object') {
          const hasStrike = 'strike' in item || 'strikePrice' in item || 'Strike' in item;
          const hasVolume = 'volume' in item || 'Volume' in item || 'totalVolume' in item;
          const hasType = 'optionType' in item || 'type' in item || 'callPut' in item || 'putCall' in item;
          
          if (hasStrike && (hasVolume || hasType)) {
            options.push(item);
          } else {
            searchObject(item, depth + 1);
          }
        }
      }
    } else if (typeof obj === 'object') {
      // Check common container keys
      const optionKeys = ['options', 'calls', 'puts', 'optionChain', 'data', 'items', 'contracts'];
      
      for (const key of Object.keys(obj)) {
        if (optionKeys.includes(key.toLowerCase())) {
          searchObject(obj[key], depth + 1);
        }
      }
      
      // Also check if this object itself is an option
      const hasStrike = 'strike' in obj || 'strikePrice' in obj || 'Strike' in obj;
      const hasVolume = 'volume' in obj || 'Volume' in obj || 'totalVolume' in obj;
      
      if (hasStrike && hasVolume) {
        options.push(obj);
      } else {
        for (const value of Object.values(obj)) {
          if (typeof value === 'object') {
            searchObject(value, depth + 1);
          }
        }
      }
    }
  }
  
  searchObject(json);
  return options;
}

function normalizeOption(rawOpt: any, ticker: string): ParsedOption | null {
  try {
    // Extract strike price
    const strike = rawOpt.strike || rawOpt.strikePrice || rawOpt.Strike || 
                   rawOpt.strike_price || parseFloat(rawOpt.strikeDisplay);
    if (!strike || strike <= 0 || strike > 10000) return null;
    
    // Extract volume
    const volume = rawOpt.volume || rawOpt.Volume || rawOpt.totalVolume || 
                   rawOpt.tradeVolume || parseInt(rawOpt.volumeDisplay?.replace(/,/g, ''));
    if (!volume || volume <= 50) return null; // Volume filter
    
    // Extract option type
    let optionType = 'call';
    const typeVal = rawOpt.optionType || rawOpt.type || rawOpt.callPut || rawOpt.putCall || '';
    if (typeof typeVal === 'string') {
      optionType = typeVal.toLowerCase().includes('put') || typeVal === 'P' ? 'put' : 'call';
    }
    
    // Extract expiration
    let expiration: string | null = null;
    const expVal = rawOpt.expiration || rawOpt.expirationDate || rawOpt.expiry || 
                   rawOpt.expiryDate || rawOpt.Expiration;
    if (expVal) {
      if (typeof expVal === 'number') {
        // Unix timestamp
        expiration = new Date(expVal * (expVal > 1e12 ? 1 : 1000)).toISOString().split('T')[0];
      } else if (typeof expVal === 'string') {
        // Try to parse date string
        const d = new Date(expVal);
        if (!isNaN(d.getTime())) {
          expiration = d.toISOString().split('T')[0];
        } else {
          // Try YYMMDD format
          const match = expVal.match(/(\d{2})(\d{2})(\d{2})/);
          if (match) {
            expiration = `20${match[1]}-${match[2]}-${match[3]}`;
          }
        }
      }
    }
    
    // Extract open interest
    const openInterest = rawOpt.openInterest || rawOpt.OpenInterest || rawOpt.oi || 
                         rawOpt.open_interest || parseInt(rawOpt.openInterestDisplay?.replace(/,/g, '')) || null;
    
    // Extract IV
    let iv = rawOpt.impliedVolatility || rawOpt.iv || rawOpt.IV || rawOpt.impliedVol || null;
    if (iv && iv > 10) iv = iv / 100; // Convert percentage to decimal if needed
    
    // Extract price for premium calculation
    const price = rawOpt.lastPrice || rawOpt.last || rawOpt.mark || rawOpt.midpoint || 
                  rawOpt.price || rawOpt.Last || null;
    
    // Premium as notional: price * volume * 100 (for contracts)
    let premium: number | null = null;
    if (price && price > 0) {
      premium = Math.round(price * volume * 100);
    }
    
    return {
      ticker,
      option_type: optionType,
      strike_price: strike,
      expiration_date: expiration,
      volume,
      open_interest: openInterest,
      implied_volatility: iv,
      premium,
      flow_type: null,
      sentiment: optionType === 'call' ? 'bullish' : 'bearish',
      trade_date: new Date().toISOString(),
      metadata: {
        source: 'barchart_firecrawl_json',
        premium_available: premium !== null,
        iv_available: iv !== null,
        raw_symbol: rawOpt.symbol || rawOpt.Symbol || rawOpt.contractSymbol || null,
      }
    };
  } catch (e) {
    return null;
  }
}

async function fetchOptionsViaFirecrawl(ticker: string): Promise<{ options: ParsedOption[]; stats: any }> {
  const stats = {
    html_length: 0,
    extraction_method: 'none' as string,
    contracts_found: 0,
    contracts_passing_filter: 0,
    error: null as string | null,
  };

  const url = `https://www.barchart.com/stocks/quotes/${ticker}/options`;
  console.log(`Scraping ${ticker} from ${url}...`);
  
  const result = await scrapeWithFirecrawl(url);
  stats.html_length = result.html?.length || 0;
  
  console.log(`Firecrawl ${ticker}: status=${result.status}, html_length=${stats.html_length}`);
  
  if (!result.html || result.html.length < 5000) {
    stats.error = result.error || 'HTML too short or missing';
    return { options: [], stats };
  }
  
  // Extract JSON from HTML
  const extraction = extractJsonFromHtml(result.html, ticker);
  stats.extraction_method = extraction.method;
  
  if (extraction.method === 'none' || !extraction.json) {
    stats.error = extraction.error || 'No JSON extracted';
    console.log(`${ticker}: ${stats.error}`);
    return { options: [], stats };
  }
  
  console.log(`${ticker}: Extracted JSON via ${extraction.method}`);
  
  // Find options in the JSON structure
  let rawOptions = findOptionsInJson(extraction.json, ticker);
  
  // If extraction was from table, options are already in extraction.json.options
  if (rawOptions.length === 0 && extraction.json?.options) {
    rawOptions = extraction.json.options;
    console.log(`${ticker}: Using pre-extracted table options: ${rawOptions.length}`);
  }
  
  stats.contracts_found = rawOptions.length;
  
  console.log(`${ticker}: Found ${rawOptions.length} raw option contracts in JSON`);
  
  if (rawOptions.length === 0) {
    // Log some JSON structure for debugging
    const keys = Object.keys(extraction.json || {}).slice(0, 10);
    console.log(`${ticker}: Top-level JSON keys: ${keys.join(', ')}`);
  }
  
  // Normalize and filter options
  const options: ParsedOption[] = [];
  for (const raw of rawOptions) {
    const normalized = normalizeOption(raw, ticker);
    if (normalized) {
      options.push(normalized);
    }
  }
  
  stats.contracts_passing_filter = options.length;
  console.log(`${ticker}: ${options.length} contracts passed volume>50 filter`);
  
  // Keep top 10 by volume
  const sorted = options.sort((a, b) => b.volume - a.volume).slice(0, 10);
  
  // Add extraction method to metadata
  for (const opt of sorted) {
    opt.metadata.extraction = extraction.method;
  }
  
  return { options: sorted, stats };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const slackAlerter = new SlackAlerter();

  try {
    console.log('[v8] Options flow ingestion - Firecrawl + JSON extraction');
    
    // Parse request body for custom tickers
    let tickers = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];
    try {
      const body = await req.json();
      if (body?.tickers && Array.isArray(body.tickers) && body.tickers.length > 0) {
        tickers = body.tickers;
        console.log(`Using custom tickers: ${tickers.join(', ')}`);
      }
    } catch {
      // No body or invalid JSON, use defaults
    }
    
    const allOptions: ParsedOption[] = [];
    const allStats: Record<string, any> = {};
    
    for (const ticker of tickers) {
      const { options, stats } = await fetchOptionsViaFirecrawl(ticker);
      allOptions.push(...options);
      allStats[ticker] = stats;
      
      // Throttle between tickers (400ms minimum)
      if (tickers.indexOf(ticker) < tickers.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    // Aggregate stats
    const totalFound = Object.values(allStats).reduce((sum: number, s: any) => sum + (s.contracts_found || 0), 0);
    const totalPassing = Object.values(allStats).reduce((sum: number, s: any) => sum + (s.contracts_passing_filter || 0), 0);
    
    console.log(`Total: ${totalFound} contracts found, ${totalPassing} passed volume filter, ${allOptions.length} to insert`);

    // Handle zero rows case
    if (allOptions.length === 0) {
      console.warn('⚠️ No options data to insert');
      
      const extractionSummary = Object.entries(allStats)
        .map(([t, s]: [string, any]) => `${t}:${s.extraction_method}(${s.contracts_found}→${s.contracts_passing_filter})`)
        .join(', ');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Barchart via Firecrawl JSON'],
        reason: `No data: ${extractionSummary} | tickers: ${tickers.join(',')} | found: ${totalFound}, passed: ${totalPassing}`
      });
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: totalFound - totalPassing,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl_Barchart_JSON',
        error_message: 'Zero rows inserted',
        metadata: { 
          version: 'v8_json_extraction',
          reason: 'no_data',
          contracts_found: totalFound,
          contracts_passed_filter: totalPassing,
          tickers,
          per_ticker: allStats
        }
      });
      
      return new Response(JSON.stringify({ 
        success: true, 
        count: 0,
        source: 'Firecrawl_Barchart_JSON',
        version: 'v8_json_extraction',
        stats: { 
          contracts_found: totalFound,
          contracts_passed_filter: totalPassing,
          tickers_processed: tickers.length
        },
        per_ticker: allStats,
        message: 'No options met volume>50 criteria'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert in batches of 50
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
    
    console.log(`✅ Inserted ${inserted} options records`);

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow', 
      status: inserted > 0 ? 'success' : 'partial',
      rowsInserted: inserted, 
      rowsSkipped: allOptions.length - inserted, 
      sourceUsed: 'Firecrawl_Barchart_JSON', 
      duration: Date.now() - startTime
    });

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: totalFound - inserted,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl_Barchart_JSON',
      metadata: { 
        version: 'v8_json_extraction',
        contracts_found: totalFound,
        contracts_passed_filter: totalPassing,
        tickers_processed: tickers.length
      }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      count: inserted, 
      source: 'Firecrawl_Barchart_JSON',
      version: 'v8_json_extraction',
      stats: {
        contracts_found: totalFound,
        contracts_passed_filter: totalPassing,
        tickers_processed: tickers.length
      },
      message: `Inserted ${inserted} options records`
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
