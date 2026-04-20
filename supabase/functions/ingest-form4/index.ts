import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { withRetry } from "../_shared/retry-wrapper.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.3.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SEC-compliant User-Agent with explicit product name + contact
const SEC_USER_AGENT = "InsiderPulse/1.0 contact@insiderpulse.com";

// Track parse errors — increased cap so systemic failures (e.g. SEC schema changes) don't go silent
let debugErrorCount = 0;
const MAX_DEBUG_ERRORS = 50; // was 5 — too low, systemic failures would go completely silent

// Parse Form 4 XML using fast-xml-parser with removeNSPrefix
function parseForm4XML(xmlText: string): {
  ticker: string | null;
  issuerName: string | null;
  ownerName: string | null;
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
    ownerName: null as string | null,
    transactions: [] as Array<{
      code: string;
      shares: number;
      acquiredDisposed: string;
      pricePerShare: number | null;
    }>
  };

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true, // Strips all namespace prefixes (ns1:, ns2:, etc.)
      parseTagValue: true,
      trimValues: true,
    });
    
    const doc = parser.parse(xmlText);
    
    if (!doc) {
      return result;
    }

    // After removeNSPrefix, ownershipDocument should be accessible directly
    const ownership = doc.ownershipDocument;
    
    if (!ownership) {
      return result;
    }

    // Extract issuer info
    const issuer = ownership.issuer;
    if (issuer) {
      // issuerTradingSymbol is the ticker
      const tickerRaw = issuer.issuerTradingSymbol;
      if (tickerRaw) {
        result.ticker = String(tickerRaw).trim().toUpperCase();
      }
      const nameRaw = issuer.issuerName;
      if (nameRaw) {
        result.issuerName = String(nameRaw).trim();
      }
    }

    // Extract reporting owner name
    const reportingOwner = ownership.reportingOwner;
    if (reportingOwner) {
      const ownerId = reportingOwner.reportingOwnerId || reportingOwner;
      if (ownerId && ownerId.rptOwnerName) {
        result.ownerName = String(ownerId.rptOwnerName).trim();
      }
    }

    // Extract transactions from nonDerivativeTable
    const ndTable = ownership.nonDerivativeTable;
    if (ndTable) {
      let transactions = ndTable.nonDerivativeTransaction;
      
      // Handle both single object and array
      if (transactions && !Array.isArray(transactions)) {
        transactions = [transactions];
      }
      
      if (transactions && Array.isArray(transactions)) {
        for (const tx of transactions) {
          const transactionCoding = tx.transactionCoding;
          const transactionAmounts = tx.transactionAmounts;
          
          if (!transactionCoding || !transactionAmounts) continue;
          
          const codeRaw = transactionCoding.transactionCode;
          const code = codeRaw ? String(codeRaw).trim() : '';
          
          // Get shares - handle nested value object
          let shares = 0;
          const sharesObj = transactionAmounts.transactionShares;
          if (sharesObj) {
            const sharesVal = typeof sharesObj === 'object' ? sharesObj.value : sharesObj;
            shares = parseFloat(String(sharesVal || '0')) || 0;
          }
          
          // Get price per share
          let pricePerShare: number | null = null;
          const priceObj = transactionAmounts.transactionPricePerShare;
          if (priceObj) {
            const priceVal = typeof priceObj === 'object' ? priceObj.value : priceObj;
            if (priceVal) {
              pricePerShare = parseFloat(String(priceVal)) || null;
            }
          }
          
          // Get acquired/disposed code
          let acquiredDisposed = '';
          const adObj = transactionAmounts.transactionAcquiredDisposedCode;
          if (adObj) {
            const adVal = typeof adObj === 'object' ? adObj.value : adObj;
            acquiredDisposed = adVal ? String(adVal).trim() : '';
          }
          
          if (code && shares > 0) {
            result.transactions.push({
              code,
              shares,
              acquiredDisposed,
              pricePerShare
            });
          }
        }
      }
    }

    return result;
  } catch (err) {
    return result;
  }
}

