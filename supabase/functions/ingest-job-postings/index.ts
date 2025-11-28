import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('Starting job postings ingestion...');
    
    const adzunaAppId = Deno.env.get('ADZUNA_APP_ID');
    const adzunaAppKey = Deno.env.get('ADZUNA_APP_KEY');

    // Fetch companies dynamically from assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name')
      .eq('asset_class', 'stock')
      .limit(20); // Process 20 companies per run
    
    if (assetsError) throw assetsError;
    
    const companies = assets?.map((a: any) => ({ ticker: a.ticker, name: a.name })) || [];

    if (!adzunaAppId || !adzunaAppKey) {
      console.log('Adzuna API credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Adzuna API credentials required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const jobPostings = [];

    for (const company of companies) {
      console.log(`Fetching job postings for ${company.name}...`);
      
      try {
        // Search for jobs from this company
        const query = encodeURIComponent(company.name);
        const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${adzunaAppId}&app_key=${adzunaAppKey}&what=${query}&content-type=application/json`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`Adzuna API failed for ${company.name}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const jobs = data.results || [];
        console.log(`Found ${jobs.length} jobs for ${company.name}`);
        
        // Group jobs by department/category
        const jobsByCategory = new Map();
        
        for (const job of jobs) {
          const title = job.title || 'Unknown Position';
          const location = job.location?.display_name || 'Remote';
          const category = job.category?.label || 'General';
          
          // Determine role type and seniority from title
          const titleLower = title.toLowerCase();
          let roleType = 'other';
          let seniority = 'mid';
          
          if (titleLower.includes('engineer') || titleLower.includes('developer')) roleType = 'engineering';
          else if (titleLower.includes('sales') || titleLower.includes('account')) roleType = 'sales';
          else if (titleLower.includes('market')) roleType = 'marketing';
          else if (titleLower.includes('product')) roleType = 'product';
          else if (titleLower.includes('data') || titleLower.includes('analyst')) roleType = 'data';
          
          if (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('principal')) seniority = 'senior';
          else if (titleLower.includes('junior') || titleLower.includes('entry')) seniority = 'entry';
          else if (titleLower.includes('director') || titleLower.includes('vp') || titleLower.includes('head')) seniority = 'director';
          
          const key = `${category}-${roleType}-${seniority}`;
          
          if (!jobsByCategory.has(key)) {
            jobsByCategory.set(key, {
              ticker: company.ticker,
              company: company.name,
              job_title: title,
              department: category,
              location: location,
              posting_count: 1,
              role_type: roleType,
              seniority_level: seniority,
              posted_date: job.created ? new Date(job.created).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              growth_indicator: 0, // Calculate based on historical data
              metadata: {
                source: 'adzuna_api',
                salary_min: job.salary_min || null,
                salary_max: job.salary_max || null,
                description: job.description?.substring(0, 200),
                company_display_name: job.company?.display_name,
              },
              created_at: new Date().toISOString(),
            });
          } else {
            const existing = jobsByCategory.get(key);
            existing.posting_count++;
          }
        }
        
        jobPostings.push(...Array.from(jobsByCategory.values()));
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.error(`Error processing ${company.name}:`, err);
      }
    }

    if (jobPostings.length > 0) {
      const { error } = await supabase
        .from('job_postings')
        .insert(jobPostings);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${jobPostings.length} real job posting records`);
    }

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-job-postings',
      status: 'success',
      rowsInserted: jobPostings.length,
      rowsSkipped: 0,
      sourceUsed: 'Adzuna',
      duration: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ success: true, count: jobPostings.length }),
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