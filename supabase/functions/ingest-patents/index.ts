import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v6 - REAL DATA ONLY - NO ESTIMATIONS
// Uses USPTO PatentsView API (free, no key required) for real patent data

const VERSION = 'v6_patentsview_api';
const PATENTSVIEW_API = 'https://api.patentsview.org/patents/query';

interface PatentData {
  ticker: string;
  company: string;
  patent_number: string;
  patent_title: string;
  filing_date: string;
  technology_category: string;
  source: string;
}

// Company to ticker mapping for patent searches
const COMPANY_MAPPINGS: Record<string, { name: string; variations: string[] }> = {
  'AAPL': { name: 'Apple Inc.', variations: ['Apple Inc', 'Apple, Inc'] },
  'MSFT': { name: 'Microsoft Corporation', variations: ['Microsoft Corp', 'Microsoft Technology'] },
  'GOOGL': { name: 'Google LLC', variations: ['Google Inc', 'Alphabet Inc'] },
  'AMZN': { name: 'Amazon Technologies', variations: ['Amazon.com', 'Amazon Inc'] },
  'META': { name: 'Meta Platforms', variations: ['Facebook Inc', 'Facebook, Inc'] },
  'NVDA': { name: 'NVIDIA Corporation', variations: ['Nvidia Corp'] },
  'IBM': { name: 'International Business Machines', variations: ['IBM Corp'] },
  'INTC': { name: 'Intel Corporation', variations: ['Intel Corp'] },
  'QCOM': { name: 'Qualcomm Incorporated', variations: ['Qualcomm Inc'] },
  'AMD': { name: 'Advanced Micro Devices', variations: ['AMD Inc'] },
  'TSLA': { name: 'Tesla, Inc.', variations: ['Tesla Inc', 'Tesla Motors'] },
  'CRM': { name: 'Salesforce, Inc.', variations: ['Salesforce.com'] },
  'ORCL': { name: 'Oracle Corporation', variations: ['Oracle Corp', 'Oracle International'] },
};

