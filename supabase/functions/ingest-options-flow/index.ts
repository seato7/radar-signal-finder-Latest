import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v9 - OCC symbol extraction from Barchart HTML via Firecrawl
// Extracts OCC option symbols (e.g., SPY241227C00590000) and nearby volume/OI data

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

interface OCCSymbolData {
  symbol: string;
  underlying: string;
  expiry: string; // YYYY-MM-DD
  option_type: 'call' | 'put';
  strike: number;
  volume: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
  lastPrice: number | null;
  windowSnippet?: string; // For debug mode
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
        waitFor: 4000, // 4 seconds for JS render
        onlyMainContent: false, // Keep script tags and full HTML
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

// Parse OCC option symbol: TICKER + YYMMDD + C/P + SSSSS000 (strike * 1000)
function parseOCCSymbol(symbol: string): { underlying: string; expiry: string; option_type: 'call' | 'put'; strike: number } | null {
  // Pattern: 1-6 letters + 6 digits (YYMMDD) + C/P + 8 digits
  const match = symbol.toUpperCase().match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!match) return null;

  const underlying = match[1];
  const dateStr = match[2]; // YYMMDD
  const optType = match[3] === 'C' ? 'call' : 'put';
  const strikeRaw = parseInt(match[4]); // Strike * 1000
  const strike = strikeRaw / 1000;

  // Parse expiration date
  const year = 2000 + parseInt(dateStr.slice(0, 2));
  const month = dateStr.slice(2, 4);
  const day = dateStr.slice(4, 6);
  const expiry = `${year}-${month}-${day}`;

  return { underlying, expiry, option_type: optType, strike };
}

