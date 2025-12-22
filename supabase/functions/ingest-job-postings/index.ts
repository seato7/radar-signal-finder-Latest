import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v3 - REAL DATA ONLY - NO ESTIMATIONS
// Uses Adzuna API ONLY - no fake job data generation

// Company name to ticker mapping for major companies
const COMPANY_TO_TICKER: Record<string, string> = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'meta': 'META', 'facebook': 'META', 'nvidia': 'NVDA',
  'tesla': 'TSLA', 'netflix': 'NFLX', 'adobe': 'ADBE', 'salesforce': 'CRM',
  'oracle': 'ORCL', 'intel': 'INTC', 'amd': 'AMD', 'ibm': 'IBM',
  'cisco': 'CSCO', 'qualcomm': 'QCOM', 'broadcom': 'AVGO', 'paypal': 'PYPL',
  'walmart': 'WMT', 'target': 'TGT', 'costco': 'COST', 'home depot': 'HD',
  'jpmorgan': 'JPM', 'bank of america': 'BAC', 'wells fargo': 'WFC',
  'goldman sachs': 'GS', 'morgan stanley': 'MS', 'visa': 'V', 'mastercard': 'MA',
  'pfizer': 'PFE', 'johnson & johnson': 'JNJ', 'unitedhealth': 'UNH',
  'boeing': 'BA', 'disney': 'DIS', 'coca-cola': 'KO', 'nike': 'NKE',
  'uber': 'UBER', 'airbnb': 'ABNB', 'shopify': 'SHOP', 'coinbase': 'COIN',
};

interface AdzunaJob {
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  category: { label: string };
  created: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
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

    const adzunaAppId = Deno.env.get('ADZUNA_APP_ID');
    const adzunaAppKey = Deno.env.get('ADZUNA_APP_KEY');

    console.log('[v3] Job postings ingestion - REAL DATA ONLY, NO ESTIMATIONS');

