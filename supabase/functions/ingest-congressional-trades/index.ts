import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// Parse relative dates like "2 days ago", "1 week ago"
function parseRelativeDate(dateStr: string): string | null {
  const now = new Date();
  const lower = dateStr.toLowerCase().trim();
  
  // Match patterns like "2 days ago", "1 week ago", etc.
  const match = lower.match(/(\d+)\s*(day|days|week|weeks|month|months|hour|hours)\s*ago/);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    
    if (unit.startsWith('day')) {
      now.setDate(now.getDate() - amount);
    } else if (unit.startsWith('week')) {
      now.setDate(now.getDate() - (amount * 7));
    } else if (unit.startsWith('month')) {
      now.setMonth(now.getMonth() - amount);
    } else if (unit.startsWith('hour')) {
      now.setHours(now.getHours() - amount);
    }
    return now.toISOString().split('T')[0];
  }
  
  // Try direct date parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  // Return null for unparseable dates — don't default to today for historical trades
  return null;
}

// Parse amount ranges like "1K–15K", "15K–50K", "1M–5M"
function parseAmountRange(amountStr: string): { min: number | null; max: number | null } {
  if (!amountStr) return { min: null, max: null };
  
  const clean = amountStr.replace(/[$,\s]/g, '').toUpperCase();
  
  // Handle ranges with dash or en-dash
  const rangeMatch = clean.match(/(\d+\.?\d*)(K|M)?[–\-−](\d+\.?\d*)(K|M)?/i);
  if (rangeMatch) {
    const [, minVal, minUnit, maxVal, maxUnit] = rangeMatch;
    const minMultiplier = minUnit === 'M' ? 1000000 : minUnit === 'K' ? 1000 : 1;
    const maxMultiplier = maxUnit === 'M' ? 1000000 : maxUnit === 'K' ? 1000 : 1;
    
    return {
      min: Math.round(parseFloat(minVal) * minMultiplier),
      max: Math.round(parseFloat(maxVal) * maxMultiplier)
    };
  }
  
  // Single value with multiplier
  const singleMatch = clean.match(/(\d+\.?\d*)(K|M)?/i);
  if (singleMatch) {
    const [, val, unit] = singleMatch;
    const multiplier = unit === 'M' ? 1000000 : unit === 'K' ? 1000 : 1;
    const amount = Math.round(parseFloat(val) * multiplier);
    return { min: amount, max: amount };
  }
  
  return { min: null, max: null };
}

// Normalize ticker symbols (e.g., "T:US" → "T", "AMD:US" → "AMD")
function normalizeTicker(ticker: string): string {
  if (!ticker) return '';
  return ticker.split(':')[0].toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
}

// Parse party and chamber from combined strings like "RepublicanHouseKY"
function parsePartyAndChamber(combined: string): { party: string; chamber: string | null } {
  const lower = combined.toLowerCase();
  
  let party = 'Unknown';
  let chamber: string | null = null;
  
  if (lower.includes('republican') || lower.includes('rep.') || lower.includes('(r)')) {
    party = 'Republican';
  } else if (lower.includes('democrat') || lower.includes('dem.') || lower.includes('(d)')) {
    party = 'Democrat';
  } else if (lower.includes('independent') || lower.includes('(i)')) {
    party = 'Independent';
  }
  
  if (lower.includes('house') || lower.includes('representative')) {
    chamber = 'House';
  } else if (lower.includes('senate') || lower.includes('senator')) {
    chamber = 'Senate';
  }
  
  return { party, chamber };
}

