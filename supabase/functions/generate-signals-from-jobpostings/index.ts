// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { fireAiScoring } from '../_shared/fire-ai-scoring.ts';

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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-JOBS] Starting job postings signal generation...');

    const { data: jobs, error: jobsError } = await supabaseClient
      .from('job_postings')
      .select('*')
      .gte('posted_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('posted_date', { ascending: false });

    if (jobsError) throw jobsError;

    console.log(`[SIGNAL-GEN-JOBS] Found ${jobs?.length || 0} job postings`);

    if (!jobs || jobs.length === 0) {
      const duration = Date.now() - startTime;
      
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-jobpostings',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'job_postings',
      });
      
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-jobpostings',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No job postings to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(jobs.map(j => j.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map(a => [a.id, a.ticker]) || []);

    const jobsByTicker = new Map<string, any[]>();
    for (const job of jobs) {
      if (!jobsByTicker.has(job.ticker)) {
        jobsByTicker.set(job.ticker, []);
      }
      jobsByTicker.get(job.ticker)!.push(job);
    }

    const signals = [];
    for (const [ticker, tickerJobs] of jobsByTicker.entries()) {
      const assetId = tickerToAssetId.get(ticker);
      if (!assetId) continue;

      const jobsByDate = new Map<string, number>();
      for (const job of tickerJobs) {
        const date = job.posted_date;
        jobsByDate.set(date, (jobsByDate.get(date) || 0) + (job.posting_count || 1));
      }

      const sortedDates = Array.from(jobsByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      
      for (let i = 0; i < sortedDates.length; i++) {
        const [date, count] = sortedDates[i];
        if (!count || count <= 0) continue; // skip zero job count
        
        const dateJobs = tickerJobs.filter(j => j.posted_date === date && j.growth_indicator);
        const avgGrowth = dateJobs.length > 0
          ? dateJobs.reduce((sum, j) => sum + (j.growth_indicator || 0), 0) / dateJobs.length
          : 0; // guard: prevent NaN when denominator is 0
        
        const baseMagnitude = Math.abs(count / 10) + Math.abs(avgGrowth || 0) * 2.5;
        const magnitude = Math.max(0, Math.min(5, baseMagnitude * 5));
        const direction = avgGrowth > 0.1 ? 'up' : avgGrowth < -0.1 ? 'down' : 'neutral';
        
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

    const { error: insertError } = await supabaseClient
      .from('signals')
      .upsert(signals, { onConflict: 'checksum', ignoreDuplicates: true });

    if (insertError) {
      console.error('[SIGNAL-GEN-JOBS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-JOBS] ✅ Created ${signals.length} capex/hiring momentum signals`);

    if (signals.length > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;

    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-jobpostings',
      status: 'success',
      rows_inserted: signals.length,
      duration_ms: duration,
      source_used: 'job_postings',
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-jobpostings',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: signals.length,
    });

    return new Response(JSON.stringify({ 
      success: true,
      jobs_processed: jobs.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-JOBS] ❌ Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-jobpostings',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error)),
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-jobpostings',
      message: error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error)),
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error)) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
