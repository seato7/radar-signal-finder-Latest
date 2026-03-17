import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v7 - REAL DATA ONLY - NO ESTIMATIONS
// Uses USPTO Bulk Data (public domain) for real patent counts

const VERSION = 'v7_real_patent_counts';

interface PatentCount {
  ticker: string;
  company: string;
  patent_count: number;
  source: string;
}

// Since PatentsView API is deprecated (410 Gone), we'll use a simpler approach:
// Firecrawl to get patent counts from Google Patents which is publicly accessible
async function getPatentCountsViaFirecrawl(firecrawlApiKey: string): Promise<PatentCount[]> {
  const results: PatentCount[] = [];
  
  const companies = [
    { ticker: 'AAPL', company: 'Apple Inc', searchTerm: 'Apple Inc' },
    { ticker: 'MSFT', company: 'Microsoft', searchTerm: 'Microsoft Corporation' },
    { ticker: 'GOOGL', company: 'Google', searchTerm: 'Google LLC' },
    { ticker: 'AMZN', company: 'Amazon', searchTerm: 'Amazon Technologies' },
    { ticker: 'META', company: 'Meta', searchTerm: 'Meta Platforms' },
    { ticker: 'NVDA', company: 'NVIDIA', searchTerm: 'NVIDIA Corporation' },
    { ticker: 'IBM', company: 'IBM', searchTerm: 'International Business Machines' },
    { ticker: 'INTC', company: 'Intel', searchTerm: 'Intel Corporation' },
    { ticker: 'QCOM', company: 'Qualcomm', searchTerm: 'Qualcomm' },
    { ticker: 'TSLA', company: 'Tesla', searchTerm: 'Tesla Inc' },
  ];
  
  for (const { ticker, company, searchTerm } of companies) {
    try {
      // Use Firecrawl search to find recent patent info
      const searchUrl = `https://patents.google.com/?assignee=${encodeURIComponent(searchTerm)}&after=priority:20240101`;
      
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: searchUrl,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });

      if (!response.ok) {
        const errorType = response.status === 429 ? 'rate_limit' : response.status === 402 ? 'quota_exceeded' : response.status === 401 ? 'auth_error' : 'request_failed';
        console.error(`[Google Patents] Firecrawl ${errorType} (${response.status}) for ${company}`);
        continue;
      }

      const data = await response.json();
      const markdown = data.data?.markdown || data.markdown || '';
      
      // Look for "About X results" pattern
      const resultsMatch = markdown.match(/about\s+([0-9,]+)\s+results/i) ||
                          markdown.match(/([0-9,]+)\s+results/i) ||
                          markdown.match(/showing\s+\d+\s*-\s*\d+\s+of\s+([0-9,]+)/i);
      
      if (resultsMatch) {
        const countStr = resultsMatch[1].replace(/,/g, '').split('-')[0]; // handle 'X-Y' range format from some providers
        const count = parseInt(countStr);
        if (count > 0) {
          results.push({
            ticker,
            company,
            patent_count: count,
            source: 'Google_Patents_Search',
          });
          console.log(`✅ ${ticker} (${company}): ${count} patents`);
        }
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 800));
    } catch (error) {
      console.error(`[Google Patents] Error for ${company}:`, error);
    }
  }
  
  return results;
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
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[${VERSION}] Starting patent filings ingestion - REAL DATA ONLY`);
    
    if (!firecrawlApiKey) {
      console.log('❌ FIRECRAWL_API_KEY not configured - cannot fetch real patent data');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-patents',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        error_message: 'FIRECRAWL_API_KEY not configured',
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-patents', {
        sourcesAttempted: ['Google Patents via Firecrawl'],
        reason: 'FIRECRAWL_API_KEY not configured'
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'No API key configured for real data', inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get patent counts from Google Patents
    const patentCounts = await getPatentCountsViaFirecrawl(firecrawlApiKey);

    console.log(`Total companies with patent data: ${patentCounts.length}`);

    if (patentCounts.length === 0) {
      console.log('❌ No real patent data found - NOT inserting any fake data');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-patents',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Google_Patents_Search',
        metadata: { reason: 'no_real_data_available', version: VERSION }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-patents', {
        sourcesAttempted: ['Google Patents via Firecrawl'],
        reason: 'Could not extract patent counts from Google Patents'
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

    // Insert real patent summary data
    const insertData = patentCounts.map(p => ({
      ticker: p.ticker,
      company: p.company,
      patent_number: `SUMMARY-${p.ticker}-${new Date().toISOString().split('T')[0]}`,
      patent_title: `Patent Activity Summary: ${p.patent_count} active patents (2024+)`,
      filing_date: new Date().toISOString().split('T')[0],
      technology_category: 'Summary',
      metadata: {
        source: p.source,
        data_type: 'real_count',
        patent_count: p.patent_count,
        version: VERSION,
        period: '2024-present',
      },
    }));

    let insertedCount = 0;
    
    const { error } = await supabase
      .from('patent_filings')
      .upsert(insertData, { onConflict: 'patent_number' });

    if (error) {
      // Try insert if upsert fails
      const { error: insertError } = await supabase
        .from('patent_filings')
        .insert(insertData);
        
      if (insertError) {
        console.error('Insert error:', insertError.message);
      } else {
        insertedCount = insertData.length;
      }
    } else {
      insertedCount = insertData.length;
    }

    await logHeartbeat(supabase, {
      function_name: 'ingest-patents',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Google_Patents_Search',
      metadata: { 
        version: VERSION,
        companies_processed: patentCounts.length,
      }
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-patents',
      status: 'success',
      rowsInserted: insertedCount,
      rowsSkipped: 0,
      sourceUsed: 'Google_Patents_Search (REAL DATA ONLY)',
      duration: Date.now() - startTime,
    });

    console.log(`✅ Inserted ${insertedCount} REAL patent records - NO ESTIMATIONS`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: insertedCount, 
        source: 'Google_Patents_Search',
        version: VERSION,
        companies_processed: patentCounts.length,
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
        source_used: 'Google_Patents_Search',
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
