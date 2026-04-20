// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v5 - Firecrawl HTML scraping of ETF flow leaders table
// Scrapes HTML and parses table rows to extract ticker and net flow values

interface ETFFlowData {
  ticker: string;
  net_flow: number;
  source: string;
}

// Parse ETF flow leaders table from HTML using Firecrawl
async function scrapeETFFlowsHTML(): Promise<ETFFlowData[]> {
  const results: ETFFlowData[] = [];
  
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!firecrawlKey) {
    console.log('FIRECRAWL_API_KEY not configured, falling back to Yahoo Finance');
    return await fetchYahooFinanceFlows();
  }
  
  try {
    // Scrape etfdb.com ETF fund flows page with HTML format
    const url = 'https://etfdb.com/compare/market-cap/';
    
    console.log(`Scraping ETF flows from ${url} with Firecrawl HTML...`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['html'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.log(`Firecrawl error: ${response.status}`);
      return await fetchYahooFinanceFlows();
    }
    
    const data = await response.json();
    const html = data?.data?.html || data?.html || '';
    
    if (!html) {
      console.log('No HTML content returned from Firecrawl');
      return await fetchYahooFinanceFlows();
    }
    
    console.log(`Received HTML (${html.length} chars), parsing table rows...`);
    
    // Parse HTML table rows for ETF data
    // Look for rows with ticker and flow values
    const tickerPattern = /<a[^>]*href="[^"]*\/etf\/([A-Z]+)\/?[^"]*"[^>]*>/gi;
    const matches = [...html.matchAll(tickerPattern)];
    
    const seenTickers = new Set<string>();
    
    for (const match of matches) {
      const ticker = match[1]?.toUpperCase();
      if (!ticker || seenTickers.has(ticker)) continue;
      seenTickers.add(ticker);
      
      // Look for associated flow/AUM data near this ticker in the HTML
      // Extract numeric values from nearby table cells
      const tickerIndex = match.index || 0;
      const contextStart = Math.max(0, tickerIndex - 100);
      const contextEnd = Math.min(html.length, tickerIndex + 500);
      const context = html.slice(contextStart, contextEnd);
      
      // Look for dollar amounts (flow values)
      const dollarPattern = /\$[\d,]+\.?\d*\s*[BMK]?|\(?\$[\d,]+\.?\d*\s*[BMK]?\)?/gi;
      const dollarMatches = [...context.matchAll(dollarPattern)];
      
      if (dollarMatches.length > 0) {
        // Parse the first dollar value as a flow indicator
        const dollarStr = dollarMatches[0][0].replace(/[()$,\s]/g, '');
        let flowValue = parseFloat(dollarStr) || 0;
        
        // Handle B/M/K suffixes
        if (dollarStr.includes('B')) flowValue *= 1000;
        else if (dollarStr.includes('M')) flowValue *= 1;
        else if (dollarStr.includes('K')) flowValue *= 0.001;
        else flowValue = flowValue / 1000000; // Assume raw number is in dollars
        
        // Check if negative (in parentheses)
        if (dollarMatches[0][0].includes('(')) {
          flowValue = -Math.abs(flowValue);
        }
        
        if (Math.abs(flowValue) > 0.01) {
          results.push({
            ticker,
            net_flow: Math.round(flowValue * 100) / 100,
            source: 'ETFdb_Firecrawl'
          });
          console.log(`✅ ${ticker}: $${flowValue.toFixed(2)}M flow`);
        }
      }
      
      // Limit to top 20 ETFs
      if (results.length >= 20) break;
    }
    
    // If we got some data, return it
    if (results.length > 0) {
      return results;
    }
    
    // If HTML parsing didn't yield results, fallback to Yahoo
    console.log('HTML parsing yielded no results, falling back to Yahoo Finance');
    return await fetchYahooFinanceFlows();
    
  } catch (error) {
    console.error('ETF flow scraping error:', error);
    return await fetchYahooFinanceFlows();
  }
}

