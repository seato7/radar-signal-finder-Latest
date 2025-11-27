import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { withRetry } from "../_shared/retry-wrapper.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const logId = crypto.randomUUID();
  const slackAlerter = new SlackAlerter();

  await supabaseClient.from('ingest_logs').insert({
    id: logId,
    etl_name: 'ingest-form4',
    status: 'running',
    started_at: new Date().toISOString(),
    source_used: 'SEC EDGAR',
    cache_hit: false,
    fallback_count: 0,
    latency_ms: 0,
  });

  await slackAlerter.sendLiveAlert({
    etlName: 'ingest-form4',
    status: 'started',
    metadata: { source: 'SEC EDGAR' }
  });

  try {
    const { limit = 100 } = await req.json();
    
    const SEC_USER_AGENT = "MyCompany info@example.com";
    const feedUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=${limit}&output=atom`;
    
    const feedResponse = await withRetry(
      async () => await fetch(feedUrl, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          'Accept-Language': 'en-US'
        }
      }),
      { maxRetries: 3, initialDelayMs: 2000 }
    );
    
    const feedText = await feedResponse.text();
    const entryRegex = /<entry>(.*?)<\/entry>/gs;
    const entries = Array.from(feedText.matchAll(entryRegex)).slice(0, limit);
    
    console.log(`📥 Found ${entries.length} entries in SEC feed`);
    
    let signalsCreated = 0;
    let signalsSkipped = 0;
    let parseErrors = 0;
    
    for (const entryMatch of entries) {
      const entryContent = entryMatch[1];
      
      console.log(`🔄 Processing entry ${signalsCreated + signalsSkipped + parseErrors + 1}/${entries.length}`);
      
      // Extract filing URL from Atom feed - try multiple formats
      let linkMatch = entryContent.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      if (!linkMatch) {
        linkMatch = entryContent.match(/<link>([^<]+)<\/link>/i);
      }
      if (!linkMatch) {
        console.log(`⚠️ No link found in entry`);
        parseErrors++;
        continue;
      }
      
      const filingUrl = linkMatch[1];
      
      try {
        // Fetch the filing index page
        const indexResponse = await withRetry(
          async () => await fetch(filingUrl, {
            headers: {
              'User-Agent': SEC_USER_AGENT,
              'Accept': 'text/html'
            }
          }),
          { maxRetries: 2, initialDelayMs: 1000 }
        );
        
        const indexHtml = await indexResponse.text();
        
        console.log(`📄 Processing filing: ${filingUrl}`);
        
        // Find Form 4 XML document link
        const xmlMatch = indexHtml.match(/href="([^"]*\.xml)"/i);
        if (!xmlMatch) {
          console.log(`⚠️ No XML link found in filing: ${filingUrl}`);
          parseErrors++;
          continue;
        }
        
        console.log(`📦 Found XML: ${xmlMatch[1]}`);
        
        // Build full XML URL
        const xmlPath = xmlMatch[1];
        const xmlUrl = xmlPath.startsWith('http') 
          ? xmlPath 
          : `https://www.sec.gov${xmlPath}`;
        
        // Fetch and parse Form 4 XML
        const xmlResponse = await withRetry(
          async () => await fetch(xmlUrl, {
            headers: {
              'User-Agent': SEC_USER_AGENT,
              'Accept': 'application/xml'
            }
          }),
          { maxRetries: 2, initialDelayMs: 1000 }
        );
        
        const xmlText = await xmlResponse.text();
        
        // Parse XML for key fields using regex (handles namespaces)
        const issuerNameMatch = xmlText.match(/<[^:>]*:?issuerName[^>]*>(.*?)<\/[^:>]*:?issuerName>/i);
        const issuerTickerMatch = xmlText.match(/<[^:>]*:?issuerTradingSymbol[^>]*>(.*?)<\/[^:>]*:?issuerTradingSymbol>/i);
        
        console.log(`🔍 Searching for ticker in XML (${xmlUrl.substring(0, 80)}...)`);
        console.log(`   Ticker match: ${issuerTickerMatch ? issuerTickerMatch[1] : 'NOT FOUND'}`);
        
        if (!issuerTickerMatch || !issuerTickerMatch[1]) {
          console.log(`⚠️ No ticker in XML (likely non-public company): ${xmlUrl}`);
          signalsSkipped++;
          continue;
        }
        
        const ticker = issuerTickerMatch[1].trim();
        const issuerName = issuerNameMatch ? issuerNameMatch[1].trim() : ticker;
        
        console.log(`✅ Found ticker: ${ticker}, issuer: ${issuerName}`);
        
        // Parse transaction details (handles namespaces)
        const transactionRegex = /<[^:>]*:?nonDerivativeTransaction[^>]*>(.*?)<\/[^:>]*:?nonDerivativeTransaction>/gs;
        const transactions = Array.from(xmlText.matchAll(transactionRegex));
        
        if (transactions.length === 0) {
          console.log(`⚠️ No transactions found in XML: ${xmlUrl}`);
          continue;
        }
        
        // Process first transaction (simplified - could process all)
        const txContent = transactions[0][1];
        const txCodeMatch = txContent.match(/<[^:>]*:?transactionCode[^>]*>(.*?)<\/[^:>]*:?transactionCode>/i);
        const txSharesMatch = txContent.match(/<[^:>]*:?transactionShares[^>]*>[\s\S]*?<[^:>]*:?value[^>]*>(.*?)<\/[^:>]*:?value>/i);
        const txAcqDispMatch = txContent.match(/<[^:>]*:?transactionAcquiredDisposedCode[^>]*>[\s\S]*?<[^:>]*:?value[^>]*>(.*?)<\/[^:>]*:?value>/i);
        
        if (!txCodeMatch || !txAcqDispMatch) {
          console.log(`⚠️ Incomplete transaction data: ${xmlUrl}`);
          parseErrors++;
          continue;
        }
        
        const txCode = txCodeMatch[1].trim();
        const txShares = txSharesMatch ? parseFloat(txSharesMatch[1]) : 0;
        const acqDisp = txAcqDispMatch[1].trim();
        
        // Determine signal type based on transaction
        let signalType = 'insider_buy';
        let direction = 'up';
        
        // A = Acquired, D = Disposed
        if (acqDisp === 'D') {
          signalType = 'insider_sell';
          direction = 'down';
        }
        
        // Generate checksum for idempotency
        const checksumData = JSON.stringify({
          filing_url: filingUrl,
          ticker,
          tx_code: txCode,
          shares: txShares,
          acq_disp: acqDisp
        });
        
        const encoder = new TextEncoder();
        const data = encoder.encode(checksumData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Find or create asset
        let { data: asset } = await supabaseClient
          .from('assets')
          .select('id')
          .eq('ticker', ticker)
          .eq('exchange', 'US')
          .maybeSingle();
        
        if (!asset) {
          const { data: newAsset } = await supabaseClient
            .from('assets')
            .insert({
              ticker,
              exchange: 'US',
              name: issuerName,
              metadata: {}
            })
            .select()
            .single();
          
          asset = newAsset;
        }
        
        // Insert signal
        const { error: insertError } = await supabaseClient
          .from('signals')
          .insert({
            signal_type: signalType,
            asset_id: asset?.id,
            value_text: `${acqDisp === 'A' ? 'Acquired' : 'Disposed'} ${txShares.toLocaleString()} shares`,
            direction,
            magnitude: Math.min(txShares / 10000, 10), // Scale magnitude
            observed_at: new Date().toISOString(),
            raw: {
              ticker,
              issuer_name: issuerName,
              transaction_code: txCode,
              shares: txShares,
              acquired_disposed: acqDisp,
              filing_url: filingUrl
            },
            citation: {
              source: 'SEC Form 4',
              url: filingUrl,
              timestamp: new Date().toISOString()
            },
            checksum
          });
        
        if (insertError) {
          if (insertError.code === '23505') {
            signalsSkipped++;
          } else {
            console.error('Insert error:', insertError);
            throw insertError;
          }
        } else {
          signalsCreated++;
        }
        
      } catch (filingError) {
        console.error(`Error processing filing ${filingUrl}:`, filingError);
        parseErrors++;
        continue;
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const latency = Date.now() - startTime;

    await supabaseClient.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      rows_inserted: signalsCreated,
      rows_skipped: signalsSkipped,
      source_used: 'SEC EDGAR',
      fallback_count: 0,
      latency_ms: latency,
    }).eq('id', logId);

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-form4',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: signalsCreated,
      rows_skipped: signalsSkipped,
      fallback_used: null,
      duration_ms: latency,
      source_used: 'SEC EDGAR',
      error_message: null,
      metadata: { 
        filings_processed: Math.min(limit, entries.length),
        parse_errors: parseErrors
      }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-form4',
      status: 'success',
      duration: durationSeconds,
      latencyMs: latency,
      sourceUsed: 'SEC EDGAR',
      fallbackRatio: 0,
      rowsInserted: signalsCreated,
      rowsSkipped: signalsSkipped
    });

    return new Response(JSON.stringify({
      filings_processed: Math.min(limit, entries.length),
      signals_created: signalsCreated,
      signals_skipped: signalsSkipped,
      parse_errors: parseErrors
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const latency = Date.now() - startTime;

    await supabaseClient.from('ingest_logs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      error_message: errorMessage,
    }).eq('id', logId);

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-form4',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      fallback_used: null,
      duration_ms: latency,
      source_used: 'SEC EDGAR',
      error_message: errorMessage,
      metadata: {}
    });

    await supabaseClient.from('ingest_failures').insert({
      etl_name: 'ingest-form4',
      ticker: null,
      error_type: 'unknown',
      error_message: errorMessage,
      status_code: null,
      retry_count: 0,
      failed_at: new Date().toISOString(),
      metadata: {}
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-form4',
      status: 'failed',
      duration: durationSeconds,
      errorMessage,
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
