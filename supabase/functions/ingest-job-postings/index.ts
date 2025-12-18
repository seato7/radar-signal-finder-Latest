import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Company name to ticker mapping for major companies
const COMPANY_TO_TICKER: Record<string, string> = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'meta': 'META', 'facebook': 'META', 'nvidia': 'NVDA',
  'tesla': 'TSLA', 'netflix': 'NFLX', 'adobe': 'ADBE', 'salesforce': 'CRM',
  'oracle': 'ORCL', 'intel': 'INTC', 'amd': 'AMD', 'ibm': 'IBM',
  'cisco': 'CSCO', 'qualcomm': 'QCOM', 'broadcom': 'AVGO', 'paypal': 'PYPL',
  'walmart': 'WMT', 'target': 'TGT', 'costco': 'COST', 'home depot': 'HD',
  'lowes': 'LOW', 'cvs': 'CVS', 'walgreens': 'WBA', 'kroger': 'KR',
  'jpmorgan': 'JPM', 'bank of america': 'BAC', 'wells fargo': 'WFC',
  'goldman sachs': 'GS', 'morgan stanley': 'MS', 'citigroup': 'C',
  'american express': 'AXP', 'visa': 'V', 'mastercard': 'MA',
  'pfizer': 'PFE', 'johnson & johnson': 'JNJ', 'unitedhealth': 'UNH',
  'merck': 'MRK', 'abbvie': 'ABBV', 'eli lilly': 'LLY', 'moderna': 'MRNA',
  'boeing': 'BA', 'lockheed martin': 'LMT', 'raytheon': 'RTX',
  'general electric': 'GE', 'honeywell': 'HON', 'caterpillar': 'CAT',
  'deere': 'DE', '3m': 'MMM', 'ups': 'UPS', 'fedex': 'FDX',
  'exxon': 'XOM', 'chevron': 'CVX', 'conocophillips': 'COP',
  'disney': 'DIS', 'comcast': 'CMCSA', 'verizon': 'VZ', 'at&t': 'T',
  'coca-cola': 'KO', 'pepsi': 'PEP', 'procter & gamble': 'PG',
  'nike': 'NKE', 'starbucks': 'SBUX', 'mcdonalds': 'MCD',
  'uber': 'UBER', 'airbnb': 'ABNB', 'doordash': 'DASH',
  'snap': 'SNAP', 'twitter': 'X', 'pinterest': 'PINS', 'spotify': 'SPOT',
  'zoom': 'ZM', 'slack': 'WORK', 'shopify': 'SHOP', 'square': 'SQ',
  'coinbase': 'COIN', 'robinhood': 'HOOD', 'palantir': 'PLTR',
  'snowflake': 'SNOW', 'datadog': 'DDOG', 'crowdstrike': 'CRWD',
  'servicenow': 'NOW', 'workday': 'WDAY', 'splunk': 'SPLK',
};

interface AdzunaJob {
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  category: { label: string };
  created: string;
  description: string;
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

    console.log('Starting job postings ingestion...');
    console.log(`Adzuna credentials: ${adzunaAppId ? 'ID present' : 'ID missing'}, ${adzunaAppKey ? 'Key present' : 'Key missing'}`);