    if (!adzunaAppId || !adzunaAppKey) {
      console.log('❌ Adzuna API credentials not configured - cannot fetch real job data');
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-job-postings',
        executed_at: new Date().toISOString(),
        status: 'no_data',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        error_message: 'ADZUNA_APP_ID or ADZUNA_APP_KEY not configured',
        metadata: { version: 'v3_no_estimation' }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-job-postings', {
        sourcesAttempted: ['Adzuna API'],
        reason: 'Adzuna API credentials not configured'
      });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Adzuna API credentials not configured',
          inserted: 0,
          version: 'v3_no_estimation'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[JOB-POSTINGS] Adzuna API: Starting real job data fetch...');
    
    const searchTerms = Object.keys(COMPANY_TO_TICKER);
    const jobPostings: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    let adzunaApiCalls = 0;
    let adzunaSuccessfulCalls = 0;

    for (const company of searchTerms) {
      try {
        const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${adzunaAppId}&app_key=${adzunaAppKey}&results_per_page=10&what=${encodeURIComponent(company)}&sort_by=date`;
        
        adzunaApiCalls++;
        
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          const data: AdzunaResponse = await response.json();
          adzunaSuccessfulCalls++;
          
          if (data.results && data.results.length > 0) {
            const ticker = COMPANY_TO_TICKER[company.toLowerCase()];
            if (!ticker) continue;

            // Group jobs by category
            const categoryGroups: Record<string, AdzunaJob[]> = {};
            
            for (const job of data.results) {
              const companyName = job.company?.display_name?.toLowerCase() || '';
              if (!companyName.includes(company.toLowerCase().split(' ')[0])) continue;
              
              const category = job.category?.label || 'General';
              if (!categoryGroups[category]) {
                categoryGroups[category] = [];
              }
              categoryGroups[category].push(job);
            }

            for (const [category, jobs] of Object.entries(categoryGroups)) {
              const sampleJob = jobs[0];
              
              const title = sampleJob.title.toLowerCase();
              let seniority = 'mid';
              if (title.includes('senior') || title.includes('sr.') || title.includes('lead')) seniority = 'senior';
              else if (title.includes('director') || title.includes('head of')) seniority = 'director';
              else if (title.includes('junior') || title.includes('jr.') || title.includes('entry')) seniority = 'entry';

              const roleTypeMap: Record<string, string> = {
                'IT Jobs': 'engineering',
                'Engineering Jobs': 'engineering',
                'Sales Jobs': 'sales',
                'Marketing Jobs': 'marketing',
                'Accounting & Finance Jobs': 'finance',
              };
              const roleType = roleTypeMap[category] || 'general';

              jobPostings.push({
                ticker,
                company: sampleJob.company?.display_name || company,
                job_title: sampleJob.title.substring(0, 100),
                department: category.replace(' Jobs', '').substring(0, 50),
                location: sampleJob.location?.display_name?.substring(0, 50) || 'United States',
                posting_count: jobs.length,
                role_type: roleType,
                seniority_level: seniority,
                posted_date: today,
                growth_indicator: Math.round((jobs.length / 5 - 1) * 100) / 100,
                metadata: {
                  source: 'Adzuna_API',
                  data_type: 'real',
                  total_company_jobs: data.count,
                  version: 'v3_no_estimation',
                },
              });
            }
            
            console.log(`✅ ${company} (${ticker}): ${Object.keys(categoryGroups).length} job categories`);
          }
        } else {
          console.log(`Adzuna API error for "${company}": HTTP ${response.status}`);
        }

        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        console.error(`Adzuna API exception for "${company}":`, err);
      }
    }
    
    console.log(`Adzuna API Summary: ${adzunaSuccessfulCalls}/${adzunaApiCalls} successful calls`);
    console.log(`Total REAL job records: ${jobPostings.length}`);

    if (jobPostings.length === 0) {
      console.log('❌ No real job data found - NOT inserting any fake data');
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-job-postings',
        executed_at: new Date().toISOString(),
        status: 'no_data',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Adzuna_API',
        metadata: { 
          version: 'v3_no_estimation',
          adzuna_api_calls: adzunaApiCalls,
          adzuna_successful_calls: adzunaSuccessfulCalls,
          reason: 'no_matching_job_data'
        }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-job-postings', {
        sourcesAttempted: ['Adzuna API'],
        reason: `API calls succeeded but no matching job data found (${adzunaSuccessfulCalls}/${adzunaApiCalls} calls)`
      });
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No real job data found - no fake data inserted',
          inserted: 0,
          version: 'v3_no_estimation'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert REAL job data only
    let insertedCount = 0;
    const insertBatchSize = 100;
    for (let i = 0; i < jobPostings.length; i += insertBatchSize) {
      const batch = jobPostings.slice(i, i + insertBatchSize);
      const { error } = await supabase
        .from('job_postings')
        .insert(batch);

      if (error) {
        console.error(`Insert error at batch ${i}:`, error.message);
      } else {
        insertedCount += batch.length;
      }
    }

    const duration = Date.now() - startTime;

    await supabase.from('function_status').insert({
      function_name: 'ingest-job-postings',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: 'Adzuna_API',
      metadata: { 
        version: 'v3_no_estimation',
        adzuna_api_calls: adzunaApiCalls,
        adzuna_successful_calls: adzunaSuccessfulCalls,
      }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-job-postings',
      status: 'success',
      rowsInserted: insertedCount,
      rowsSkipped: 0,
      sourceUsed: 'Adzuna_API (REAL DATA ONLY)',
      duration,
    });

    console.log(`✅ Inserted ${insertedCount} REAL job records - NO ESTIMATIONS`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        version: 'v3_no_estimation',
        count: insertedCount, 
        source: 'Adzuna_API',
        message: `Inserted ${insertedCount} REAL job records`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-job-postings:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-job-postings',
      message: `Job postings ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
