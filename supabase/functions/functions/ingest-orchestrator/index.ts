import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const slackAlerter = new SlackAlerter();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const { frequency = 'all' } = await req.json().catch(() => ({}));
    
    // Define ingestion jobs by frequency
    // NOTE: ingest-prices-yahoo REMOVED - price ingestion handled by Railway backend (Twelve Data)
    const jobs = {
      hourly: [
        'ingest-advanced-technicals',
        'ingest-forex-technicals',
        'ingest-news-sentiment',
        'ingest-breaking-news'
      ],
      daily: [
        'ingest-pattern-recognition',
        'ingest-cot-reports',
        'ingest-forex-sentiment',
        'ingest-crypto-onchain',
        'ingest-dark-pool',
        'ingest-smart-money',
        'ingest-search-trends',
        'ingest-economic-calendar',
        'ingest-congressional-trades',
        'ingest-earnings',
        'ingest-options-flow',
        'ingest-short-interest',
        'ingest-job-postings',
        'ingest-patents'
      ],
      weekly: [
        'generate-ai-research',
        'mine-and-discover-themes'
      ]
    };
    
    let toRun: string[] = [];
    if (frequency === 'all') {
      toRun = [...jobs.hourly, ...jobs.daily, ...jobs.weekly];
    } else if (frequency === 'hourly') {
      toRun = jobs.hourly;
    } else if (frequency === 'daily') {
      toRun = [...jobs.hourly, ...jobs.daily];
    } else if (frequency === 'weekly') {
      toRun = [...jobs.hourly, ...jobs.daily, ...jobs.weekly];
    }
    
    console.log(`Running ${toRun.length} ingestion jobs (${frequency})...`);
    
    const results: any[] = [];
    
    for (const funcName of toRun) {
      try {
        console.log(`Invoking ${funcName}...`);
        
        const funcRes = await fetch(
          `${supabaseUrl}/functions/v1/${funcName}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
          }
        );
        
        const result = await funcRes.json();
        
        results.push({
          function: funcName,
          success: funcRes.ok,
          status: funcRes.status,
          result: result
        });
        
        // Rate limiting between jobs
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (err) {
        results.push({
          function: funcName,
          success: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-orchestrator',
      status: 'success',
      rowsInserted: summary.successful,
      rowsSkipped: summary.failed,
      sourceUsed: `${frequency} batch`,
      duration: Date.now() - startTime,
    });
    
    return new Response(JSON.stringify({
      success: true,
      frequency,
      summary,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-orchestrator',
      message: `Orchestrator failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
