import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-JOBS] Starting job postings signal generation...');

    // Get job postings from last 90 days
    const { data: jobs, error: jobsError } = await supabaseClient
      .from('job_postings')
      .select('*')
      .gte('posted_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('posted_date', { ascending: false });

    if (jobsError) throw jobsError;

    console.log(`[SIGNAL-GEN-JOBS] Found ${jobs?.length || 0} job postings`);

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No job postings to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset IDs for tickers
    const tickers = [...new Set(jobs.map(j => j.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Aggregate job postings by ticker and date to detect hiring momentum
    const jobsByTicker = new Map<string, any[]>();
    for (const job of jobs) {
      if (!jobsByTicker.has(job.ticker)) {
        jobsByTicker.set(job.ticker, []);
      }
      jobsByTicker.get(job.ticker)!.push(job);
    }

    // Create signals from job posting patterns
    const signals = [];
    for (const [ticker, tickerJobs] of jobsByTicker.entries()) {
      const assetId = tickerToAssetId.get(ticker);
      if (!assetId) continue;

      // Group by posted_date to detect momentum
      const jobsByDate = new Map<string, number>();
      for (const job of tickerJobs) {
        const date = job.posted_date;
        jobsByDate.set(date, (jobsByDate.get(date) || 0) + (job.posting_count || 1));
      }

      // Sort dates and calculate trend
      const sortedDates = Array.from(jobsByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      
      for (let i = 0; i < sortedDates.length; i++) {
        const [date, count] = sortedDates[i];
        
        // Calculate magnitude based on job count and growth indicator
        const avgGrowth = tickerJobs
          .filter(j => j.posted_date === date && j.growth_indicator)
          .reduce((sum, j) => sum + (j.growth_indicator || 0), 0) / tickerJobs.filter(j => j.posted_date === date).length;
        
        // Higher count = stronger expansion signal
        const magnitude = Math.min(1.0, (count / 50) + (avgGrowth || 0) / 2);
        const direction = avgGrowth > 0.1 ? 'up' : 'neutral';
        
        const signalData = {
          ticker,
          signal_type: 'capex_hiring',
          posted_date: date,
          count
        };
        
        signals.push({
          asset_id: assetId,
          signal_type: 'capex_hiring',
          direction,
          magnitude,
          observed_at: new Date(date).toISOString(),
          value_text: `${count} job posting${count > 1 ? 's' : ''} - ${tickerJobs[0]?.company || ticker}`,
          checksum: JSON.stringify(signalData),
          citation: {
            source: 'Adzuna Job Postings',
            timestamp: new Date().toISOString()
          },
          raw: {
            posting_count: count,
            growth_indicator: avgGrowth,
            departments: [...new Set(tickerJobs.filter(j => j.posted_date === date).map(j => j.department).filter(Boolean))]
          }
        });
      }
    }

    // Insert signals
    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-JOBS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-JOBS] ✅ Created ${signals.length} capex/hiring momentum signals`);

    return new Response(JSON.stringify({ 
      success: true,
      jobs_processed: jobs.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-JOBS] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