// Extract numeric values from text window around symbol
function extractDataFromWindow(window: string): { volume: number | null; openInterest: number | null; iv: number | null; price: number | null } {
  let volume: number | null = null;
  let openInterest: number | null = null;
  let iv: number | null = null;
  let price: number | null = null;

  // Look for volume patterns
  const volumePatterns = [
    /["']?volume["']?\s*[:\=]\s*["']?([0-9,]+)["']?/i,
    /\bvol\b[:\s]*([0-9,]+)/i,
    /Volume[:\s]*([0-9,]+)/i,
    />([0-9,]+)<\/(?:td|span)[^>]*>\s*<(?:td|span)[^>]*>([0-9,]+)</i, // table cells
  ];
  
  for (const pattern of volumePatterns) {
    const match = window.match(pattern);
    if (match) {
      const val = parseInt(match[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && val < 100000000) {
        volume = val;
        break;
      }
    }
  }

  // Look for open interest patterns
  const oiPatterns = [
    /["']?openInterest["']?\s*[:\=]\s*["']?([0-9,]+)["']?/i,
    /open\s*interest[:\s]*([0-9,]+)/i,
    /\bOI\b[:\s]*([0-9,]+)/i,
  ];
  
  for (const pattern of oiPatterns) {
    const match = window.match(pattern);
    if (match) {
      const val = parseInt(match[1].replace(/,/g, ''));
      if (!isNaN(val) && val >= 0 && val < 100000000) {
        openInterest = val;
        break;
      }
    }
  }

  // Look for IV patterns
  const ivPatterns = [
    /["']?(?:impliedVolatility|iv)["']?\s*[:\=]\s*["']?([0-9.]+)["']?/i,
    /\bIV\b[:\s]*([0-9.]+)%?/i,
    /implied\s*vol(?:atility)?[:\s]*([0-9.]+)/i,
  ];
  
  for (const pattern of ivPatterns) {
    const match = window.match(pattern);
    if (match) {
      let val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0) {
        // Convert percentage to decimal if > 1
        if (val > 1) val = val / 100;
        if (val < 5) { // Reasonable IV range 0-500%
          iv = val;
          break;
        }
      }
    }
  }

  // Look for price patterns
  const pricePatterns = [
    /["']?(?:lastPrice|last|mark|midpoint)["']?\s*[:\=]\s*["']?([0-9.]+)["']?/i,
    /\$([0-9.]+)/,
    /Last[:\s]*([0-9.]+)/i,
  ];
  
  for (const pattern of pricePatterns) {
    const match = window.match(pattern);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0 && val < 10000) { // Reasonable option price
        price = val;
        break;
      }
    }
  }

  return { volume, openInterest, iv, price };
}

function extractOCCSymbolsFromHtml(html: string, ticker: string, debug: boolean): OCCSymbolData[] {
  const results: OCCSymbolData[] = [];
  const seenSymbols = new Set<string>();

  // OCC symbol regex - case insensitive
  // Pattern: 1-6 letters + 6 digits (YYMMDD) + C or P + 8 digits
  const occPattern = new RegExp(`\\b([A-Za-z]{1,6})(\\d{6})([CcPp])(\\d{8})\\b`, 'g');
  
  let match;
  let matchCount = 0;
  const debugMatches: { symbol: string; window: string }[] = [];
  
  while ((match = occPattern.exec(html)) !== null) {
    const symbol = match[0].toUpperCase();
    const underlying = match[1].toUpperCase();
    
    // Filter to only our target ticker
    if (underlying !== ticker.toUpperCase()) continue;
    
    // Skip duplicates
    if (seenSymbols.has(symbol)) continue;
    seenSymbols.add(symbol);
    matchCount++;
    
    // Parse the OCC symbol
    const parsed = parseOCCSymbol(symbol);
    if (!parsed) continue;
    
    // Get a window around the match to find volume/OI/IV/price
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const windowStart = Math.max(0, matchStart - 400);
    const windowEnd = Math.min(html.length, matchEnd + 400);
    const window = html.slice(windowStart, windowEnd);
    
    // Collect debug info for first few matches
    if (debug && debugMatches.length < 3) {
      const shortWindow = html.slice(Math.max(0, matchStart - 150), Math.min(html.length, matchEnd + 150));
      debugMatches.push({ symbol, window: shortWindow });
    }
    
    // Extract numeric data from the window
    const { volume, openInterest, iv, price } = extractDataFromWindow(window);
    
    results.push({
      symbol,
      underlying: parsed.underlying,
      expiry: parsed.expiry,
      option_type: parsed.option_type,
      strike: parsed.strike,
      volume,
      openInterest,
      impliedVolatility: iv,
      lastPrice: price,
    });
  }
  
  // Debug logging
  if (debug && ticker === 'SPY') {
    console.log(`[DEBUG] ${ticker}: html_length=${html.length}`);
    console.log(`[DEBUG] ${ticker}: occ_symbols_found=${matchCount}`);
    
    const uniqueSymbols = [...seenSymbols].slice(0, 10);
    console.log(`[DEBUG] ${ticker}: first_10_symbols=${JSON.stringify(uniqueSymbols)}`);
    
    for (let i = 0; i < debugMatches.length; i++) {
      console.log(`[DEBUG] ${ticker}: match_${i+1}_symbol=${debugMatches[i].symbol}`);
      console.log(`[DEBUG] ${ticker}: match_${i+1}_window=${debugMatches[i].window.replace(/\n/g, ' ').slice(0, 300)}`);
    }
  }
  
  return results;
}

function convertToInsertableOption(data: OCCSymbolData): ParsedOption | null {
  // Only insert if volume found and > 50
  if (data.volume === null || data.volume <= 50) {
    return null;
  }
  
  // Validate strike is reasonable
  if (data.strike <= 0 || data.strike > 10000) {
    return null;
  }
  
  // Calculate premium if price available
  let premium: number | null = null;
  if (data.lastPrice && data.lastPrice > 0) {
    premium = Math.round(data.lastPrice * data.volume * 100);
  }
  
  const missingFields: string[] = [];
  if (data.openInterest === null) missingFields.push('openInterest');
  if (data.impliedVolatility === null) missingFields.push('iv');
  if (data.lastPrice === null) missingFields.push('price');
  
  return {
    ticker: data.underlying,
    option_type: data.option_type,
    strike_price: data.strike,
    expiration_date: data.expiry,
    volume: data.volume,
    open_interest: data.openInterest,
    implied_volatility: data.impliedVolatility,
    premium,
    flow_type: null,
    sentiment: data.option_type === 'call' ? 'bullish' : 'bearish',
    trade_date: new Date().toISOString(),
    metadata: {
      source: 'barchart_firecrawl_occ',
      occ_symbol: data.symbol,
      premium_available: premium !== null,
      iv_available: data.impliedVolatility !== null,
      oi_available: data.openInterest !== null,
      missing_fields: missingFields.length > 0 ? missingFields : undefined,
    }
  };
}

interface FetchResult {
  options: ParsedOption[];
  stats: {
    html_length: number;
    occ_symbols_found: number;
    contracts_with_volume_found: number;
    contracts_inserted: number;
    error: string | null;
  };
}

async function fetchOptionsViaFirecrawl(ticker: string, debug: boolean): Promise<FetchResult> {
  const stats = {
    html_length: 0,
    occ_symbols_found: 0,
    contracts_with_volume_found: 0,
    contracts_inserted: 0,
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
  
  // Extract OCC symbols from HTML
  const occData = extractOCCSymbolsFromHtml(result.html, ticker, debug);
  stats.occ_symbols_found = occData.length;
  
  console.log(`${ticker}: Found ${occData.length} OCC symbols`);
  
  if (occData.length === 0) {
    stats.error = 'no OCC symbols found in HTML; site may be rendering data via XHR';
    return { options: [], stats };
  }
  
  // Count how many have volume
  const withVolume = occData.filter(d => d.volume !== null && d.volume > 0);
  stats.contracts_with_volume_found = withVolume.length;
  
  console.log(`${ticker}: ${withVolume.length} symbols have volume data`);
  
  // Convert to insertable options (applies volume > 50 filter)
  const options: ParsedOption[] = [];
  for (const data of occData) {
    const opt = convertToInsertableOption(data);
    if (opt) {
      options.push(opt);
    }
  }
  
  console.log(`${ticker}: ${options.length} contracts passed volume>50 filter`);
  
  // Sort by volume desc and take top 10
  const sorted = options.sort((a, b) => b.volume - a.volume).slice(0, 10);
  stats.contracts_inserted = sorted.length;
  
  // Add debug stats to metadata
  for (const opt of sorted) {
    opt.metadata.debug = {
      occ_symbols_found: stats.occ_symbols_found,
      contracts_with_volume_found: stats.contracts_with_volume_found,
      contracts_inserted: stats.contracts_inserted,
    };
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
    console.log('[v9] Options flow ingestion - OCC symbol extraction from Barchart HTML');
    
    // Parse request body for custom tickers and debug mode
    let tickers = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];
    let debug = false;
    
    try {
      const body = await req.json();
      if (body?.tickers && Array.isArray(body.tickers) && body.tickers.length > 0) {
        tickers = body.tickers;
        console.log(`Using custom tickers: ${tickers.join(', ')}`);
      }
      if (body?.debug === true) {
        debug = true;
        console.log('[DEBUG MODE ENABLED]');
      }
    } catch {
      // No body or invalid JSON, use defaults
    }
    
    const allOptions: ParsedOption[] = [];
    const allStats: Record<string, any> = {};
    
    for (const ticker of tickers) {
      const { options, stats } = await fetchOptionsViaFirecrawl(ticker, debug);
      allOptions.push(...options);
      allStats[ticker] = stats;
      
      // Throttle between tickers (500ms)
      if (tickers.indexOf(ticker) < tickers.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    // Aggregate stats
    const totalOccSymbols = Object.values(allStats).reduce((sum: number, s: any) => sum + (s.occ_symbols_found || 0), 0);
    const totalWithVolume = Object.values(allStats).reduce((sum: number, s: any) => sum + (s.contracts_with_volume_found || 0), 0);
    const totalToInsert = allOptions.length;
    
    console.log(`Total: ${totalOccSymbols} OCC symbols found, ${totalWithVolume} have volume, ${totalToInsert} to insert`);

    // Handle zero rows case
    if (allOptions.length === 0) {
      console.warn('⚠️ No options data to insert');
      
      let reason = '';
      if (totalOccSymbols === 0) {
        reason = 'no OCC symbols found in HTML; site may be rendering data via XHR';
      } else if (totalWithVolume === 0) {
        reason = 'symbols found but volume not extractable from HTML';
      } else {
        reason = `symbols found but none passed volume>50 filter (${totalWithVolume} had volume)`;
      }
      
      const extractionSummary = Object.entries(allStats)
        .map(([t, s]: [string, any]) => `${t}:${s.occ_symbols_found}occ/${s.contracts_with_volume_found}vol`)
        .join(', ');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Barchart via Firecrawl OCC'],
        reason: `${reason} | ${extractionSummary}`
      });
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: totalWithVolume,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl_Barchart_OCC',
        error_message: reason,
        metadata: { 
          version: 'v9_occ_extraction',
          reason,
          occ_symbols_found: totalOccSymbols,
          contracts_with_volume_found: totalWithVolume,
          tickers,
          per_ticker: allStats,
          debug_mode: debug
        }
      });
      
      return new Response(JSON.stringify({ 
        success: true, 
        count: 0,
        source: 'Firecrawl_Barchart_OCC',
        version: 'v9_occ_extraction',
        debug_mode: debug,
        stats: { 
          occ_symbols_found: totalOccSymbols,
          contracts_with_volume_found: totalWithVolume,
          tickers_processed: tickers.length
        },
        per_ticker: allStats,
        reason,
        message: 'No options met criteria'
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
      sourceUsed: 'Firecrawl_Barchart_OCC', 
      duration: Date.now() - startTime
    });

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: totalWithVolume - inserted,
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl_Barchart_OCC',
      metadata: { 
        version: 'v9_occ_extraction',
        occ_symbols_found: totalOccSymbols,
        contracts_with_volume_found: totalWithVolume,
        tickers_processed: tickers.length,
        debug_mode: debug
      }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      count: inserted, 
      source: 'Firecrawl_Barchart_OCC',
      version: 'v9_occ_extraction',
      debug_mode: debug,
      stats: {
        occ_symbols_found: totalOccSymbols,
        contracts_with_volume_found: totalWithVolume,
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