// Fetch patents from PatentsView API
async function fetchPatentsFromAPI(assignee: string, ticker: string): Promise<PatentData[]> {
  const results: PatentData[] = [];
  
  try {
    // Get patents from the last year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const dateStr = oneYearAgo.toISOString().split('T')[0];
    
    // PatentsView API query
    const query = {
      _and: [
        { _contains: { assignee_organization: assignee } },
        { _gte: { patent_date: dateStr } }
      ]
    };
    
    const fields = [
      'patent_number',
      'patent_title',
      'patent_date',
      'patent_type',
      'assignee_organization'
    ];
    
    const requestBody = {
      q: JSON.stringify(query),
      f: JSON.stringify(fields),
      o: JSON.stringify({ per_page: 25 })
    };
    
    const params = new URLSearchParams(requestBody);
    
    console.log(`[PatentsView] Fetching patents for ${assignee}...`);
    
    const response = await fetch(`${PATENTSVIEW_API}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[PatentsView] API error for ${assignee}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const patents = data.patents || [];
    
    console.log(`[PatentsView] Found ${patents.length} patents for ${assignee}`);
    
    for (const patent of patents) {
      const title = patent.patent_title || '';
      
      // Categorize based on title keywords
      let category = 'General';
      const titleLower = title.toLowerCase();
      if (titleLower.includes('artificial') || titleLower.includes('machine learning') || titleLower.includes('neural') || titleLower.includes('deep learning')) {
        category = 'AI/ML';
      } else if (titleLower.includes('semiconductor') || titleLower.includes('chip') || titleLower.includes('transistor') || titleLower.includes('integrated circuit')) {
        category = 'Semiconductor';
      } else if (titleLower.includes('cloud') || titleLower.includes('server') || titleLower.includes('distributed')) {
        category = 'Cloud Computing';
      } else if (titleLower.includes('software') || titleLower.includes('computer') || titleLower.includes('method') || titleLower.includes('system')) {
        category = 'Software';
      } else if (titleLower.includes('medical') || titleLower.includes('health') || titleLower.includes('therapeutic') || titleLower.includes('diagnostic')) {
        category = 'Medical';
      } else if (titleLower.includes('battery') || titleLower.includes('solar') || titleLower.includes('energy') || titleLower.includes('electric vehicle')) {
        category = 'Clean Energy';
      } else if (titleLower.includes('wireless') || titleLower.includes('antenna') || titleLower.includes('communication') || titleLower.includes('5g')) {
        category = 'Wireless/Communications';
      } else if (titleLower.includes('display') || titleLower.includes('screen') || titleLower.includes('pixel')) {
        category = 'Display Technology';
      }
      
      results.push({
        ticker,
        company: assignee,
        patent_number: patent.patent_number || '',
        patent_title: (title || '').substring(0, 200),
        filing_date: patent.patent_date || new Date().toISOString().split('T')[0],
        technology_category: category,
        source: 'USPTO_PatentsView_API',
      });
    }
    
    return results;
  } catch (error) {
    console.error(`[PatentsView] Error fetching for ${assignee}:`, error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  let supabase: any;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[${VERSION}] Starting patent filings ingestion - REAL DATA ONLY via PatentsView API`);
    
    const allPatents: PatentData[] = [];
    
    // Fetch patents for each company
    for (const [ticker, { name, variations }] of Object.entries(COMPANY_MAPPINGS)) {
      // Try main company name first
      let patents = await fetchPatentsFromAPI(name, ticker);
      
      // If no results, try variations
      if (patents.length === 0) {
        for (const variation of variations) {
          patents = await fetchPatentsFromAPI(variation, ticker);
          if (patents.length > 0) break;
        }
      }
      
      if (patents.length > 0) {
        allPatents.push(...patents);
        console.log(`✅ ${ticker}: ${patents.length} patents`);
      }
      
      // Rate limit between requests
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Total real patents found: ${allPatents.length}`);

    if (allPatents.length === 0) {
      console.log('❌ No real patent data found - NOT inserting any fake data');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-patents',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'USPTO_PatentsView_API',
        metadata: { reason: 'no_real_data_available', version: VERSION }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-patents', {
        sourcesAttempted: ['USPTO PatentsView API'],
        reason: 'No patents found for tracked companies in the last year'
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No real patent data found - no fake data inserted',
          inserted: 0,
          version: VERSION
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduplicate by patent number
    const uniquePatents = Array.from(
      new Map(allPatents.map(p => [p.patent_number, p])).values()
    );

    // Insert real patent data
    const insertData = uniquePatents.map(p => ({
      ticker: p.ticker.substring(0, 10),
      company: p.company.substring(0, 100),
      patent_number: p.patent_number.substring(0, 20),
      patent_title: p.patent_title.substring(0, 200),
      filing_date: p.filing_date,
      technology_category: p.technology_category.substring(0, 50),
      metadata: {
        source: p.source,
        data_type: 'real',
        version: VERSION,
      },
    }));

    let insertedCount = 0;
    const insertBatchSize = 100;
    
    for (let i = 0; i < insertData.length; i += insertBatchSize) {
      const batch = insertData.slice(i, i + insertBatchSize);
      
      // Upsert to avoid duplicates
      const { error } = await supabase
        .from('patent_filings')
        .upsert(batch, { onConflict: 'patent_number' });

      if (error) {
        // If upsert fails (no unique constraint), try insert
        const { error: insertError } = await supabase
          .from('patent_filings')
          .insert(batch);
          
        if (insertError) {
          console.error(`Insert error at batch ${i}:`, insertError.message);
        } else {
          insertedCount += batch.length;
        }
      } else {
        insertedCount += batch.length;
      }
    }

    await logHeartbeat(supabase, {
      function_name: 'ingest-patents',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'USPTO_PatentsView_API',
      metadata: { 
        version: VERSION,
        companies_processed: Object.keys(COMPANY_MAPPINGS).length,
        unique_patents: uniquePatents.length
      }
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-patents',
      status: 'success',
      rowsInserted: insertedCount,
      rowsSkipped: 0,
      sourceUsed: 'USPTO_PatentsView_API (REAL DATA ONLY)',
      duration: Date.now() - startTime,
    });

    console.log(`✅ Inserted ${insertedCount} REAL patent records - NO ESTIMATIONS`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: insertedCount, 
        source: 'USPTO_PatentsView_API',
        version: VERSION,
        companies_processed: Object.keys(COMPANY_MAPPINGS).length,
        message: `Inserted ${insertedCount} REAL patent records`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Fatal error in ingest-patents:', errorMsg);
    
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-patents',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'USPTO_PatentsView_API',
        error_message: errorMsg,
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-patents',
      message: `Patents ingestion failed: ${errorMsg}`,
    });
    
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