// Parse trades directly from Capitol Trades markdown format
function parseCapitolTradesMarkdown(markdown: string): any[] {
  const trades: any[] = [];
  
  // Capitol Trades format pattern:
  // [sell2 days ago\n\n**AT&T Inc** T:US\n\n**Hal Rogers** \n\nRepublicanHouseKY\n\n1K–15K](url)
  const tradePattern = /\[(buy|sell)(\d+\s*(?:day|days|week|weeks|month|months|hour|hours)\s*ago)[^\]]*\*\*([^*]+)\*\*\s*([A-Z]+(?::[A-Z]+)?)[^\]]*\*\*([^*]+)\*\*[^\]]*?([A-Za-z]+(?:House|Senate)[A-Z]{2})[^\]]*?(\d+[KM]?[–\-−]\d+[KM]?)/gi;
  
  let match;
  while ((match = tradePattern.exec(markdown)) !== null) {
    const [, txType, dateStr, companyName, ticker, representative, partyInfo, amountStr] = match;
    
    const { party, chamber } = parsePartyAndChamber(partyInfo);
    const { min, max } = parseAmountRange(amountStr);
    const normalizedTicker = normalizeTicker(ticker);
    const txDate = parseRelativeDate(dateStr);
    
    if (normalizedTicker && representative.trim()) {
      trades.push({
        representative: representative.trim(),
        ticker: normalizedTicker,
        transaction_type: txType.toLowerCase(),
        transaction_date: txDate,
        party,
        chamber,
        amount_min: min,
        amount_max: max,
        company_name: companyName.trim()
      });
    }
  }
  
  // Alternative simpler pattern for different formatting
  const simplePattern = /\*\*([^*]+)\*\*.*?([A-Z]{1,5})(?::[A-Z]+)?.*?(buy|sell|purchase|sale).*?(\d+[KM]?[–\-−]\d+[KM]?)/gi;
  
  while ((match = simplePattern.exec(markdown)) !== null) {
    const [, name, ticker, txType, amountStr] = match;
    const { min, max } = parseAmountRange(amountStr);
    const normalizedTicker = normalizeTicker(ticker);
    
    // Avoid duplicates
    const exists = trades.some(t => 
      t.ticker === normalizedTicker && 
      t.representative.toLowerCase().includes(name.toLowerCase().substring(0, 10))
    );
    
    if (!exists && normalizedTicker && name.trim()) {
      trades.push({
        representative: name.trim(),
        ticker: normalizedTicker,
        transaction_type: txType.toLowerCase().includes('sell') || txType.toLowerCase().includes('sale') ? 'sell' : 'buy',
        transaction_date: new Date().toISOString().split('T')[0],
        party: 'Unknown',
        chamber: null,
        amount_min: min,
        amount_max: max
      });
    }
  }
  
  return trades;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[CONGRESSIONAL] Starting congressional trades ingestion...');
    
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    let allMarkdownContent: string[] = [];
    let regexParsedTrades: any[] = [];
    let sourceUsed = '';

    // PRIMARY SOURCE: Capitol Trades
    console.log('[CONGRESSIONAL] Scraping Capitol Trades (primary source)...');
    try {
      const scrapeResponse = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://www.capitoltrades.com/trades',
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 5000
        }),
      });

      if (scrapeResponse.ok) {
        const scrapeData = await scrapeResponse.json();
        const markdown = scrapeData.data?.markdown || scrapeData.markdown;
        
        if (markdown && markdown.length > 100) {
          console.log(`[CONGRESSIONAL] Capitol Trades scraped: ${markdown.length} chars`);
          allMarkdownContent.push(markdown);
          sourceUsed = 'capitoltrades.com';
          
          // Try regex parsing first
          regexParsedTrades = parseCapitolTradesMarkdown(markdown);
          console.log(`[CONGRESSIONAL] Regex pre-parsed ${regexParsedTrades.length} trades`);
        } else {
          console.log('[CONGRESSIONAL] Capitol Trades returned insufficient content');
        }
      } else {
        console.warn('[CONGRESSIONAL] Capitol Trades scrape failed:', scrapeResponse.status);
      }
    } catch (err) {
      console.warn('[CONGRESSIONAL] Capitol Trades scrape error:', err);
    }

    // FALLBACK 1: Quiver Quantitative
    if (allMarkdownContent.length === 0) {
      console.log('[CONGRESSIONAL] Trying Quiver Quantitative (fallback 1)...');
      try {
        const quiverResponse = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: 'https://www.quiverquant.com/congresstrading/',
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 5000
          }),
        });

        if (quiverResponse.ok) {
          const quiverData = await quiverResponse.json();
          const markdown = quiverData.data?.markdown || quiverData.markdown;
          
          if (markdown && markdown.length > 100) {
            console.log(`[CONGRESSIONAL] Quiver scraped: ${markdown.length} chars`);
            allMarkdownContent.push(markdown);
            sourceUsed = 'quiverquant.com';
          }
        }
      } catch (err) {
        console.warn('[CONGRESSIONAL] Quiver scrape error:', err);
      }
    }

    // FALLBACK 2: Search for congressional trading news
    if (allMarkdownContent.length === 0) {
      console.log('[CONGRESSIONAL] Trying Firecrawl search (fallback 2)...');
      try {
        const searchResponse = await fetch(`${FIRECRAWL_API_URL}/search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'congress stock trades disclosure 2024 site:capitoltrades.com OR site:quiverquant.com',
            limit: 5,
            scrapeOptions: { formats: ['markdown'] }
          }),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.data && Array.isArray(searchData.data)) {
            for (const result of searchData.data) {
              if (result.markdown && result.markdown.length > 100) {
                allMarkdownContent.push(result.markdown);
              }
            }
            if (allMarkdownContent.length > 0) {
              sourceUsed = 'firecrawl_search';
              console.log(`[CONGRESSIONAL] Search found ${searchData.data.length} results`);
            }
          }
        }
      } catch (err) {
        console.warn('[CONGRESSIONAL] Search error:', err);
      }
    }

    console.log(`[CONGRESSIONAL] Total markdown sources: ${allMarkdownContent.length}, source: ${sourceUsed || 'none'}`);

    if (allMarkdownContent.length === 0) {
      console.log('[CONGRESSIONAL] No content from any source');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-congressional-trades',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none (all sources blocked)',
      });

      return new Response(
        JSON.stringify({ success: true, inserted: 0, skipped: 0, message: 'No sources available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Combine all markdown
    const combinedContent = allMarkdownContent.join('\n\n---\n\n');

    // Use AI to extract trades (either enhance regex results or extract from scratch)
    let trades: any[] = regexParsedTrades.length > 0 ? regexParsedTrades : [];
    
    // If regex didn't find trades, use AI extraction
    if (trades.length === 0) {
      console.log('[CONGRESSIONAL] Using AI extraction...');
      
      const aiPrompt = `You are a congressional trading data extractor. Extract stock trades from the provided content.

IMPORTANT PARSING RULES:
- Dates like "2 days ago" mean ${new Date(Date.now() - 2*24*60*60*1000).toISOString().split('T')[0]}
- Dates like "1 week ago" mean ${new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0]}
- Today's date is ${new Date().toISOString().split('T')[0]}
- Tickers like "T:US" should be normalized to "T"
- Amount ranges like "1K–15K" means min=1000, max=15000
- Amount ranges like "1M–5M" means min=1000000, max=5000000
- "RepublicanHouseKY" means party=Republican, chamber=House
- "DemocratSenateCA" means party=Democrat, chamber=Senate

Extract congressional stock trades from this content. Return a JSON array with this structure:
[{
  "representative": "Full Name",
  "ticker": "SYMBOL (without :US suffix)",
  "transaction_type": "buy" or "sell",
  "transaction_date": "YYYY-MM-DD (convert relative dates)",
  "amount_min": number,
  "amount_max": number,
  "party": "Democrat" or "Republican" or "Independent" or "Unknown",
  "chamber": "Senate" or "House" or null
}]

Return valid JSON array only.

Content:
${combinedContent.substring(0, 20000)}`;

      const aiContent = await callGemini(aiPrompt, 4000);

      if (aiContent) {
        try {
          const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            trades = JSON.parse(jsonMatch[0]);
            console.log(`[CONGRESSIONAL] AI extracted ${trades.length} trades`);
          }
        } catch (parseError) {
          console.error('[CONGRESSIONAL] Failed to parse AI response:', parseError);
        }
      } else {
        console.error('[CONGRESSIONAL] AI extraction returned null');
      }
    }

    console.log(`[CONGRESSIONAL] Total trades to insert: ${trades.length}`);

    // Build records and batch upsert (was one-at-a-time)
    let inserted = 0;
    let skipped = 0;
    const records = [];

    for (const trade of trades) {
      if (!trade.representative || !trade.ticker) { skipped++; continue; }
      const normalizedTicker = normalizeTicker(trade.ticker);
      if (!normalizedTicker || normalizedTicker.length > 10) { skipped++; continue; }

      const txDate = trade.transaction_date || null; // null if unparseable — don't default to today
      let chamber: string | null = null;
      if (trade.chamber) {
        const c = trade.chamber.toLowerCase();
        if (c === 'house' || c === 'senate') chamber = c;
      }
      const txType = (trade.transaction_type || 'buy').toLowerCase();
      const validTxType = ['buy', 'sell', 'exchange'].includes(txType) ? txType : 'buy';

      records.push({
        ticker: normalizedTicker,
        representative: String(trade.representative).trim().substring(0, 100),
        party: trade.party || 'Unknown',
        chamber,
        transaction_type: validTxType,
        transaction_date: txDate,
        filed_date: txDate,
        amount_min: typeof trade.amount_min === 'number' ? trade.amount_min : null,
        amount_max: typeof trade.amount_max === 'number' ? trade.amount_max : null,
        metadata: {
          data_source: sourceUsed || 'firecrawl_congressional',
          ingested_at: new Date().toISOString(),
          parsing_method: regexParsedTrades.length > 0 ? 'regex' : 'ai',
        },
      });
    }

    // Batch upsert in chunks of 50
    for (let i = 0; i < records.length; i += 50) {
      const batch = records.slice(i, i + 50);
      const { error } = await supabase.from('congressional_trades').upsert(batch, {
        onConflict: 'representative,ticker,transaction_date,transaction_type',
        ignoreDuplicates: true
      });
      if (error) {
        console.error('[CONGRESSIONAL] Batch upsert error:', error.message);
        skipped += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    console.log(`[CONGRESSIONAL] ✅ Inserted ${inserted}, skipped ${skipped} (source: ${sourceUsed})`);

    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: Date.now() - startTime,
      source_used: sourceUsed || 'firecrawl',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-congressional-trades',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: sourceUsed || 'firecrawl',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted, 
        skipped,
        source: sourceUsed,
        tradesFound: trades.length,
        regexParsed: regexParsedTrades.length,
        parsingMethod: regexParsedTrades.length > 0 ? 'regex' : 'ai'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CONGRESSIONAL] ❌ Error:', error);
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-congressional-trades',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'firecrawl',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    await slackAlerter.sendCriticalAlert({
      type: 'api_reliability',
      etlName: 'ingest-congressional-trades',
      message: `Congressional trades failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
