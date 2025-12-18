import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top institutional filers to track (by CIK)
const TRACKED_MANAGERS = [
  { cik: '0001067983', name: 'Berkshire Hathaway' },
  { cik: '0001336528', name: 'Bridgewater Associates' },
  { cik: '0001649339', name: 'Citadel Advisors' },
  { cik: '0001350694', name: 'Renaissance Technologies' },
  { cik: '0001056831', name: 'Two Sigma Investments' },
  { cik: '0001029160', name: 'DE Shaw' },
  { cik: '0001061768', name: 'Millennium Management' },
  { cik: '0001037389', name: 'AQR Capital' },
  { cik: '0001568820', name: 'Point72 Asset Management' },
  { cik: '0001167483', name: 'Elliott Investment Management' },
  { cik: '0001040273', name: 'Tiger Global Management' },
  { cik: '0001423053', name: 'Coatue Management' },
  { cik: '0001336528', name: 'Pershing Square' },
  { cik: '0001079114', name: 'Viking Global Investors' },
  { cik: '0000902219', name: 'ValueAct Capital' },
  { cik: '0001336528', name: 'Third Point' },
  { cik: '0001273087', name: 'Baupost Group' },
  { cik: '0001167557', name: 'Lone Pine Capital' },
  { cik: '0001510387', name: 'Appaloosa Management' },
  { cik: '0001656456', name: 'Druckenmiller Family Office' },
];

// Extended CUSIP to ticker mapping for common securities
const CUSIP_TO_TICKER: Record<string, string> = {
  // Mega-cap tech
  '037833100': 'AAPL', '594918104': 'MSFT', '02079K107': 'GOOGL', '02079K305': 'GOOG',
  '023135106': 'AMZN', '88160R101': 'TSLA', '30303M102': 'META', '67066G104': 'NVDA',
  // Berkshire
  '084670702': 'BRK.B', '084670108': 'BRK.A',
  // Financial
  '478160104': 'JNJ', '92826C839': 'V', '46625H100': 'JPM', '172967424': 'C',
  '38141G104': 'GS', '61746B100': 'MS', '060505104': 'BAC', '949746101': 'WFC',
  '571903107': 'MA', '09247X101': 'BLK', '78462F103': 'SPGI',
  // Consumer
  '742718109': 'PG', '931142103': 'WMT', '22160K105': 'COST', '617446448': 'MCD',
  '035229103': 'SBUX', '191216100': 'KO', '713448108': 'PEP', '654106103': 'NKE',
  // Healthcare
  '717081103': 'PFE', '58933Y105': 'MRK', '002824100': 'ABBV', '88579Y101': 'TMO',
  '91324P102': 'UNH', '532457108': 'LLY', '035420403': 'AMGN',
  // Telecom
  '00206R102': 'T', '92343V104': 'VZ', '879868103': 'TMUS',
  // Energy
  '30231G102': 'XOM', '166764100': 'CVX', '171196107': 'CHK',
  // Semiconductors
  '457030107': 'INTC', '00724F101': 'AMD', '79466L302': 'CRM', '007903107': 'AVGO',
  '87612E106': 'TXN',
  // Retail & E-commerce
  '404119109': 'HD', '501044101': 'LOW', '882681109': 'TGT',
  // Industrial
  '097023105': 'BA', '149123101': 'CAT', '369604103': 'GE',
  // Media & Entertainment
  '254687106': 'DIS', '655844108': 'NFLX',
  // ETFs
  '78464A102': 'SPY', '46090E103': 'IWM', '73935A104': 'QQQ',
  // Additional
  '931427108': 'WBA', '929160109': 'VOO',
};

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
  value: number; // in thousands
  shares: number;
  putCall?: string;
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
  // Fetch recent 13F-HR filings from SEC EDGAR
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
    
    // Find 13F-HR filings from the last 6 months
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
    
    return accessionNumbers.slice(0, 2); // Get most recent 2 filings for comparison
  } catch (e) {
    console.error(`Error fetching filings for CIK ${cik}:`, e);
    return [];
  }
}

