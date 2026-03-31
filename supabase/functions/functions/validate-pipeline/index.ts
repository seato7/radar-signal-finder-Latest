// redeployed 2026-03-17
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

    console.log('[PIPELINE-VALIDATE] Starting comprehensive pipeline validation...');

    const report: any = {
      timestamp: new Date().toISOString(),
      phases: {},
      recommendations: []
    };

    // ============================================================
    // PHASE 1: Asset Universe & Ingestion Health
    // ============================================================
    console.log('[PHASE-1] Validating Asset Universe...');
    
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('asset_class')
      .order('asset_class');

    const assetsByClass = assets?.reduce((acc: any, a) => {
      acc[a.asset_class] = (acc[a.asset_class] || 0) + 1;
      return acc;
    }, {});

    report.phases.asset_universe = {
      total_assets: assets?.length || 0,
      by_class: assetsByClass,
      status: assets && assets.length >= 20000 ? 'PASS' : 'WARNING'
    };

    // Check recent ingestion logs
    const { data: recentLogs } = await supabaseClient
      .from('ingest_logs')
      .select('etl_name, status, completed_at')
      .gte('started_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('completed_at', { ascending: false });

    const ingestionHealth = recentLogs?.reduce((acc: any, log) => {
      if (!acc[log.etl_name]) {
        acc[log.etl_name] = { success: 0, failure: 0, last_run: log.completed_at };
      }
      if (log.status === 'success') acc[log.etl_name].success++;
      else acc[log.etl_name].failure++;
      return acc;
    }, {});

    report.phases.ingestion_health = {
      functions_with_runs: Object.keys(ingestionHealth || {}).length,
      details: ingestionHealth,
      status: Object.keys(ingestionHealth || {}).length >= 20 ? 'PASS' : 'WARNING'
    };

    // ============================================================
    // PHASE 2: Signal Generation & Coverage
    // ============================================================
    console.log('[PHASE-2] Validating Signal Generation...');

    const { data: signals } = await supabaseClient
      .from('signals')
      .select('signal_type, observed_at')
      .gte('observed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const signalsByType = signals?.reduce((acc: any, s) => {
      acc[s.signal_type] = (acc[s.signal_type] || 0) + 1;
      return acc;
    }, {});

    const uniqueSignalTypes = Object.keys(signalsByType || {}).length;

    report.phases.signal_generation = {
      total_signals_24h: signals?.length || 0,
      unique_signal_types: uniqueSignalTypes,
      by_type: signalsByType,
      status: uniqueSignalTypes >= 15 ? 'PASS' : 'WARNING'
    };

    if (uniqueSignalTypes < 15) {
      report.recommendations.push({
        phase: 'signal_generation',
        issue: `Only ${uniqueSignalTypes} signal types generated (expected 20+)`,
        action: 'Trigger missing signal generators or check ingestion failures'
      });
    }

    // ============================================================
    // PHASE 3: Theme Mapping & Scoring
    // ============================================================
    console.log('[PHASE-3] Validating Theme Mapping...');

    const { data: themes } = await supabaseClient
      .from('themes')
      .select('id, name, score, updated_at');

    const { data: mappings } = await supabaseClient
      .from('signal_theme_map')
      .select('theme_id, signal_id');

    const mappingsByTheme = mappings?.reduce((acc: any, m) => {
      acc[m.theme_id] = (acc[m.theme_id] || 0) + 1;
      return acc;
    }, {});

    const themesWithScores = themes?.filter(t => t.score && t.score > 0).length || 0;
    const themesWithMappings = Object.keys(mappingsByTheme || {}).length;

    const totalMappings = Object.values(mappingsByTheme || {}).reduce((a: number, b: any) => a + b, 0);
    const avgMappings = totalMappings / (Object.keys(mappingsByTheme || {}).length || 1);
    const totalScore = themes?.reduce((sum, t) => sum + (t.score || 0), 0) || 0;
    const avgScore = totalScore / (themes?.length || 1);

    report.phases.theme_scoring = {
      total_themes: themes?.length || 0,
      themes_with_scores: themesWithScores,
      themes_with_mappings: themesWithMappings,
      avg_score: avgScore,
      mappings_per_theme: avgMappings,
      status: themesWithScores >= 6 && themesWithMappings >= 6 ? 'PASS' : 'WARNING'
    };

    if (themesWithScores < 6) {
      report.recommendations.push({
        phase: 'theme_scoring',
        issue: `Only ${themesWithScores} themes have scores`,
        action: 'Run compute-theme-scores function'
      });
    }

    // ============================================================
    // PHASE 4: Alert Generation
    // ============================================================
    console.log('[PHASE-4] Validating Alert Generation...');

    const { data: alerts } = await supabaseClient
      .from('alerts')
      .select('id, created_at, score, status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { data: users } = await supabaseClient.auth.admin.listUsers();
    
    const totalAlertScore = alerts?.reduce((sum, a) => sum + a.score, 0) || 0;
    const avgAlertScore = totalAlertScore / (alerts?.length || 1);

    report.phases.alert_generation = {
      alerts_generated_24h: alerts?.length || 0,
      total_users: users?.users?.length || 0,
      avg_alert_score: avgAlertScore,
      status: (alerts?.length || 0) > 0 ? 'PASS' : 'INFO'
    };

    // ============================================================
    // PHASE 5: Cron Schedule Validation
    // ============================================================
    console.log('[PHASE-5] Validating Cron Jobs...');

    const { data: cronJobs, error: cronError } = await supabaseClient
      .rpc('pg_cron_jobs_list', {});

    if (cronError) {
      console.warn('[PHASE-5] Could not fetch cron jobs:', cronError);
      report.phases.cron_schedule = {
        status: 'UNKNOWN',
        message: 'Could not fetch cron job list'
      };
    } else {
      report.phases.cron_schedule = {
        total_jobs: cronJobs?.length || 0,
        status: (cronJobs?.length || 0) >= 30 ? 'PASS' : 'WARNING'
      };
    }

    // ============================================================
    // OVERALL STATUS
    // ============================================================
    const phases = Object.values(report.phases);
    const passCount = phases.filter((p: any) => p.status === 'PASS').length;
    const warningCount = phases.filter((p: any) => p.status === 'WARNING').length;

    report.overall_status = {
      pass: passCount,
      warning: warningCount,
      total_phases: phases.length,
      health: passCount >= 4 ? 'HEALTHY' : warningCount > 2 ? 'DEGRADED' : 'PARTIAL'
    };

    console.log(`[PIPELINE-VALIDATE] ✅ Validation complete: ${passCount}/${phases.length} phases passing`);

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[PIPELINE-VALIDATE] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
