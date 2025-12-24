import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { withRetry } from "../_shared/retry-wrapper.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SEC-compliant User-Agent with explicit product name + contact
const SEC_USER_AGENT = "LovableSignalsBot/1.0 (contact@lovable.dev)";

// Parse Form 4 XML using proper XML parser (handles multiple namespace variants)
function parseForm4XML(xmlText: string): {
  ticker: string | null;
  issuerName: string | null;
  transactions: Array<{
    code: string;
    shares: number;
    acquiredDisposed: string;
    pricePerShare: number | null;
  }>;
} {
  const result = {
    ticker: null as string | null,
    issuerName: null as string | null,
    transactions: [] as Array<{
      code: string;
      shares: number;
      acquiredDisposed: string;
      pricePerShare: number | null;
    }>
  };

  try {
    // Use DOMParser for proper XML parsing
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    
    if (!doc) {
      console.log('Failed to parse XML document');
      return result;
    }

    // Helper to find element by local name (ignores namespace prefixes)
    const findByLocalName = (parent: any, localName: string): any => {
      if (!parent || !parent.getElementsByTagName) return null;
      
      // Try without namespace
      let elements = parent.getElementsByTagName(localName);
      if (elements && elements.length > 0) return elements[0];
      
      // Try with common namespace prefixes
      for (const prefix of ['', 'ns1:', 'ns2:', 'ownershipDocument:']) {
        elements = parent.getElementsByTagName(prefix + localName);
        if (elements && elements.length > 0) return elements[0];
      }
      
      return null;
    };

    const getAllByLocalName = (parent: any, localName: string): any[] => {
      if (!parent || !parent.getElementsByTagName) return [];
      
      let elements = parent.getElementsByTagName(localName);
      if (elements && elements.length > 0) return Array.from(elements);
      
      for (const prefix of ['', 'ns1:', 'ns2:', 'ownershipDocument:']) {
        elements = parent.getElementsByTagName(prefix + localName);
        if (elements && elements.length > 0) return Array.from(elements);
      }
      
      return [];
    };

    // Extract issuer info
    const issuer = findByLocalName(doc, 'issuer');
    if (issuer) {
      const tickerEl = findByLocalName(issuer, 'issuerTradingSymbol');
      const nameEl = findByLocalName(issuer, 'issuerName');
      
      result.ticker = tickerEl?.textContent?.trim() || null;
      result.issuerName = nameEl?.textContent?.trim() || null;
    }

    // Extract transactions
    const transactions = getAllByLocalName(doc, 'nonDerivativeTransaction');
    
    for (const tx of transactions) {
      const codeEl = findByLocalName(tx, 'transactionCode');
      const code = codeEl?.textContent?.trim() || '';
      
      // Get shares - look in transactionAmounts
      const amounts = findByLocalName(tx, 'transactionAmounts');
      let shares = 0;
      let pricePerShare: number | null = null;
      let acquiredDisposed = '';
      
      if (amounts) {
        const sharesEl = findByLocalName(amounts, 'transactionShares');
        if (sharesEl) {
          const valueEl = findByLocalName(sharesEl, 'value');
          shares = parseFloat(valueEl?.textContent || '0') || 0;
        }
        
        const priceEl = findByLocalName(amounts, 'transactionPricePerShare');
        if (priceEl) {
          const valueEl = findByLocalName(priceEl, 'value');
          pricePerShare = parseFloat(valueEl?.textContent || '') || null;
        }
        
        const adCodeEl = findByLocalName(amounts, 'transactionAcquiredDisposedCode');
        if (adCodeEl) {
          const valueEl = findByLocalName(adCodeEl, 'value');
          acquiredDisposed = valueEl?.textContent?.trim() || '';
        }
      }
      
      if (code && acquiredDisposed) {
        result.transactions.push({
          code,
          shares,
          acquiredDisposed,
          pricePerShare
        });
      }
    }

    return result;
  } catch (err) {
    console.error('XML parsing error:', err);
    return result;
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
    metadata: { source: 'SEC EDGAR', version: 'v2_xml_parser' }
  });

  try {
    let limit = 100;
    try {
      const body = await req.json();
      limit = body.limit || 100;
    } catch {
      // Use default limit if no body
    }
    
    const feedUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=${limit}&output=atom`;
    
    console.log(`[v2] Fetching Form 4 filings with proper XML parser...`);
    
    const feedResponse = await withRetry(
      async () => await fetch(feedUrl, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          'Accept': 'application/atom+xml',
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
    let privateCompanySkips = 0;
    
    for (const entryMatch of entries) {
      const entryContent = entryMatch[1];
      
      // Extract filing URL from Atom feed
      let linkMatch = entryContent.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      if (!linkMatch) {
        linkMatch = entryContent.match(/<link>([^<]+)<\/link>/i);
      }
      if (!linkMatch) {
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
        
        // Find Form 4 XML document link
        const xmlMatch = indexHtml.match(/href="([^"]*\.xml)"/i);
        if (!xmlMatch) {
          parseErrors++;
          continue;
        }
        
        // Build full XML URL
        const xmlPath = xmlMatch[1];
        const xmlUrl = xmlPath.startsWith('http') 
          ? xmlPath 
          : `https://www.sec.gov${xmlPath.startsWith('/') ? '' : '/'}${xmlPath}`;
        
        // Fetch Form 4 XML
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
        
        // Parse XML with proper parser
        const parsed = parseForm4XML(xmlText);
        
        // If ticker is missing (private company), skip with warning log
        if (!parsed.ticker) {
          console.log(`⚠️ Skipping private company (no ticker): ${xmlUrl}`);
          privateCompanySkips++;
          continue;
        }
        
        const ticker = parsed.ticker.toUpperCase();
        const issuerName = parsed.issuerName || ticker;
        
        if (parsed.transactions.length === 0) {
          console.log(`⚠️ No transactions found: ${xmlUrl}`);
          continue;
        }
        
        // Process first transaction
        const tx = parsed.transactions[0];
        
        // Determine signal type: A = Acquired (buy), D = Disposed (sell)
        let signalType = 'insider_buy';
        let direction = 'up';
        
        if (tx.acquiredDisposed === 'D') {
          signalType = 'insider_sell';
          direction = 'down';
        }
        
        // Generate checksum for idempotency
        const checksumData = JSON.stringify({
          filing_url: filingUrl,
          ticker,
          tx_code: tx.code,
          shares: tx.shares,
          acq_disp: tx.acquiredDisposed
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
        
        // Insert signal using existing insider_buy/insider_sell signal types
        const { error: insertError } = await supabaseClient
          .from('signals')
          .insert({
            signal_type: signalType,
            asset_id: asset?.id,
            value_text: `${tx.acquiredDisposed === 'A' ? 'Acquired' : 'Disposed'} ${tx.shares.toLocaleString()} shares`,
            direction,
            magnitude: Math.min(tx.shares / 10000, 10),
            observed_at: new Date().toISOString(),
            raw: {
              ticker,
              issuer_name: issuerName,
              transaction_code: tx.code,
              shares: tx.shares,
              price_per_share: tx.pricePerShare,
              acquired_disposed: tx.acquiredDisposed,
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
          console.log(`✅ ${signalType}: ${ticker} ${tx.shares} shares`);
        }
        
        // Rate limit SEC requests
        await new Promise(r => setTimeout(r, 200));
        
      } catch (filingError) {
        console.error(`Error processing filing ${filingUrl}:`, filingError);
        parseErrors++;
        continue;
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const latency = Date.now() - startTime;

    // If zero rows inserted, treat as warning
    if (signalsCreated === 0 && signalsSkipped === 0) {
      console.warn('⚠️ WARNING: Zero signals created from Form 4 filings');
    }

    await supabaseClient.from('ingest_logs').update({
      status: signalsCreated > 0 ? 'success' : 'warning',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      rows_inserted: signalsCreated,
      rows_skipped: signalsSkipped,
      source_used: 'SEC EDGAR',
      fallback_count: 0,
      latency_ms: latency,
      metadata: { 
        version: 'v2_xml_parser',
        parse_errors: parseErrors,
        private_company_skips: privateCompanySkips
      }
    }).eq('id', logId);

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-form4',
      executed_at: new Date().toISOString(),
      status: signalsCreated > 0 ? 'success' : 'warning',
      rows_inserted: signalsCreated,
      rows_skipped: signalsSkipped,
      fallback_used: null,
      duration_ms: latency,
      source_used: 'SEC EDGAR',
      error_message: signalsCreated === 0 ? 'Zero signals created' : null,
      metadata: { 
        filings_processed: Math.min(limit, entries.length),
        parse_errors: parseErrors,
        private_company_skips: privateCompanySkips,
        version: 'v2_xml_parser'
      }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-form4',
      status: signalsCreated > 0 ? 'success' : 'partial',
      duration: durationSeconds,
      latencyMs: latency,
      sourceUsed: 'SEC EDGAR (XML Parser v2)',
      fallbackRatio: 0,
      rowsInserted: signalsCreated,
      rowsSkipped: signalsSkipped
    });

    console.log(`📊 Form 4 ingestion complete: ${signalsCreated} created, ${signalsSkipped} skipped, ${parseErrors} errors, ${privateCompanySkips} private companies`);

    return new Response(JSON.stringify({
      filings_processed: Math.min(limit, entries.length),
      signals_created: signalsCreated,
      signals_skipped: signalsSkipped,
      parse_errors: parseErrors,
      private_company_skips: privateCompanySkips,
      version: 'v2_xml_parser'
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
      metadata: { version: 'v2_xml_parser' }
    });

    await supabaseClient.from('ingest_failures').insert({
      etl_name: 'ingest-form4',
      ticker: null,
      error_type: 'unknown',
      error_message: errorMessage,
      status_code: null,
      retry_count: 0,
      failed_at: new Date().toISOString(),
      metadata: { version: 'v2_xml_parser' }
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