async function parse13FHoldings(cik: string, accessionNumber: string, managerName: string): Promise<Filing13F | null> {
  const accessionFormatted = accessionNumber.replace(/-/g, '');
  const paddedCik = cik.replace(/^0+/, '').padStart(10, '0');
  
  // Try to fetch the infotable.xml file
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accessionFormatted}`;
  
  try {
    // First, get the index to find the correct file
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
    
    // Find the infotable file
    let infotableFile = items.find((f: any) => 
      f.name?.toLowerCase().includes('infotable') && f.name?.endsWith('.xml')
    );
    
    if (!infotableFile) {
      // Try alternative naming
      infotableFile = items.find((f: any) => 
        f.name?.includes('13F') && f.name?.endsWith('.xml')
      );
    }
    
    if (!infotableFile) {
      console.log(`No infotable found for ${accessionNumber}`);
      return null;
    }
    
    // Fetch the infotable XML
    const xmlUrl = `${baseUrl}/${infotableFile.name}`;
    const xmlResponse = await fetch(xmlUrl, {
      headers: { 'User-Agent': 'InvestmentResearch admin@example.com' }
    });
    
    if (!xmlResponse.ok) {
      console.log(`Failed to fetch infotable XML: ${xmlResponse.status}`);
      return null;
    }
    
    const xml = await xmlResponse.text();
    
    // Parse the XML
    const holdings: Holding[] = [];
    
    // Extract info table entries
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
    
    // Extract filing date and period from primary doc
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
    
    return {
      cik,
      managerName,
      filingDate,
      periodOfReport,
      holdings,
    };
    
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
  
  // Check current holdings against previous
  for (const [cusip, current] of currentHoldings) {
    const prev = previousHoldings.get(cusip);
    
    if (!prev) {
      // New position
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
  
  // Check for exits (in previous but not in current)
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

  try {
    // Load valid tickers
    const { data: assets } = await supabase
      .from('assets')
      .select('ticker')
      .limit(30000);
    
    const validTickers = new Set((assets || []).map(a => a.ticker.toUpperCase()));
    
    let totalInserted = 0;
    let totalSkipped = 0;
    let managersProcessed = 0;
    const signalsGenerated: Array<{
      ticker: string;
      manager: string;
      changeType: string;
      changePct: number;
    }> = [];

    // Process each tracked manager
    for (const manager of TRACKED_MANAGERS) {
      console.log(`Processing ${manager.name} (CIK: ${manager.cik})...`);
      
      const accessionNumbers = await fetchRecentFilings(manager.cik);
      if (accessionNumbers.length === 0) {
        console.log(`No recent filings for ${manager.name}`);
        continue;
      }
      
      // Parse most recent filing
      const currentFiling = await parse13FHoldings(manager.cik, accessionNumbers[0], manager.name);
      if (!currentFiling || currentFiling.holdings.length === 0) {
        console.log(`Could not parse filing for ${manager.name}`);
        continue;
      }
      
      // Parse previous filing if available for change calculation
      let previousHoldings = new Map<string, { shares: number; value: number }>();
      if (accessionNumbers.length > 1) {
        const prevFiling = await parse13FHoldings(manager.cik, accessionNumbers[1], manager.name);
        if (prevFiling) {
          for (const h of prevFiling.holdings) {
            previousHoldings.set(h.cusip, { shares: h.shares, value: h.value });
          }
        }
      }
      
      // Build current holdings map
      const currentHoldingsMap = new Map<string, { shares: number; value: number }>();
      for (const h of currentFiling.holdings) {
        currentHoldingsMap.set(h.cusip, { shares: h.shares, value: h.value });
      }
      
      // Compute changes
      const changes = computeChanges(currentHoldingsMap, previousHoldings);
      
      // Insert holdings with changes
      for (const holding of currentFiling.holdings) {
        // Map CUSIP to ticker
        let ticker: string | null = CUSIP_TO_TICKER[holding.cusip] || null;
        if (!ticker) {
          // Enhanced name matching for common stocks
          const nameUpper = holding.nameOfIssuer.toUpperCase();
          const nameMatches: Record<string, string> = {
            'APPLE': 'AAPL', 'MICROSOFT': 'MSFT', 'AMAZON': 'AMZN', 'ALPHABET': 'GOOGL',
            'GOOGLE': 'GOOGL', 'TESLA': 'TSLA', 'META': 'META', 'FACEBOOK': 'META',
            'NVIDIA': 'NVDA', 'BERKSHIRE': 'BRK.B', 'JPMORGAN': 'JPM', 'BANK OF AMERICA': 'BAC',
            'WELLS FARGO': 'WFC', 'CITIGROUP': 'C', 'GOLDMAN': 'GS', 'MORGAN STANLEY': 'MS',
            'VISA': 'V', 'MASTERCARD': 'MA', 'PROCTER': 'PG', 'WALMART': 'WMT',
            'COSTCO': 'COST', 'JOHNSON': 'JNJ', 'PFIZER': 'PFE', 'MERCK': 'MRK',
            'ABBVIE': 'ABBV', 'INTEL': 'INTC', 'AMD': 'AMD', 'SALESFORCE': 'CRM',
            'DISNEY': 'DIS', 'NETFLIX': 'NFLX', 'CHEVRON': 'CVX', 'EXXON': 'XOM',
            'AT&T': 'T', 'VERIZON': 'VZ', 'BOEING': 'BA', 'CATERPILLAR': 'CAT',
            'HOME DEPOT': 'HD', 'COCA-COLA': 'KO', 'COCA COLA': 'KO', 'PEPSI': 'PEP',
            'MCDONALD': 'MCD', 'STARBUCKS': 'SBUX', 'NIKE': 'NKE', 'ELI LILLY': 'LLY',
            'UNITEDHEALTH': 'UNH', 'BROADCOM': 'AVGO', 'ADOBE': 'ADBE', 'ORACLE': 'ORCL',
            'CISCO': 'CSCO', 'QUALCOMM': 'QCOM', 'PAYPAL': 'PYPL', 'SERVICENOW': 'NOW',
          };
          
          for (const [pattern, symbol] of Object.entries(nameMatches)) {
            if (nameUpper.includes(pattern)) {
              ticker = symbol;
              break;
            }
          }
        }
        
        // Validate ticker exists in our assets
        if (ticker && !validTickers.has(ticker)) {
          ticker = null;
        }
        
        const change = changes.get(holding.cusip);
        
        const checksum = await generateChecksum({
          cik: manager.cik,
          cusip: holding.cusip,
          period: currentFiling.periodOfReport,
        });
        
        const { error } = await supabase
          .from('holdings_13f')
          .upsert({
            manager_cik: manager.cik,
            manager_name: manager.name,
            ticker,
            cusip: holding.cusip,
            company_name: holding.nameOfIssuer,
            shares: holding.shares,
            value: holding.value,
            filing_date: currentFiling.filingDate,
            period_of_report: currentFiling.periodOfReport,
            change_type: change?.changeType || 'unknown',
            change_shares: change?.changeShares || 0,
            change_pct: change?.changePct || 0,
            previous_shares: change?.prevShares || null,
            previous_value: change?.prevValue || null,
            source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${manager.cik}&type=13F`,
            checksum,
          }, { onConflict: 'checksum' });
        
        if (error && error.code !== '23505') {
          console.error('Insert error:', error);
        } else if (!error) {
          totalInserted++;
          
          // Track significant changes for signal generation
          if (ticker && change && ['new', 'increase', 'decrease', 'exit'].includes(change.changeType)) {
            signalsGenerated.push({
              ticker,
              manager: manager.name,
              changeType: change.changeType,
              changePct: change.changePct,
            });
          }
        } else {
          totalSkipped++;
        }
      }
      
      managersProcessed++;
      
      // Rate limiting for SEC API
      await new Promise(r => setTimeout(r, 200));
    }

    // Generate signals for significant changes
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
        asset_id: null, // Will be linked later
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

    // Log ingestion
    await supabase.from('ingest_logs').insert({
      etl_name: 'ingest-sec-13f-edgar',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round(duration / 1000),
      rows_inserted: totalInserted,
      rows_skipped: totalSkipped,
      source_used: 'SEC EDGAR',
      metadata: {
        managers_processed: managersProcessed,
        signals_generated: signalsGenerated.length,
        tracked_managers: TRACKED_MANAGERS.length,
      }
    });

    return new Response(JSON.stringify({
      success: true,
      managers_processed: managersProcessed,
      holdings_inserted: totalInserted,
      holdings_skipped: totalSkipped,
      signals_generated: signalsGenerated.length,
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
      source_used: 'SEC EDGAR',
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
