// redeployed 2026-03-17
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    let totalRowsCount = 0;
    
    const tables = [
      'prices',
      'advanced_technicals',
      'pattern_recognition',
      'forex_technicals',
      'signals',
      'news_sentiment_aggregate',
      'social_signals',
      'search_trends',
      'economic_indicators',
      'cot_reports',
      'forex_sentiment',
      'options_flow',
      'dark_pool_activity',
      'ai_research_reports',
      'crypto_onchain_metrics',
      'smart_money_flow',
      'breaking_news',
      'congressional_trades',
      'earnings_sentiment',
      'job_postings',
      'patent_filings',
      'short_interest'
    ];

    // FIX: Per-table timestamp column mapping (many tables don't use created_at)
    const tableTimestampCol: Record<string, string> = {
      'prices': 'last_updated_at',
      'advanced_technicals': 'timestamp',
      'forex_technicals': 'timestamp',
      'signals': 'observed_at',
      'cot_reports': 'report_date',
      'forex_sentiment': 'timestamp',
      'options_flow': 'trade_date',
      'dark_pool_activity': 'trade_date',
      'crypto_onchain_metrics': 'timestamp',
      'smart_money_flow': 'timestamp',
      'congressional_trades': 'transaction_date',
      'short_interest': 'report_date',
    };
    
    const diagnostics: any[] = [];
    
    for (const table of tables) {
      try {
        // Count total rows
        const countRes = await fetch(
          `${supabaseUrl}/rest/v1/${table}?select=count`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'count=exact'
            }
          }
        );
        const countHeader = countRes.headers.get('content-range');
        const totalRows = countHeader ? parseInt(countHeader.split('/')[1]) : 0;
        
        // Get most recent row using correct timestamp column per table
        const tsCol = tableTimestampCol[table] || 'created_at';
        const recentRes = await fetch(
          `${supabaseUrl}/rest/v1/${table}?select=${tsCol}&order=${tsCol}.desc&limit=1`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const recentData = await recentRes.json();
        const lastUpdate = recentData[0]?.[tsCol] || null;
        
        // Calculate freshness
        const hoursOld = lastUpdate 
          ? (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60)
          : null;
        
        const status = !totalRows ? 'empty' 
          : hoursOld === null ? 'unknown'
          : hoursOld < 2 ? 'fresh'
          : hoursOld < 24 ? 'stale'
          : 'very_stale';
        
        diagnostics.push({
          table,
          total_rows: totalRows,
          last_update: lastUpdate,
          hours_old: hoursOld ? Math.round(hoursOld * 10) / 10 : null,
          status
        });
        
        totalRowsCount += totalRows;
        
      } catch (err) {
        diagnostics.push({
          table,
          error: err instanceof Error ? err.message : String(err),
          status: 'error'
        });
      }
    }
    
    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-diagnostics',
      status: 'success',
      rows_inserted: totalRowsCount,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: 'database_scan',
      metadata: { tables_scanned: diagnostics.length }
    });
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-diagnostics',
      status: 'success',
      duration,
      rowsInserted: totalRowsCount,
      rowsSkipped: 0,
      sourceUsed: 'database_scan',
      metadata: { tables_scanned: diagnostics.length },
    });

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      tables: diagnostics,
      summary: {
        total: diagnostics.length,
        empty: diagnostics.filter(d => d.status === 'empty').length,
        fresh: diagnostics.filter(d => d.status === 'fresh').length,
        stale: diagnostics.filter(d => d.status === 'stale').length,
        very_stale: diagnostics.filter(d => d.status === 'very_stale').length,
        errors: diagnostics.filter(d => d.status === 'error').length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-diagnostics',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: 'database_scan',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // Send Slack failure alert
    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-diagnostics',
      message: `Diagnostics failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });

    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