// Check if XML contains ownershipDocument (with or without namespace)
function containsOwnershipDocument(xmlText: string): boolean {
  return xmlText.includes('ownershipDocument') || 
         xmlText.includes(':ownershipDocument') ||
         xmlText.includes('<ownershipDocument');
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
  debugErrorCount = 0; // Reset debug counter

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
    metadata: { source: 'SEC EDGAR', version: 'v4_improved_xml_selection' }
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
    
    console.log(`[v4] Fetching Form 4 filings with improved XML selection...`);
    
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
      
      // Extract filing date from Atom entry — prefer <updated>, fall back to <published>
      const updatedMatch = entryContent.match(/<updated>([^<]+)<\/updated>/i);
      const publishedMatch = entryContent.match(/<published>([^<]+)<\/published>/i);
      const filingDateRaw = updatedMatch?.[1] || publishedMatch?.[1];
      const filingDate = filingDateRaw ? new Date(filingDateRaw).toISOString() : new Date().toISOString();

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
        
        // Find ALL .xml file links (avoid xslF345X05 folder which contains stylesheets)
        const xmlMatches = indexHtml.matchAll(/href="([^"]*\.xml)"/gi);
        const xmlCandidates: string[] = [];
        
        for (const match of xmlMatches) {
          const xmlPath = match[1];
          // Skip stylesheet/transformed files
          if (!xmlPath.includes('xsl') && !xmlPath.includes('XSL')) {
            xmlCandidates.push(xmlPath);
          }
        }
        
        if (xmlCandidates.length === 0) {
          // Fallback: try any .xml file
          const fallbackMatch = indexHtml.match(/href="([^"]*\.xml)"/i);
          if (fallbackMatch) {
            xmlCandidates.push(fallbackMatch[1]);
          }
        }
        
        if (xmlCandidates.length === 0) {
          if (debugErrorCount < MAX_DEBUG_ERRORS) {
            console.log(`🔍 DEBUG Parse Error ${debugErrorCount + 1}:`);
            console.log(`  filingUrl: ${filingUrl}`);
            console.log(`  xmlUrl: (none found)`);
            console.log(`  error: No XML candidates found`);
            console.log(`  containsOwnershipDocument: false`);
            debugErrorCount++;
          }
          parseErrors++;
          continue;
        }
        
        // Try each XML candidate until we find one with ownershipDocument
        let xmlText = '';
        let successfulXmlUrl = '';
        
        for (const xmlPath of xmlCandidates) {
          const xmlUrl = xmlPath.startsWith('http') 
            ? xmlPath 
            : `https://www.sec.gov${xmlPath.startsWith('/') ? '' : '/'}${xmlPath}`;
          
          try {
            const xmlResponse = await withRetry(
              async () => await fetch(xmlUrl, {
                headers: {
                  'User-Agent': SEC_USER_AGENT,
                  'Accept': 'application/xml, text/xml'
                }
              }),
              { maxRetries: 2, initialDelayMs: 500 }
            );
            
            const candidateText = await xmlResponse.text();
            
            if (containsOwnershipDocument(candidateText)) {
              xmlText = candidateText;
              successfulXmlUrl = xmlUrl;
              break;
            }
          } catch {
            // Try next candidate
          }
        }
        
        if (!xmlText) {
          if (debugErrorCount < MAX_DEBUG_ERRORS) {
            console.log(`🔍 DEBUG Parse Error ${debugErrorCount + 1}:`);
            console.log(`  filingUrl: ${filingUrl}`);
            console.log(`  xmlCandidates: ${xmlCandidates.join(', ')}`);
            console.log(`  error: No XML contains ownershipDocument`);
            console.log(`  containsOwnershipDocument: false`);
            debugErrorCount++;
          }
          parseErrors++;
          continue;
        }
        
        // Parse XML with fast-xml-parser
        const parsed = parseForm4XML(xmlText);
        
        // If ticker is missing (private company), skip with warning log
        if (!parsed.ticker) {
          if (debugErrorCount < MAX_DEBUG_ERRORS && privateCompanySkips < 3) {
            console.log(`🔍 DEBUG No Ticker:`);
            console.log(`  filingUrl: ${filingUrl}`);
            console.log(`  xmlUrl: ${successfulXmlUrl}`);
            console.log(`  issuerName: ${parsed.issuerName || 'null'}`);
            console.log(`  ownerName: ${parsed.ownerName || 'null'}`);
            console.log(`  transactions: ${parsed.transactions.length}`);
          }
          privateCompanySkips++;
          continue;
        }
        
        const ticker = parsed.ticker;

        // Validate ticker — reject values that come from parsing the wrong XML field
        const tickerUpper = ticker.toUpperCase();
        if (
          tickerUpper === 'N/A' ||
          ticker.trim() === '' ||
          ticker.length > 10
        ) {
          console.warn(`[INGEST-FORM4] Skipping invalid ticker "${ticker}" (filingUrl: ${filingUrl})`);
          privateCompanySkips++;
          continue;
        }

        const issuerName = parsed.issuerName || ticker;
        
        if (parsed.transactions.length === 0) {
          continue;
        }

        // Find or create asset once per filing (not once per transaction)
        let { data: asset } = await supabaseClient
          .from('assets')
          .select('id')
          .eq('ticker', ticker)
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

        // Process ALL transactions in this filing
        for (let txIndex = 0; txIndex < parsed.transactions.length; txIndex++) {
          const tx = parsed.transactions[txIndex];

          // Determine signal type: A = Acquired (buy), D = Disposed (sell)
          const signalType = tx.acquiredDisposed === 'D' ? 'insider_sell' : 'insider_buy';
          const direction  = tx.acquiredDisposed === 'D' ? 'down' : 'up';

          // Checksum includes txIndex so tx[0] and tx[1] from the same filing are distinct
          const checksumData = JSON.stringify({
            filing_url: filingUrl,
            ticker,
            tx_index: txIndex,
            tx_code: tx.code,
            shares: tx.shares,
            acq_disp: tx.acquiredDisposed
          });

          const encoder = new TextEncoder();
          const data = encoder.encode(checksumData);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          const transactionValue = tx.shares * (tx.pricePerShare ?? 1);

          // Skip micro-transactions under $1,000 — noise not signal
          if (transactionValue < 1000) continue;

          // FIX: magnitude normalised to 0-5 scale ($1M = 5)
          const signalMagnitude = Math.min(5, Math.max(0.1, (transactionValue / 1_000_000) * 5));

          const { error: insertError } = await supabaseClient
            .from('signals')
            .insert({
              signal_type: signalType,
              asset_id: asset?.id,
              value_text: `${parsed.ownerName || 'Insider'}: ${tx.acquiredDisposed === 'A' ? 'Acquired' : 'Disposed'} ${tx.shares.toLocaleString()} shares`,
              direction,
              magnitude: signalMagnitude,
              observed_at: filingDate,
              raw: {
                ticker,
                issuer_name: issuerName,
                owner_name: parsed.ownerName,
                transaction_code: tx.code,
                transaction_index: txIndex,
                shares: tx.shares,
                price_per_share: tx.pricePerShare,
                acquired_disposed: tx.acquiredDisposed,
                filing_url: filingUrl,
                xml_url: successfulXmlUrl
              },
              citation: {
                source: 'SEC Form 4',
                url: filingUrl,
                timestamp: filingDate
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
            console.log(`✅ ${signalType} [tx${txIndex}]: ${ticker} ${tx.shares} shares by ${parsed.ownerName || 'Insider'}`);

            // FIX: Also write to form4_insider_trades table (was always 0 rows because ingest-form4
            // was only writing to signals table, not form4_insider_trades)
            await supabaseClient
              .from('form4_insider_trades')
              .upsert({
                ticker,
                asset_id: asset?.id || null,
                filing_date: filingDate.split('T')[0],
                transaction_date: filingDate.split('T')[0],
                insider_name: parsed.ownerName || 'Unknown Insider',
                insider_title: null,
                transaction_type: tx.code,
                shares: Math.round(tx.shares),
                price_per_share: tx.pricePerShare,
                total_value: transactionValue > 0 ? transactionValue : null,
                shares_owned_after: null,
                is_direct_ownership: true,
                form_url: filingUrl,
                metadata: { xml_url: successfulXmlUrl, acquired_disposed: tx.acquiredDisposed, tx_index: txIndex },
                checksum,
              }, { onConflict: 'ticker,filing_date,insider_name,transaction_type,shares', ignoreDuplicates: true });
          }
        }

        // Rate limit SEC requests (once per filing, not per transaction)
        await new Promise(r => setTimeout(r, 200));
        
      } catch (filingError) {
        if (debugErrorCount < MAX_DEBUG_ERRORS) {
          console.log(`🔍 DEBUG Processing Error ${debugErrorCount + 1}:`);
          console.log(`  filingUrl: ${filingUrl}`);
          console.log(`  error: ${filingError}`);
          debugErrorCount++;
        }
        parseErrors++;
        continue;
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const latency = Date.now() - startTime;
    const parseErrorRate = entries.length > 0 ? (parseErrors / entries.length * 100).toFixed(1) : '0';

    console.log(`📊 Parse error rate: ${parseErrorRate}% (${parseErrors}/${entries.length})`);

    // If zero rows inserted, send Slack "no data found" alert
    if (signalsCreated === 0 && signalsSkipped === 0) {
      console.warn('⚠️ WARNING: Zero signals created from Form 4 filings');
      console.log(`Breakdown: ${parseErrors} parse errors, ${privateCompanySkips} private companies, ${entries.length} total entries`);
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-form4', {
        sourcesAttempted: ['SEC EDGAR Form 4'],
        reason: `Processed ${entries.length} entries but no signals created (${parseErrors} parse errors, ${privateCompanySkips} private company skips)`
      });
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
        version: 'v4_improved_xml_selection',
        parse_errors: parseErrors,
        parse_error_rate: parseErrorRate,
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
        parse_error_rate: parseErrorRate,
        private_company_skips: privateCompanySkips,
        version: 'v4_improved_xml_selection'
      }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-form4',
      status: signalsCreated > 0 ? 'success' : 'partial',
      duration: durationSeconds,
      latencyMs: latency,
      sourceUsed: 'SEC EDGAR (v4 improved)',
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
      parse_error_rate: `${parseErrorRate}%`,
      private_company_skips: privateCompanySkips,
      version: 'v4_improved_xml_selection'
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
      metadata: { version: 'v4_improved_xml_selection' }
    });

    await supabaseClient.from('ingest_failures').insert({
      etl_name: 'ingest-form4',
      ticker: null,
      error_type: 'unknown',
      error_message: errorMessage,
      status_code: null,
      retry_count: 0,
      failed_at: new Date().toISOString(),
      metadata: { version: 'v4_improved_xml_selection' }
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