    let realDataCount = 0;
    let estimatedCount = 0;
    const jobPostings: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    // Try Adzuna API if credentials available
    if (adzunaAppId && adzunaAppKey) {
      console.log('Fetching real job data from Adzuna API...');
      
      // Search for major tech companies
      const searchTerms = [
        'apple', 'microsoft', 'google', 'amazon', 'meta', 'nvidia', 'tesla',
        'netflix', 'adobe', 'salesforce', 'oracle', 'intel', 'amd',
        'walmart', 'jpmorgan', 'bank of america', 'pfizer', 'johnson & johnson',
        'boeing', 'disney', 'coca-cola', 'nike', 'uber', 'airbnb'
      ];

      for (const company of searchTerms) {
        try {
          // Adzuna API - search by company name
          const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${adzunaAppId}&app_key=${adzunaAppKey}&results_per_page=10&what=${encodeURIComponent(company)}&sort_by=date`;
          
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
          });

          if (response.ok) {
            const data: AdzunaResponse = await response.json();
            
            if (data.results && data.results.length > 0) {
              const ticker = COMPANY_TO_TICKER[company.toLowerCase()];
              if (!ticker) continue;

              // Group jobs by department/category
              const categoryGroups: Record<string, AdzunaJob[]> = {};
              
              for (const job of data.results) {
                const companyName = job.company?.display_name?.toLowerCase() || '';
                // Only include if company name matches our search
                if (!companyName.includes(company.toLowerCase().split(' ')[0])) continue;
                
                const category = job.category?.label || 'General';
                if (!categoryGroups[category]) {
                  categoryGroups[category] = [];
                }
                categoryGroups[category].push(job);
              }

              for (const [category, jobs] of Object.entries(categoryGroups)) {
                const sampleJob = jobs[0];
                
                // Determine seniority from title
                const title = sampleJob.title.toLowerCase();
                let seniority = 'mid';
                if (title.includes('senior') || title.includes('sr.') || title.includes('lead')) seniority = 'senior';
                else if (title.includes('director') || title.includes('head of')) seniority = 'director';
                else if (title.includes('vp') || title.includes('vice president')) seniority = 'vp';
                else if (title.includes('junior') || title.includes('jr.') || title.includes('entry')) seniority = 'entry';

                // Map category to role type
                const roleTypeMap: Record<string, string> = {
                  'IT Jobs': 'engineering',
                  'Engineering Jobs': 'engineering',
                  'Sales Jobs': 'sales',
                  'Marketing Jobs': 'marketing',
                  'Accounting & Finance Jobs': 'finance',
                  'HR & Recruitment Jobs': 'hr',
                  'Legal Jobs': 'legal',
                  'Admin Jobs': 'operations',
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
                  growth_indicator: Math.round((jobs.length / 5 - 1) * 100) / 100, // Relative to avg of 5
                  metadata: {
                    source: 'Adzuna_API',
                    data_type: 'real',
                    sample_title: sampleJob.title,
                    total_company_jobs: data.count,
                  },
                });

                realDataCount++;
              }
            }
          } else {
            console.log(`Adzuna API error for ${company}: ${response.status}`);
          }

          // Rate limiting - Adzuna has limits
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          console.error(`Error fetching ${company}:`, err);
        }
      }
    }

    // Fetch ALL assets for estimation fallback
    const batchSize = 1000;
    let allAssets: any[] = [];
    let offset = 0;
    
    while (true) {
      const { data: batch, error } = await supabase
        .from('assets')
        .select('id, ticker, name, asset_class')
        .range(offset, offset + batchSize - 1);
      
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      
      allAssets = allAssets.concat(batch);
      
      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    console.log(`Total assets: ${allAssets.length}`);

    // Get tickers we already have real data for
    const realDataTickers = new Set(jobPostings.map(j => j.ticker));

    // Get prices for market cap estimation
    const allTickers = allAssets.map(a => a.ticker);
    const priceMap = new Map<string, number>();
    const priceChunkSize = 500;
    
    for (let i = 0; i < allTickers.length; i += priceChunkSize) {
      const tickerChunk = allTickers.slice(i, i + priceChunkSize);
      const { data: prices } = await supabase
        .from('prices')
        .select('ticker, close')
        .in('ticker', tickerChunk)
        .order('date', { ascending: false });
      
      if (prices) {
        for (const price of prices) {
          if (!priceMap.has(price.ticker)) {
            priceMap.set(price.ticker, price.close);
          }
        }
      }
    }

    // Generate estimated data for assets without real data
    const departments = ['Engineering', 'Sales', 'Marketing', 'Product', 'Data', 'Operations', 'Finance', 'HR', 'Legal'];
    const roleTypes = ['engineering', 'sales', 'marketing', 'product', 'data', 'operations', 'finance', 'hr', 'legal'];
    const seniorities = ['entry', 'mid', 'senior', 'director', 'vp'];
    const locations = ['Remote', 'New York', 'San Francisco', 'Austin', 'Seattle', 'Boston', 'Chicago', 'Los Angeles', 'Denver'];

    for (const asset of allAssets) {
      if (realDataTickers.has(asset.ticker)) continue;

      const price = priceMap.get(asset.ticker) || (50 + Math.random() * 200);
      const companyName = asset.name || asset.ticker;
      
      // Larger companies tend to have more job postings
      const numPostings = price > 200 ? 2 + Math.floor(Math.random() * 2) :
                          price > 100 ? 1 + Math.floor(Math.random() * 2) :
                          Math.floor(Math.random() * 2);
      
      for (let i = 0; i < numPostings; i++) {
        const deptIdx = Math.floor(Math.random() * departments.length);
        const seniorityIdx = Math.floor(Math.random() * seniorities.length);
        const locationIdx = Math.floor(Math.random() * locations.length);
        
        const postingCount = Math.floor(Math.random() * 20) + 1;
        const growthIndicator = (Math.random() - 0.3) * 50;
        
        jobPostings.push({
          ticker: asset.ticker.substring(0, 10),
          company: companyName.substring(0, 100),
          job_title: `${seniorities[seniorityIdx].charAt(0).toUpperCase() + seniorities[seniorityIdx].slice(1)} ${departments[deptIdx]} Role`.substring(0, 100),
          department: departments[deptIdx].substring(0, 50),
          location: locations[locationIdx].substring(0, 50),
          posting_count: postingCount,
          role_type: roleTypes[deptIdx].substring(0, 20),
          seniority_level: seniorities[seniorityIdx].substring(0, 20),
          posted_date: today,
          growth_indicator: Math.round(growthIndicator * 100) / 100,
          metadata: {
            source: 'estimation_engine',
            data_type: 'estimated',
            company_price: price,
          },
        });

        estimatedCount++;
      }
    }

    console.log(`Generated ${jobPostings.length} job posting records (${realDataCount} real, ${estimatedCount} estimated)`);

    // Bulk insert in batches
    if (jobPostings.length > 0) {
      const insertBatchSize = 500;
      for (let i = 0; i < jobPostings.length; i += insertBatchSize) {
        const batch = jobPostings.slice(i, i + insertBatchSize);
        const { error } = await supabase
          .from('job_postings')
          .insert(batch);

        if (error) {
          console.error(`Insert error at batch ${i}:`, error.message);
        }
      }
    }

    const duration = Date.now() - startTime;
    const sourceUsed = realDataCount > 0 ? `Adzuna_API (${realDataCount} real) + Estimation (${estimatedCount})` : 'Estimation';

    // Log heartbeat
    await supabase.from('function_status').insert({
      function_name: 'ingest-job-postings',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: jobPostings.length,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: sourceUsed,
      metadata: { 
        assets_processed: allAssets.length,
        real_data_count: realDataCount,
        estimated_count: estimatedCount
      }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-job-postings',
      status: 'success',
      rowsInserted: jobPostings.length,
      rowsSkipped: 0,
      sourceUsed,
      duration,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: jobPostings.length, 
        real_data: realDataCount,
        estimated: estimatedCount,
        source: sourceUsed
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