// Fallback: fetch ETF data from Yahoo Finance (volume-based proxy)
async function fetchYahooFinanceFlows(): Promise<ETFFlowData[]> {
  const results: ETFFlowData[] = [];
  
  const majorETFs = [
    'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLK', 
    'XLE', 'XLV', 'GLD', 'TLT', 'HYG', 'EEM', 'VEA'
  ];
  
  console.log(`Fetching Yahoo Finance data for ${majorETFs.length} ETFs...`);
  
  for (const ticker of majorETFs) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      
      const meta = result.meta;
      const indicators = result.indicators?.quote?.[0];
      if (!indicators?.volume || indicators.volume.length < 2) continue;
      
      const volumes = indicators.volume.filter((v: number | null) => v !== null);
      const closes = indicators.close?.filter((c: number | null) => c !== null) || [];
      
      if (volumes.length < 2 || closes.length < 2) continue;
      
      const latestVolume = volumes[volumes.length - 1];
      const prevVolume = volumes[volumes.length - 2];
      const latestClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      
      const volumeChange = latestVolume - prevVolume;
      const priceChange = latestClose - prevClose;
      
      const avgPrice = meta.regularMarketPrice || latestClose;
      // Note: price direction ≠ ETF flow direction. Using volume*price as a rough flow proxy.
      // A positive volume change suggests net inflows regardless of price direction.
      const flowEstimate = (volumeChange * avgPrice) / 1000000;
      const netFlow = flowEstimate; // use volume-based estimate, not price-direction as proxy
      
      if (Math.abs(netFlow) > 1) {
        results.push({
          ticker,
          net_flow: Math.round(netFlow * 100) / 100,
          source: 'Yahoo_Finance_Volume'
        });
        console.log(`✅ ${ticker}: ${netFlow > 0 ? '+' : ''}$${netFlow.toFixed(1)}M flow`);
      }
      
      await new Promise(r => setTimeout(r, 200));
      
    } catch (err) {
      console.log(`Error fetching ${ticker}: ${err}`);
    }
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const logger = new IngestLogger(supabaseClient, 'ingest-etf-flows');
  const slackAlerter = new SlackAlerter();
  await logger.start();
  const startTime = Date.now();

  try {
    console.log('[v5] Starting ETF flows ingestion - Firecrawl HTML + Yahoo fallback');

    // Scrape ETF flow data using Firecrawl HTML
    const flowData = await scrapeETFFlowsHTML();
    
    // If zero rows, treat as warning and send Slack alert
    if (flowData.length === 0) {
      console.warn('⚠️ WARNING: No ETF flow data found - zero rows will be inserted');
      
      await logger.success({
        source_used: 'Firecrawl_HTML',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
        metadata: { 
          reason: 'no_data_available', 
          version: 'v5_firecrawl_html',
          warning: 'Zero rows inserted'
        }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-etf-flows', {
        sourcesAttempted: ['ETFdb Firecrawl HTML', 'Yahoo Finance Volume'],
        reason: 'Could not extract flow data from any source'
      });
      
      await supabaseClient.from('function_status').insert({
        function_name: 'ingest-etf-flows',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl_HTML',
        error_message: 'Zero rows inserted - no data available',
        metadata: { version: 'v5_firecrawl_html' }
      });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          warning: 'No ETF flow data found - zero rows inserted',
          inserted: 0,
          version: 'v5_firecrawl_html'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get asset IDs for the ETFs
    const tickers = flowData.map(f => f.ticker);
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const today = new Date().toISOString().split('T')[0];

    // Insert into etf_flows table - do NOT include weekly_flow_millions (set to null)
    const etfFlowRecords = flowData.map(f => ({
      ticker: f.ticker,
      asset_id: tickerToAssetId.get(f.ticker) || null,
      flow_date: today,
      net_flow: f.net_flow,
      inflow: f.net_flow > 0 ? f.net_flow : 0,
      outflow: f.net_flow < 0 ? Math.abs(f.net_flow) : 0,
      metadata: { 
        source: f.source, 
        version: 'v5_firecrawl_html',
        scraped_at: new Date().toISOString()
      }
    }));

    let successCount = 0;
    if (etfFlowRecords.length > 0) {
      // Use upsert to handle duplicates for same ticker/date
      const { data: inserted, error: insertError } = await supabaseClient
        .from('etf_flows')
        .upsert(etfFlowRecords, { 
          onConflict: 'ticker,flow_date',
          ignoreDuplicates: false 
        })
        .select('id');

      if (insertError) {
        // If upsert fails, try regular insert
        console.log('Upsert failed, trying insert:', insertError.message);
        const { data: insertedFallback, error: insertError2 } = await supabaseClient
          .from('etf_flows')
          .insert(etfFlowRecords)
          .select('id');
          
        if (insertError2) {
          console.error('Insert error:', insertError2.message);
        } else {
          successCount = insertedFallback?.length || 0;
        }
      } else {
        successCount = inserted?.length || etfFlowRecords.length;
      }
    }

    const duration = Date.now() - startTime;
    const sourceUsed = flowData[0]?.source || 'Firecrawl_HTML';

    await logger.success({
      source_used: sourceUsed,
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
      rows_inserted: successCount,
      rows_skipped: 0,
      metadata: { version: 'v5_firecrawl_html' }
    });

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-etf-flows',
      executed_at: new Date().toISOString(),
      status: successCount > 0 ? 'success' : 'warning',
      rows_inserted: successCount,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: sourceUsed,
      metadata: { version: 'v5_firecrawl_html' }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-etf-flows',
      status: successCount > 0 ? 'success' : 'partial',
      duration,
      rowsInserted: successCount,
      rowsSkipped: 0,
      sourceUsed,
    });

    console.log(`✅ Inserted ${successCount} ETF flow records`);

    return new Response(JSON.stringify({
      success: true,
      records_inserted: successCount,
      source: sourceUsed,
      version: 'v5_firecrawl_html',
      message: `Inserted ${successCount} ETF flow records`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    await logger.failure(error as Error, {
      source_used: 'Firecrawl_HTML',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
    });

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-etf-flows',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: 'Firecrawl_HTML',
      error_message: (error as Error).message,
      metadata: { version: 'v5_firecrawl_html' }
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-etf-flows',
      message: `ETF flows ingestion failed: ${(error as Error).message}`
    });

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
