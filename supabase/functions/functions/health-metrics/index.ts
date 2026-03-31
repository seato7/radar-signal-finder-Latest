import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Call diagnostics function
    const diagRes = await fetch(
      `${supabaseUrl}/functions/v1/ingest-diagnostics`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const diagnostics = await diagRes.json();
    
    // Calculate health score
    const tables = diagnostics.tables || [];
    const totalTables = tables.length;
    const emptyTables = tables.filter((t: any) => t.status === 'empty').length;
    const freshTables = tables.filter((t: any) => t.status === 'fresh').length;
    const staleTables = tables.filter((t: any) => t.status === 'stale').length;
    const veryStale = tables.filter((t: any) => t.status === 'very_stale').length;
    const errors = tables.filter((t: any) => t.status === 'error').length;
    
    // Health score: 0-100
    const healthScore = Math.round(
      ((freshTables * 100 + staleTables * 50 + veryStale * 10) / (totalTables - emptyTables - errors)) || 0
    );
    
    // Determine overall status
    let overallStatus = 'healthy';
    if (healthScore < 30 || errors > 5) overallStatus = 'critical';
    else if (healthScore < 60 || veryStale > 10) overallStatus = 'degraded';
    else if (healthScore < 80 || staleTables > 15) overallStatus = 'warning';
    
    // Alert on critical tables
    const criticalTables = ['prices', 'signals', 'advanced_technicals', 'news_sentiment_aggregate'];
    const criticalIssues = tables.filter((t: any) => 
      criticalTables.includes(t.table) && 
      (t.status === 'empty' || t.status === 'very_stale' || t.status === 'error')
    );
    
    const recommendations: any[] = [];
    
    // Generate recommendations
    if (emptyTables > 5) {
      recommendations.push({
        priority: 'high',
        message: `${emptyTables} tables are empty. Run orchestrator to populate.`,
        action: 'POST /functions/v1/ingest-orchestrator {"frequency":"all"}'
      });
    }
    
    if (veryStale > 5) {
      recommendations.push({
        priority: 'medium',
        message: `${veryStale} tables are very stale (>24h old). Schedule daily refreshes.`,
        action: 'Set up cron job for daily ingestion'
      });
    }
    
    if (criticalIssues.length > 0) {
      recommendations.push({
        priority: 'critical',
        message: `Critical tables need attention: ${criticalIssues.map((t: any) => t.table).join(', ')}`,
        action: 'Investigate ETL failures immediately'
      });
    }
    
    const response = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      health_score: healthScore,
      summary: {
        total_tables: totalTables,
        empty: emptyTables,
        fresh: freshTables,
        stale: staleTables,
        very_stale: veryStale,
        errors
      },
      critical_issues: criticalIssues.map((t: any) => ({
        table: t.table,
        status: t.status,
        hours_old: t.hours_old,
        total_rows: t.total_rows
      })),
      recommendations,
      tables
    };
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: overallStatus === 'critical' ? 503 : 200
    });
    
  } catch (error) {
    console.error('Health check error:', error);
    return new Response(JSON.stringify({ 
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
