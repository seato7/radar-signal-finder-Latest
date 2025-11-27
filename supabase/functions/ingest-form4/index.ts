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

  // Start logging
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
    
    // Fetch Form 4 atom feed
    const SEC_USER_AGENT = "MyCompany info@example.com";
    const feedUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=${limit}&output=atom`;
    
    const feedResponse = await withRetry(
      async () => await fetch(feedUrl, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          'Accept-Language': 'en-US'
        }
      }),
      {
        maxRetries: 3,
        initialDelayMs: 2000,
        onRetry: (attempt, error) => {
          console.log(`⏳ Retry ${attempt}/3 for SEC feed: ${error.message}`);
        }
      }
    );
    
    const feedText = await feedResponse.text();
    
    // Parse atom feed using regex (safer for edge functions)
    const entryRegex = /<entry>(.*?)<\/entry>/gs;
    const entries = Array.from(feedText.matchAll(entryRegex)).slice(0, limit);
    
    let signalsCreated = 0;
    let signalsSkipped = 0;
    let sourceUsed = 'SEC EDGAR';
    let parseErrors = 0;
    
    for (const entryMatch of entries) {
      const entryContent = entryMatch[1];
      
      const linkMatch = entryContent.match(/<link\s+href="(.*?)"/i);
      const titleMatch = entryContent.match(/<title>(.*?)<\/title>/i);
      
      if (!linkMatch || !titleMatch) {
        continue;
      }
      
      const filingUrl = linkMatch[1];
      const titleText = titleMatch[1];
      
      // Extract accession number from title to build XML URL
      const accessionMatch = titleText.match(/\((\d{10}-\d{2}-\d{6})\)/);
      if (!accessionMatch) {
        console.log(`⚠️ No accession number in: ${titleText}`);
        continue;
      }
      
      const accessionNumber = accessionMatch[1];
      
      // Extract CIK from title
      const cikMatch = titleText.match(/\((\d{10})\)/);
      if (!cikMatch) {
        console.log(`⚠️ No CIK in: ${titleText}`);
        continue;
      }
      
      const cik = cikMatch[1];
      
      // Build Form 4 XML URL
      const xmlUrl = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cik}&accession_number=${accessionNumber}&xbrl_type=v`;
      
      try {
        // Fetch the filing page to extract ticker
        const filingResponse = await withRetry(
          async () => await fetch(filingUrl, {
            headers: {
              'User-Agent': SEC_USER_AGENT,
              'Accept': 'text/html'
            }
          }),
          { maxRetries: 2, initialDelayMs: 1000 }
        );
        
        const filingHtml = await filingResponse.text();
        
        // Extract ticker from filing HTML (appears in issuer section)
        const tickerMatch = filingHtml.match(/Trading Symbol:<\/strong>\s*([A-Z]+)/i) ||
                           filingHtml.match(/Ticker:\s*([A-Z]+)/i) ||
                           filingHtml.match(/Symbol:\s*([A-Z]+)/i);
        
        if (!tickerMatch) {
          console.log(`⚠️ No ticker found in filing: ${filingUrl}`);
          parseErrors++;
          continue;
        }
        
        const ticker = tickerMatch[1];
        
        // For demo: create insider signal without parsing full XML
        const checksumData = JSON.stringify({
          filing_url: filingUrl,
          ticker
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
              name: ticker,
              metadata: {}
            })
            .select()
            .single();
          
          asset = newAsset;
        }
        
        // Insert insider signal with ON CONFLICT handling
        const { error: insertError } = await supabaseClient
          .from('signals')
          .insert({
            signal_type: 'insider_buy',
            asset_id: asset?.id,
            value_text: `Insider transaction: ${ticker}`,
            direction: 'up',
            magnitude: 1.0,
            observed_at: new Date().toISOString(),
            raw: {
              ticker,
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
          if (insertError.code === '23505') { // Duplicate key
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

    // Update log
    await supabaseClient.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      rows_inserted: signalsCreated,
      rows_skipped: signalsSkipped,
      source_used: sourceUsed,
      fallback_count: 0,
      latency_ms: latency,
    }).eq('id', logId);

    // @guard: Heartbeat log to function_status for monitoring
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-form4',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: signalsCreated,
      rows_skipped: signalsSkipped,
      fallback_used: null,
      duration_ms: latency,
      source_used: sourceUsed,
      error_message: null,
      metadata: { 
        filings_processed: Math.min(limit, entries.length),
        parse_errors: parseErrors
      }
    });

    // Send success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-form4',
      status: 'success',
      duration: durationSeconds,
      latencyMs: latency,
      sourceUsed,
      fallbackRatio: 0,
      rowsInserted: signalsCreated,
      rowsSkipped: signalsSkipped
    });

    return new Response(JSON.stringify({
      filings_processed: Math.min(limit, entries.length),
      signals_created: signalsCreated,
      signals_skipped: signalsSkipped
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const latency = Date.now() - startTime;

    // Update log with failure
    await supabaseClient.from('ingest_logs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      error_message: errorMessage,
    }).eq('id', logId);

    // @guard: Heartbeat log to function_status for monitoring
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

    // Log to ingest_failures
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

    // Send failure alert
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
