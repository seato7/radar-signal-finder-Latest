import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top institutional filers to track (by CIK) - Limited to avoid timeout
const TRACKED_MANAGERS = [
  { cik: '0001067983', name: 'Berkshire Hathaway' },
  { cik: '0001649339', name: 'Citadel Advisors' },
  { cik: '0001350694', name: 'Renaissance Technologies' },
  { cik: '0001056831', name: 'Two Sigma Investments' },
];

interface Filing13F {
  cik: string;
  managerName: string;
  filingDate: string;
  periodOfReport: string;
  holdings: Holding[];
}

interface Holding {
  cusip: string;
  nameOfIssuer: string;
  titleOfClass: string;
  value: number;
  shares: number;
  putCall?: string;
}

// OpenFIGI API for dynamic CUSIP resolution (free, max 10 items per request, 25 req/min)
async function lookupOpenFIGI(cusips: string[], maxBatches: number = 5): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  if (cusips.length === 0) return results;
  
  // OpenFIGI allows max 10 items per request for unauthenticated
  const batchSize = 10;
  const batches: string[][] = [];
  for (let i = 0; i < cusips.length; i += batchSize) {
    batches.push(cusips.slice(i, i + batchSize));
  }
  
  // Limit number of batches to avoid timeout (each batch takes ~3s with rate limiting)
  const batchesToProcess = batches.slice(0, maxBatches);
  console.log(`Processing ${batchesToProcess.length} of ${batches.length} OpenFIGI batches`);
  
  let rateLimited = false;
  
  for (const batch of batchesToProcess) {
    if (rateLimited) break;
    
    try {
      const requestBody = batch.map(cusip => ({
        idType: 'ID_CUSIP',
        idValue: cusip,
      }));
      
      const response = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (response.status === 429) {
        console.log('OpenFIGI rate limited, stopping lookups');
        rateLimited = true;
        break;
      }
      
      if (!response.ok) {
        console.log(`OpenFIGI API error: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      for (let i = 0; i < data.length; i++) {
        const cusip = batch[i];
        const mapping = data[i];
        
        if (mapping.data && mapping.data.length > 0) {
          const bestMatch = mapping.data.find((d: any) => 
            d.securityType === 'Common Stock' || d.securityType === 'EQS'
          ) || mapping.data[0];
          
          if (bestMatch.ticker) {
            results.set(cusip, bestMatch.ticker);
          }
        }
      }
      
      // Rate limit: 2.5s between requests (25 requests/min max)
      await new Promise(r => setTimeout(r, 2500));
      
    } catch (e) {
      console.error('OpenFIGI lookup error:', e);
    }
  }
  
  return results;
}

async function generateChecksum(data: Record<string, unknown>): Promise<string> {
  const content = JSON.stringify(data, Object.keys(data).sort());
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchRecentFilings(cik: string): Promise<string[]> {
  const paddedCik = cik.replace(/^0+/, '').padStart(10, '0');
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'InvestmentResearch admin@example.com',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch filings for CIK ${cik}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const filings = data.filings?.recent || {};
    const accessionNumbers: string[] = [];
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    for (let i = 0; i < (filings.form?.length || 0); i++) {
      if (filings.form[i] === '13F-HR' || filings.form[i] === '13F-HR/A') {
        const filingDate = new Date(filings.filingDate[i]);
        if (filingDate >= sixMonthsAgo) {
          accessionNumbers.push(filings.accessionNumber[i]);
        }
      }
    }
    
    return accessionNumbers.slice(0, 4); // process up to 4 most recent filings (was 2, could miss latest)
  } catch (e) {
    console.error(`Error fetching filings for CIK ${cik}:`, e);
    return [];
  }
}

async function parse13FHoldings(cik: string, accessionNumber: string, managerName: string): Promise<Filing13F | null> {
  const accessionFormatted = accessionNumber.replace(/-/g, '');
  const paddedCik = cik.replace(/^0+/, '').padStart(10, '0');
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accessionFormatted}`;
  
  try {
    const indexUrl = `${baseUrl}/index.json`;
    const indexResponse = await fetch(indexUrl, {
      headers: { 'User-Agent': 'InvestmentResearch admin@example.com' }
    });
    
    if (!indexResponse.ok) {
      console.log(`Failed to fetch index for ${accessionNumber}`);
      return null;
    }
    
    const indexData = await indexResponse.json();
    const items = indexData.directory?.item || [];
    
    let infotableFile = items.find((f: any) => 
      f.name?.toLowerCase().includes('infotable') && f.name?.endsWith('.xml')
    );
    
    if (!infotableFile) {
      infotableFile = items.find((f: any) => 
        f.name?.includes('13F') && f.name?.endsWith('.xml')
      );
    }
    
    if (!infotableFile) {
      console.log(`No infotable found for ${accessionNumber}`);
      return null;
    }
    
    const xmlUrl = `${baseUrl}/${infotableFile.name}`;
    const xmlResponse = await fetch(xmlUrl, {
      headers: { 'User-Agent': 'InvestmentResearch admin@example.com' }
    });
    
    if (!xmlResponse.ok) {
      console.log(`Failed to fetch infotable XML: ${xmlResponse.status}`);
      return null;
    }
    
    const xml = await xmlResponse.text();
    const holdings: Holding[] = [];
    
    const infoTableRegex = /<infoTable[^>]*>([\s\S]*?)<\/infoTable>/gi;
    const nameRegex = /<nameOfIssuer>([\s\S]*?)<\/nameOfIssuer>/i;
    const titleRegex = /<titleOfClass>([\s\S]*?)<\/titleOfClass>/i;
    const cusipRegex = /<cusip>([\s\S]*?)<\/cusip>/i;
    const valueRegex = /<value>([\s\S]*?)<\/value>/i;
    const sharesRegex = /<shrsOrPrnAmt>[\s\S]*?<sshPrnamt>([\s\S]*?)<\/sshPrnamt>[\s\S]*?<\/shrsOrPrnAmt>/i;
    const putCallRegex = /<putCall>([\s\S]*?)<\/putCall>/i;
    
    let match;
    while ((match = infoTableRegex.exec(xml)) !== null) {
      const entry = match[1];
      
      const nameMatch = entry.match(nameRegex);
      const titleMatch = entry.match(titleRegex);
      const cusipMatch = entry.match(cusipRegex);
      const valueMatch = entry.match(valueRegex);
      const sharesMatch = entry.match(sharesRegex);
      const putCallMatch = entry.match(putCallRegex);
      
      if (cusipMatch && valueMatch) {
        holdings.push({
          cusip: cusipMatch[1].trim(),
          nameOfIssuer: nameMatch ? nameMatch[1].trim() : 'Unknown',
          titleOfClass: titleMatch ? titleMatch[1].trim() : 'COM',
          value: parseInt(valueMatch[1].trim()) || 0,
          shares: sharesMatch ? parseInt(sharesMatch[1].trim()) || 0 : 0,
          putCall: putCallMatch ? putCallMatch[1].trim() : undefined,
        });
      }
    }
    
    const primaryUrl = `${baseUrl}/primary_doc.xml`;
    let filingDate = new Date().toISOString().split('T')[0];
    let periodOfReport = filingDate;
    
    try {
      const primaryResponse = await fetch(primaryUrl, {
        headers: { 'User-Agent': 'InvestmentResearch admin@example.com' }
      });
      if (primaryResponse.ok) {
        const primaryXml = await primaryResponse.text();
        const periodMatch = primaryXml.match(/<periodOfReport>([\s\S]*?)<\/periodOfReport>/i);
        const filedMatch = primaryXml.match(/<signatureDate>([\s\S]*?)<\/signatureDate>/i);
        if (periodMatch) periodOfReport = periodMatch[1].trim();
        if (filedMatch) filingDate = filedMatch[1].trim();
      }
    } catch (e) {
      console.log('Could not fetch primary doc');
    }
    
    return { cik, managerName, filingDate, periodOfReport, holdings };
    
  } catch (e) {
    console.error(`Error parsing 13F for ${accessionNumber}:`, e);
    return null;
  }
}

function computeChanges(
  currentHoldings: Map<string, { shares: number; value: number }>,
  previousHoldings: Map<string, { shares: number; value: number }>
): Map<string, { changeType: string; changeShares: number; changePct: number; prevShares: number; prevValue: number }> {
  const changes = new Map();
  
  for (const [cusip, current] of currentHoldings) {
    const prev = previousHoldings.get(cusip);
    
    if (!prev) {
      changes.set(cusip, {
        changeType: 'new',
        changeShares: current.shares,
        changePct: 100,
        prevShares: 0,
        prevValue: 0,
      });
    } else {
      const shareChange = current.shares - prev.shares;
      const changePct = prev.shares > 0 ? (shareChange / prev.shares) * 100 : 0;
      
      let changeType = 'unchanged';
      if (changePct >= 20) changeType = 'increase';
      else if (changePct <= -20) changeType = 'decrease';
      else if (changePct >= 5) changeType = 'minor_increase';
      else if (changePct <= -5) changeType = 'minor_decrease';
      
      changes.set(cusip, {
        changeType,
        changeShares: shareChange,
        changePct: Math.round(changePct * 100) / 100,
        prevShares: prev.shares,
        prevValue: prev.value,
      });
    }
  }
  
  for (const [cusip, prev] of previousHoldings) {
    if (!currentHoldings.has(cusip)) {
      changes.set(cusip, {
        changeType: 'exit',
        changeShares: -prev.shares,
        changePct: -100,
        prevShares: prev.shares,
        prevValue: prev.value,
      });
    }
  }
  
  return changes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Check for resolve_pending mode
  const url = new URL(req.url);
  const resolvePending = url.searchParams.get('resolve_pending') === 'true';
  const batchLimit = parseInt(url.searchParams.get('limit') || '100');
  const markUnmappable = url.searchParams.get('mark_unmappable') === 'true';

  if (resolvePending) {
    // RESOLVE PENDING CUSIPS MODE
    try {
      console.log(`Resolve pending mode: limit=${batchLimit}, markUnmappable=${markUnmappable}`);
      
      const { data: pendingCusips, error: fetchError } = await supabase
        .from('cusip_mappings')
        .select('cusip, company_name')
        .is('ticker', null)
        .limit(batchLimit);
      
      if (fetchError) throw new Error(`Fetch error: ${fetchError.message}`);
      
      if (!pendingCusips || pendingCusips.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No pending CUSIPs to resolve',
          stats: { pending: 0, resolved: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      console.log(`Found ${pendingCusips.length} pending CUSIPs`);
      
      const cusipList = pendingCusips.map(p => p.cusip);
      const figiResults = await lookupOpenFIGI(cusipList, 10);
      
      let resolved = 0;
      let unresolvable = 0;
      const updates: Array<{ cusip: string; ticker: string | null; company_name: string | null; source: string; verified: boolean }> = [];
      
      for (const pending of pendingCusips) {
        const ticker = figiResults.get(pending.cusip) || null;
        
        if (ticker) {
          updates.push({
            cusip: pending.cusip,
            ticker,
            company_name: pending.company_name,
            source: 'openfigi',
            verified: true,
          });
          resolved++;
        } else if (markUnmappable) {
          updates.push({
            cusip: pending.cusip,
            ticker: 'UNMAPPED',
            company_name: pending.company_name,
            source: 'unmappable',
            verified: false,
          });
          unresolvable++;
        }
      }
      
      if (updates.length > 0) {
        const { error } = await supabase
          .from('cusip_mappings')
          .upsert(updates, { onConflict: 'cusip' });
        if (error) console.error('Update error:', error.message);
      }
      
      const { count: remainingCount } = await supabase
        .from('cusip_mappings')
        .select('*', { count: 'exact', head: true })
        .is('ticker', null);
      
      const { count: totalMapped } = await supabase
        .from('cusip_mappings')
        .select('*', { count: 'exact', head: true })
        .not('ticker', 'is', null)
        .neq('ticker', 'UNMAPPED');
      
      await supabase.from('ingest_logs').insert({
        etl_name: 'resolve-pending-cusips',
        status: 'success',
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        rows_inserted: resolved,
        rows_updated: unresolvable,
        source_used: 'openfigi',
        metadata: { remaining: remainingCount, total_mapped: totalMapped }
      });
      
      return new Response(JSON.stringify({
        success: true,
        processed: pendingCusips.length,
        resolved,
        unresolvable: markUnmappable ? unresolvable : 0,
        remaining: remainingCount,
        totalMapped,
        duration_ms: Date.now() - startTime,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Resolve pending error:', msg);
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // NORMAL 13F INGESTION MODE
  try {
    // Load CUSIP mappings WITH tickers from database (cached lookups)
    const { data: existingMappings, error: mappingError } = await supabase
      .from('cusip_mappings')
      .select('cusip, ticker')
      .not('ticker', 'is', null)
      .limit(5000);
    
    if (mappingError) {
      console.error('Error loading CUSIP mappings:', mappingError);
    }
    
    // Also load pending CUSIPs to avoid re-looking them up
    const { data: pendingMappings } = await supabase
      .from('cusip_mappings')
      .select('cusip')
      .is('ticker', null)
      .limit(10000);
    
    const cusipCache = new Map<string, string | null>();
    for (const mapping of existingMappings || []) {
      cusipCache.set(mapping.cusip, mapping.ticker);
    }
    // Mark pending as known (null) to avoid re-lookup
    for (const mapping of pendingMappings || []) {
      cusipCache.set(mapping.cusip, null);
    }
    console.log(`Loaded ${existingMappings?.length || 0} mappings with tickers, ${pendingMappings?.length || 0} pending`);
    
    // Collect all holdings from all managers
    const allHoldings: Array<{
      holding: Holding;
      manager: typeof TRACKED_MANAGERS[0];
      filing: Filing13F;
      change: { changeType: string; changeShares: number; changePct: number; prevShares: number; prevValue: number } | undefined;
    }> = [];
    
    let managersProcessed = 0;
    
    // Phase 1: Collect all holdings
    for (const manager of TRACKED_MANAGERS) {
      console.log(`Fetching ${manager.name}...`);
      
      const accessionNumbers = await fetchRecentFilings(manager.cik);
      if (accessionNumbers.length === 0) {
        console.log(`No recent filings for ${manager.name}`);
        continue;
      }
      
      const currentFiling = await parse13FHoldings(manager.cik, accessionNumbers[0], manager.name);
      if (!currentFiling || currentFiling.holdings.length === 0) {
        console.log(`Could not parse filing for ${manager.name}`);
        continue;
      }
      
      let previousHoldings = new Map<string, { shares: number; value: number }>();
      if (accessionNumbers.length > 1) {
        const prevFiling = await parse13FHoldings(manager.cik, accessionNumbers[1], manager.name);
        if (prevFiling) {
          for (const h of prevFiling.holdings) {
            previousHoldings.set(h.cusip, { shares: h.shares, value: h.value });
          }
        }
      }
      
      const currentHoldingsMap = new Map<string, { shares: number; value: number }>();
      for (const h of currentFiling.holdings) {
        currentHoldingsMap.set(h.cusip, { shares: h.shares, value: h.value });
      }
      
      const changes = computeChanges(currentHoldingsMap, previousHoldings);
      
      for (const holding of currentFiling.holdings) {
        allHoldings.push({
          holding,
          manager,
          filing: currentFiling,
          change: changes.get(holding.cusip),
        });
      }
      
      managersProcessed++;
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`Collected ${allHoldings.length} holdings from ${managersProcessed} managers`);
    
    // Phase 2: Identify unknown CUSIPs - prioritize by frequency/value
    const cusipStats = new Map<string, { count: number; totalValue: number; name: string }>();
    
    for (const { holding } of allHoldings) {
      if (!cusipCache.has(holding.cusip)) {
        const existing = cusipStats.get(holding.cusip) || { count: 0, totalValue: 0, name: holding.nameOfIssuer };
        existing.count++;
        existing.totalValue += holding.value;
        cusipStats.set(holding.cusip, existing);
      }
    }
    
    // Sort by value (most valuable first) for OpenFIGI lookup
    const sortedUnknown = [...cusipStats.entries()]
      .sort((a, b) => b[1].totalValue - a[1].totalValue)
      .slice(0, 50) // Only lookup top 50 most valuable unknown CUSIPs per run
      .map(([cusip]) => cusip);
    
    console.log(`Found ${cusipStats.size} unknown CUSIPs, looking up top ${sortedUnknown.length} via OpenFIGI...`);
    
    // Phase 3: Batch lookup via OpenFIGI (limited to avoid timeouts)
    if (sortedUnknown.length > 0) {
      const figiResults = await lookupOpenFIGI(sortedUnknown, 5);
      console.log(`OpenFIGI resolved ${figiResults.size} tickers`);
      
      // Save ALL new mappings (including failed lookups to avoid re-trying)
      const newMappings: Array<{ cusip: string; ticker: string | null; company_name: string | null; source: string }> = [];
      
      for (const [cusip, stats] of cusipStats) {
        if (!cusipCache.has(cusip)) {
          const ticker = figiResults.get(cusip) || null;
          newMappings.push({
            cusip,
            ticker,
            company_name: stats.name,
            source: ticker ? 'openfigi' : 'pending',
          });
          cusipCache.set(cusip, ticker);
        }
      }
      
      // Batch upsert in chunks
      const chunkSize = 500;
      for (let i = 0; i < newMappings.length; i += chunkSize) {
        const chunk = newMappings.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('cusip_mappings')
          .upsert(chunk, { onConflict: 'cusip' });
        
        if (error) {
          console.error('Error saving CUSIP mappings chunk:', error.message);
        }
      }
      
      console.log(`Cached ${newMappings.length} CUSIP mappings`);
    }
    
    // Phase 4: Batch insert all holdings
    let tickersMatched = 0;
    let tickersUnmatched = 0;
    const signalsGenerated: Array<{
      ticker: string;
      manager: string;
      changeType: string;
      changePct: number;
    }> = [];
    
    // Prepare all records with checksums
    const holdingsToInsert: Array<Record<string, unknown>> = [];
    
    for (const { holding, manager, filing, change } of allHoldings) {
      const ticker = cusipCache.get(holding.cusip) || null;
      
      if (ticker) {
        tickersMatched++;
      } else {
        tickersUnmatched++;
      }
      
      const checksum = await generateChecksum({
        cik: manager.cik,
        cusip: holding.cusip,
        period: filing.periodOfReport,
      });
      
      holdingsToInsert.push({
        manager_cik: manager.cik,
        manager_name: manager.name,
        ticker,
        cusip: holding.cusip,
        company_name: holding.nameOfIssuer,
        shares: holding.shares,
        value: holding.value,
        filing_date: filing.filingDate,
        period_of_report: filing.periodOfReport,
        change_type: change?.changeType || 'unknown',
        change_shares: change?.changeShares || 0,
        change_pct: change?.changePct || 0,
        previous_shares: change?.prevShares || null,
        previous_value: change?.prevValue || null,
        source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${manager.cik}&type=13F`,
        checksum,
      });
      
      if (ticker && change && ['new', 'increase', 'decrease', 'exit'].includes(change.changeType)) {
        signalsGenerated.push({
          ticker,
          manager: manager.name,
          changeType: change.changeType,
          changePct: change.changePct,
        });
      }
    }
    
    // Batch upsert holdings in chunks of 200
    let totalInserted = 0;
    let totalSkipped = 0;
    const holdingsChunkSize = 200;
    
    for (let i = 0; i < holdingsToInsert.length; i += holdingsChunkSize) {
      const chunk = holdingsToInsert.slice(i, i + holdingsChunkSize);
      const { error, count } = await supabase
        .from('holdings_13f')
        .upsert(chunk, { onConflict: 'checksum', ignoreDuplicates: true, count: 'exact' });
      
      if (error) {
        console.error(`Batch insert error at ${i}:`, error.message);
      } else {
        totalInserted += count || chunk.length;
      }
    }
    
    console.log(`Inserted ${totalInserted} holdings`);
    
    // Phase 5: Generate signals
    for (const signal of signalsGenerated) {
      const signalType = signal.changeType === 'new' ? 'bigmoney_new_position'
        : signal.changeType === 'increase' ? 'bigmoney_increase'
        : signal.changeType === 'decrease' ? 'bigmoney_decrease'
        : signal.changeType === 'exit' ? 'bigmoney_exit'
        : 'bigmoney_hold';
      
      const direction = signal.changeType === 'exit' || signal.changeType === 'decrease' ? 'down'
        : signal.changeType === 'new' || signal.changeType === 'increase' ? 'up'
        : 'neutral';
      
      const checksum = await generateChecksum({
        signal_type: signalType,
        ticker: signal.ticker,
        manager: signal.manager,
        date: new Date().toISOString().split('T')[0],
      });
      
      await supabase.from('signals').upsert({
        signal_type: signalType,
        asset_id: null,
        direction,
        magnitude: Math.abs(signal.changePct) / 100,
        observed_at: new Date().toISOString(),
        checksum,
        source_id: `sec-13f-${signal.manager.toLowerCase().replace(/\s/g, '-')}`,
        raw: {
          manager: signal.manager,
          change_type: signal.changeType,
          change_pct: signal.changePct,
        },
        oa_citation: {
          source: `SEC 13F-HR: ${signal.manager}`,
          url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F',
          accessed_at: new Date().toISOString(),
        },
      }, { onConflict: 'checksum', ignoreDuplicates: true });
    }

    const duration = Date.now() - startTime;
    const matchRate = tickersMatched + tickersUnmatched > 0 
      ? Math.round((tickersMatched / (tickersMatched + tickersUnmatched)) * 100) 
      : 0;
    
    console.log(`Matching: ${tickersMatched}/${tickersMatched + tickersUnmatched} (${matchRate}%)`);
    console.log(`Cache: ${cusipCache.size} entries, Pending lookups: ${[...cusipStats.values()].length - sortedUnknown.length}`);

    await supabase.from('ingest_logs').insert({
      etl_name: 'ingest-sec-13f-edgar',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round(duration / 1000),
      rows_inserted: totalInserted,
      rows_skipped: totalSkipped,
      source_used: 'SEC EDGAR + OpenFIGI',
      metadata: {
        managers_processed: managersProcessed,
        signals_generated: signalsGenerated.length,
        tickers_matched: tickersMatched,
        tickers_unmatched: tickersUnmatched,
        match_rate_pct: matchRate,
        cusip_cache_size: cusipCache.size,
        unknown_cusips: cusipStats.size,
      }
    });

    return new Response(JSON.stringify({
      success: true,
      managers_processed: managersProcessed,
      holdings_inserted: totalInserted,
      holdings_skipped: totalSkipped,
      signals_generated: signalsGenerated.length,
      tickers_matched: tickersMatched,
      tickers_unmatched: tickersUnmatched,
      match_rate_pct: matchRate,
      cusip_cache_size: cusipCache.size,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in ingest-sec-13f-edgar:', error);
    
    await supabase.from('ingest_logs').insert({
      etl_name: 'ingest-sec-13f-edgar',
      status: 'error',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
      source_used: 'SEC EDGAR + OpenFIGI',
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
