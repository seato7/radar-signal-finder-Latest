import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top institutional filers to track (by CIK) - Top 10 most important
const TRACKED_MANAGERS = [
  { cik: '0001067983', name: 'Berkshire Hathaway' },
  { cik: '0001336528', name: 'Bridgewater Associates' },
  { cik: '0001649339', name: 'Citadel Advisors' },
  { cik: '0001350694', name: 'Renaissance Technologies' },
  { cik: '0001056831', name: 'Two Sigma Investments' },
  { cik: '0001029160', name: 'DE Shaw' },
  { cik: '0001568820', name: 'Point72 Asset Management' },
  { cik: '0001167483', name: 'Elliott Investment Management' },
  { cik: '0001040273', name: 'Tiger Global Management' },
  { cik: '0001423053', name: 'Coatue Management' },
];

// Extended CUSIP to ticker mapping for common securities (150+ stocks)
const CUSIP_TO_TICKER: Record<string, string> = {
  // Mega-cap tech
  '037833100': 'AAPL', '594918104': 'MSFT', '02079K107': 'GOOGL', '02079K305': 'GOOG',
  '023135106': 'AMZN', '88160R101': 'TSLA', '30303M102': 'META', '67066G104': 'NVDA',
  // Berkshire
  '084670702': 'BRK.B', '084670108': 'BRK.A',
  // Financial - Major Banks
  '92826C839': 'V', '46625H100': 'JPM', '172967424': 'C',
  '38141G104': 'GS', '61746B100': 'MS', '060505104': 'BAC', '949746101': 'WFC',
  '571903107': 'MA', '09247X101': 'BLK', '78462F103': 'SPGI',
  '02005N100': 'ALLY', '075887109': 'BK', '1248572D9': 'COF', '29976E109': 'ETFC',
  '78486Q101': 'SCHW', '816851109': 'STT', '844741108': 'USB',
  // Consumer
  '742718109': 'PG', '931142103': 'WMT', '22160K105': 'COST', '617446448': 'MCD',
  '035229103': 'SBUX', '191216100': 'KO', '713448108': 'PEP', '654106103': 'NKE',
  '532716109': 'LMT', '169656105': 'CMG', '550021109': 'LULU', '886547108': 'TJX',
  '743315103': 'DHI', '531229102': 'LEN', '723787107': 'PM', '01609W102': 'MO',
  // Healthcare
  '717081103': 'PFE', '58933Y105': 'MRK', '00287Y109': 'ABBV', '88579Y101': 'TMO',
  '91324P102': 'UNH', '532457108': 'LLY', '035420403': 'AMGN', '002824100': 'ABT',
  '075896300': 'BMY', '449903206': 'IDXX', '45168D104': 'ISRG', '60855R100': 'MOH',
  '458140100': 'INTU', '882568103': 'TDG', '478160104': 'JNJ',
  // Telecom
  '00206R102': 'T', '92343V104': 'VZ', '879868103': 'TMUS', '17275R102': 'CSCO',
  // Energy
  '30231G102': 'XOM', '166764100': 'CVX', '171196107': 'CHK', '20825C104': 'COP',
  '29379V107': 'EPD', '674599105': 'OXY', '759509102': 'SLB', '91911N102': 'VLO',
  // Semiconductors
  '457030107': 'INTC', '00724F101': 'AMD', '79466L302': 'CRM', '007903107': 'AVGO',
  '87612E106': 'TXN', '00826F306': 'ADI', '595017104': 'MU', '55354G100': 'MRVL',
  '883556102': 'TSM', '04364L108': 'ARM', '034435108': 'ANET', '53814L108': 'LRCX',
  '482740100': 'KLAC', '871503108': 'SNPS', '127387108': 'CDNS', '007924106': 'AMAT',
  // Retail & E-commerce
  '404119109': 'HD', '501044101': 'LOW', '882681109': 'TGT',
  '29355A107': 'EBAY', '81762P102': 'SHOP', '01917E109': 'BABA', '37045V100': 'GM',
  // Industrial
  '097023105': 'BA', '149123101': 'CAT', '369604103': 'GE', '438516106': 'HON',
  '912810RL8': 'UNP', '20030N101': 'CME', '260543103': 'DOW', '231021106': 'DE',
  '443320106': 'HUM', '345370860': 'F', '29273V100': 'ETN',
  // Media & Entertainment
  '254687106': 'DIS', '655844108': 'NFLX', '92556H206': 'VIAC', '29444U700': 'EA',
  '025816109': 'ATVI', '16411R208': 'CHTR', '20030J109': 'CMCSA', '87936R104': 'TTWO',
  // Tech Growth
  '69608A108': 'PLTR', '90353T100': 'UBER', '00971T101': 'ABNB', '12468P104': 'CRWD',
  '23804L103': 'DDOG', '60937P106': 'MDB', '233377602': 'DASH', '831659108': 'SNOW',
  '852234103': 'SQ', '98980F104': 'ZM', '833131107': 'SPOT', '256677105': 'DOCU',
  '18915M107': 'COIN', '78267T109': 'ROKU', '09075V102': 'BKR',
  // ETFs
  '78464A102': 'SPY', '46090E103': 'IWM', '73935A104': 'QQQ', '78468R663': 'XLF',
  '78468R689': 'XLE', '78468R671': 'XLK', '464287804': 'IVV', '922908363': 'VTI',
  '922908769': 'VOO', '46434V407': 'EFA', '78463V103': 'GLD',
  // Real Estate
  '756109104': 'AMT', '29444U502': 'EQIX', '74340W103': 'PLD', '835898102': 'O',
  '29261A100': 'EXR', '03027X100': 'AMH',
  // Insurance & Financial Services
  '053611109': 'AXP', '125896100': 'CB', '008479108': 'AFL', '628298103': 'NCR',
  '701094104': 'PAYX', '59156R108': 'MET', '715826109': 'AON',
  // Additional common holdings
  '406216101': 'HAL', '116794207': 'BRK', '42806J700': 'HTZ', '11271J107': 'BN',
  '43300A203': 'HLT', '44267T102': 'HHC', '76131D103': 'QSR', '812215200': 'SEG',
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
    // Load ALL assets with name and ticker for dynamic matching (paginated)
    let allAssets: Array<{ticker: string, name: string}> = [];
    let offset = 0;
    const pageSize = 10000;
    
    while (true) {
      const { data: page, error } = await supabase
        .from('assets')
        .select('ticker, name')
        .range(offset, offset + pageSize - 1);
      
      if (error) {
        console.error('Asset fetch error:', error);
        break;
      }
      
      if (!page || page.length === 0) break;
      allAssets = allAssets.concat(page);
      offset += pageSize;
      
      if (page.length < pageSize) break;
    }
    
    console.log(`Loaded ${allAssets.length} total assets`);
    
    const validTickers = new Set(allAssets.map(a => a.ticker.toUpperCase()));
    
    // Build name-to-ticker lookup (normalize names for matching)
    const nameToTicker = new Map<string, string>();
    const wordToTickers = new Map<string, string[]>();
    
    for (const asset of allAssets) {
      const name = asset.name?.toUpperCase() || '';
      const ticker = asset.ticker.toUpperCase();
      
      // Exact name match
      nameToTicker.set(name, ticker);
      
      // Also index by significant words (3+ chars, not common words)
      const words = name.split(/[\s,.-]+/).filter((w: string) => 
        w.length >= 3 && !['INC', 'CORP', 'LTD', 'LLC', 'PLC', 'THE', 'AND', 'COM', 'CLASS'].includes(w)
      );
      for (const word of words) {
        if (!wordToTickers.has(word)) {
          wordToTickers.set(word, []);
        }
        wordToTickers.get(word)!.push(ticker);
      }
    }
    
    console.log(`Loaded ${validTickers.size} tickers and ${nameToTicker.size} name mappings`);
    
    // Function to find ticker from company name
    function findTickerFromName(issuerName: string): string | null {
      const nameUpper = issuerName.toUpperCase().trim();
      
      // 1. Try CUSIP mapping first
      // (handled before this function is called)
      
      // 2. Try exact name match
      if (nameToTicker.has(nameUpper)) {
        return nameToTicker.get(nameUpper)!;
      }
      
      // 3. Try common variations (remove INC, CORP, etc.)
      const cleanName = nameUpper
        .replace(/\s+(INC|CORP|CORPORATION|LTD|LIMITED|PLC|LLC|CO|COMPANY|HOLDINGS?|GROUP|ENTERPRISES?)\.?$/i, '')
        .replace(/,\s*(INC|CORP|LTD)\.?$/i, '')
        .trim();
      
      if (nameToTicker.has(cleanName)) {
        return nameToTicker.get(cleanName)!;
      }
      
      // 4. Try first significant word match (for unique company names)
      const words = cleanName.split(/[\s,.-]+/).filter((w: string) => 
        w.length >= 4 && !['INC', 'CORP', 'LTD', 'LLC', 'PLC', 'THE', 'AND', 'COM', 'CLASS', 'COMMON', 'STOCK'].includes(w)
      );
      
      if (words.length > 0) {
        const firstWord = words[0];
        const matches = wordToTickers.get(firstWord);
        if (matches && matches.length === 1) {
          // Only return if unambiguous match
          return matches[0];
        }
        // Try first two words for more unique matching
        if (words.length >= 2) {
          const twoWordMatches = wordToTickers.get(words[0])?.filter(t => {
            const assetName = [...nameToTicker.entries()].find(([_, v]) => v === t)?.[0] || '';
            return assetName.includes(words[1]);
          });
          if (twoWordMatches && twoWordMatches.length === 1) {
            return twoWordMatches[0];
          }
        }
      }
      
      // 5. Hardcoded common name patterns (fallback)
      const nameMatches: Record<string, string> = {
        'APPLE': 'AAPL', 'MICROSOFT': 'MSFT', 'AMAZON': 'AMZN', 'ALPHABET': 'GOOGL',
        'GOOGLE': 'GOOGL', 'TESLA': 'TSLA', 'META PLATFORMS': 'META', 'FACEBOOK': 'META',
        'NVIDIA': 'NVDA', 'BERKSHIRE': 'BRK.B', 'JPMORGAN': 'JPM', 'BANK OF AMERICA': 'BAC',
        'WELLS FARGO': 'WFC', 'CITIGROUP': 'C', 'GOLDMAN SACHS': 'GS', 'MORGAN STANLEY': 'MS',
        'VISA INC': 'V', 'MASTERCARD': 'MA', 'PROCTER': 'PG', 'WALMART': 'WMT',
        'COSTCO': 'COST', 'JOHNSON & JOHNSON': 'JNJ', 'PFIZER': 'PFE', 'MERCK': 'MRK',
        'ABBVIE': 'ABBV', 'INTEL CORP': 'INTC', 'ADVANCED MICRO': 'AMD', 'SALESFORCE': 'CRM',
        'DISNEY': 'DIS', 'NETFLIX': 'NFLX', 'CHEVRON': 'CVX', 'EXXON': 'XOM',
        'AT&T': 'T', 'VERIZON': 'VZ', 'BOEING': 'BA', 'CATERPILLAR': 'CAT',
        'HOME DEPOT': 'HD', 'COCA-COLA': 'KO', 'COCA COLA': 'KO', 'PEPSICO': 'PEP',
        'MCDONALD': 'MCD', 'STARBUCKS': 'SBUX', 'NIKE': 'NKE', 'ELI LILLY': 'LLY',
        'UNITEDHEALTH': 'UNH', 'BROADCOM': 'AVGO', 'ADOBE': 'ADBE', 'ORACLE': 'ORCL',
        'CISCO': 'CSCO', 'QUALCOMM': 'QCOM', 'PAYPAL': 'PYPL', 'SERVICENOW': 'NOW',
        'SNOWFLAKE': 'SNOW', 'UBER': 'UBER', 'AIRBNB': 'ABNB', 'PALANTIR': 'PLTR',
        'CROWDSTRIKE': 'CRWD', 'DATADOG': 'DDOG', 'SHOPIFY': 'SHOP', 'SQUARE': 'SQ',
        'BLOCK INC': 'SQ', 'SPOTIFY': 'SPOT', 'ZOOM VIDEO': 'ZM', 'DOCUSIGN': 'DOCU',
        'TWILIO': 'TWLO', 'OKTA': 'OKTA', 'SPLUNK': 'SPLK', 'PALO ALTO': 'PANW',
        'FORTINET': 'FTNT', 'ZSCALER': 'ZS', 'CLOUDFLARE': 'NET', 'MONGODB': 'MDB',
        'ELASTIC': 'ESTC', 'CONFLUENT': 'CFLT', 'HASHICORP': 'HCP', 'GITLAB': 'GTLB',
        'COINBASE': 'COIN', 'ROBINHOOD': 'HOOD', 'SOFI': 'SOFI', 'AFFIRM': 'AFRM',
        'DOORDASH': 'DASH', 'INSTACART': 'CART', 'RIVIAN': 'RIVN', 'LUCID': 'LCID',
        'NIO': 'NIO', 'XPENG': 'XPEV', 'LI AUTO': 'LI', 'GENERAL MOTORS': 'GM',
        'FORD MOTOR': 'F', 'STELLANTIS': 'STLA', 'TOYOTA': 'TM', 'HONDA': 'HMC',
        'TAIWAN SEMI': 'TSM', 'ASML': 'ASML', 'APPLIED MATERIAL': 'AMAT', 'LAM RESEARCH': 'LRCX',
        'KLA CORP': 'KLAC', 'SYNOPSYS': 'SNPS', 'CADENCE': 'CDNS', 'MARVELL': 'MRVL',
        'MICRON': 'MU', 'WESTERN DIGITAL': 'WDC', 'SEAGATE': 'STX', 'NETAPP': 'NTAP',
      };
      
      for (const [pattern, symbol] of Object.entries(nameMatches)) {
        if (nameUpper.includes(pattern)) {
          if (validTickers.has(symbol)) {
            return symbol;
          }
        }
      }
      
      return null;
    }
    
    let totalInserted = 0;
    let totalSkipped = 0;
    let managersProcessed = 0;
    let tickersMatched = 0;
    let tickersUnmatched = 0;
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
        // Map CUSIP to ticker - try multiple methods
        let ticker: string | null = CUSIP_TO_TICKER[holding.cusip] || null;
        
        if (!ticker) {
          // Try dynamic name matching
          ticker = findTickerFromName(holding.nameOfIssuer);
        }
        
        // Validate ticker exists in our assets
        if (ticker && !validTickers.has(ticker.toUpperCase())) {
          ticker = null;
        }
        
        if (ticker) {
          tickersMatched++;
        } else {
          tickersUnmatched++;
          // Log unmatched for debugging (sample only)
          if (tickersUnmatched <= 20) {
            console.log(`Unmatched: ${holding.nameOfIssuer} (CUSIP: ${holding.cusip})`);
          }
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
    const matchRate = tickersMatched + tickersUnmatched > 0 
      ? Math.round((tickersMatched / (tickersMatched + tickersUnmatched)) * 100) 
      : 0;
    
    console.log(`Ticker matching: ${tickersMatched} matched, ${tickersUnmatched} unmatched (${matchRate}% match rate)`);

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
        tickers_matched: tickersMatched,
        tickers_unmatched: tickersUnmatched,
        match_rate_pct: matchRate,
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
