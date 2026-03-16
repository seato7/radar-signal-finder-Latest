import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { redisCache } from '../_shared/redis-cache.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  test_suite: string;
  test_name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  ticker?: string;
  expected_result: string;
  actual_result: string;
  metadata?: any;
  error_message?: string;
  execution_time_ms: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const testResults: TestResult[] = [];
  const startTime = Date.now();

  try {
    console.log('🧪 Starting Production Test Suite - SLA Compliance');

    // ===== 1️⃣ REDIS TTL ENFORCEMENT =====
    console.log('\n1️⃣ Testing Redis TTL Enforcement...');
    const testTickers = ['AAPL', 'BTC-USD', 'EUR/USD', 'TSLA', 'ETH-USD'];
    
    for (const ticker of testTickers) {
      const testStart = Date.now();
      try {
        const cached = await redisCache.get(ticker);
        
        if (cached.hit) {
          const age = cached.age_seconds ?? 0; // use ?? not || so age of 0 seconds is valid
          const passed = age <= 5;
          
          testResults.push({
            test_suite: 'redis_ttl_enforcement',
            test_name: 'Cache TTL Validation',
            status: passed ? 'PASS' : 'FAIL',
            ticker,
            expected_result: 'age <= 5s',
            actual_result: `age = ${age.toFixed(2)}s`,
            metadata: { cache_hit: true, age_seconds: age },
            execution_time_ms: Date.now() - testStart
          });
        } else {
          testResults.push({
            test_suite: 'redis_ttl_enforcement',
            test_name: 'Cache TTL Validation',
            status: 'PASS',
            ticker,
            expected_result: 'cache miss or expired',
            actual_result: 'cache miss',
            metadata: { cache_hit: false },
            execution_time_ms: Date.now() - testStart
          });
        }
      } catch (error) {
        testResults.push({
          test_suite: 'redis_ttl_enforcement',
          test_name: 'Cache TTL Validation',
          status: 'FAIL',
          ticker,
          expected_result: 'successful cache check',
          actual_result: 'error',
          error_message: error instanceof Error ? error.message : String(error),
          execution_time_ms: Date.now() - testStart
        });
      }
    }

    // ===== 2️⃣ INGEST FUNCTION CACHING + LOGGING =====
    // NOTE: ingest-prices-yahoo REMOVED - price ingestion handled by Railway backend (Twelve Data)
    console.log('\n2️⃣ Testing Ingest Function Logging...');
    const ingestFunctions = [
      'ingest-crypto-onchain',
      'ingest-breaking-news',
      'ingest-forex-sentiment',
      'ingest-news-sentiment'
    ];

    for (const etlName of ingestFunctions) {
      const testStart = Date.now();
      try {
        const { data: logs, error } = await supabase
          .from('ingest_logs')
          .select('*')
          .eq('etl_name', etlName)
          .order('started_at', { ascending: false })
          .limit(1);

        if (error) throw error;

        if (logs && logs.length > 0) {
          const log = logs[0];
          const hasRequiredFields = 
            log.cache_hit !== null &&
            log.fallback_used !== null &&
            log.source_used !== null &&
            log.last_updated_at !== null;

          const age = log.last_updated_at 
            ? (Date.now() - new Date(log.last_updated_at).getTime()) / 1000
            : 999;

          const passed = hasRequiredFields && age <= 300; // 5 min threshold for logs

          testResults.push({
            test_suite: 'ingest_logging',
            test_name: 'Required Fields Present',
            status: passed ? 'PASS' : 'FAIL',
            expected_result: 'all required fields logged',
            actual_result: hasRequiredFields ? 'complete' : 'missing fields',
            metadata: { 
              etl_name: etlName,
              cache_hit: log.cache_hit,
              fallback_used: log.fallback_used,
              source_used: log.source_used,
              age_seconds: age.toFixed(0)
            },
            execution_time_ms: Date.now() - testStart
          });
        } else {
          testResults.push({
            test_suite: 'ingest_logging',
            test_name: 'Required Fields Present',
            status: 'WARN',
            expected_result: 'recent log entry',
            actual_result: 'no logs found',
            metadata: { etl_name: etlName },
            execution_time_ms: Date.now() - testStart
          });
        }
      } catch (error) {
        testResults.push({
          test_suite: 'ingest_logging',
          test_name: 'Required Fields Present',
          status: 'FAIL',
          expected_result: 'successful log query',
          actual_result: 'error',
          error_message: error instanceof Error ? error.message : String(error),
          execution_time_ms: Date.now() - testStart
        });
      }
    }

    // ===== 3️⃣ SLA MONITORING ENDPOINTS =====
    console.log('\n3️⃣ Testing SLA Monitoring Endpoints...');
    
    // Test /api-data-staleness
    const stalenessStart = Date.now();
    try {
      const stalenessResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/api-data-staleness`,
        {
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          }
        }
      );

      const stalenessData = await stalenessResponse.json();
      // 503 is valid when there are SLA violations (degraded state)
      const isValidResponse = (stalenessResponse.status === 200 || stalenessResponse.status === 503) && 
                             stalenessData.sla_violations !== undefined;

      testResults.push({
        test_suite: 'sla_monitoring',
        test_name: 'Data Staleness Endpoint',
        status: isValidResponse ? 'PASS' : 'FAIL',
        expected_result: 'HTTP 200 or 503 with valid response',
        actual_result: `HTTP ${stalenessResponse.status}`,
        metadata: {
          sla_violations: stalenessData.sla_violations,
          total_stale: stalenessData.total_stale_tickers,
          sla_status: stalenessData.sla_status
        },
        execution_time_ms: Date.now() - stalenessStart
      });
    } catch (error) {
      testResults.push({
        test_suite: 'sla_monitoring',
        test_name: 'Data Staleness Endpoint',
        status: 'FAIL',
        expected_result: 'successful API call',
        actual_result: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        execution_time_ms: Date.now() - stalenessStart
      });
    }

    // Test /api-alerts-errors
    const alertsStart = Date.now();
    try {
      const alertsResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/api-alerts-errors`,
        {
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          }
        }
      );

      const alertsData = await alertsResponse.json();
      // 503 is valid when there are critical alerts (degraded state)
      const isValidResponse = (alertsResponse.status === 200 || alertsResponse.status === 503) && 
                             alertsData.summary !== undefined;

      testResults.push({
        test_suite: 'sla_monitoring',
        test_name: 'Alerts & Errors Endpoint',
        status: isValidResponse ? 'PASS' : 'FAIL',
        expected_result: 'HTTP 200 or 503 with valid response',
        actual_result: `HTTP ${alertsResponse.status}`,
        metadata: {
          critical_alerts: alertsData.summary?.critical || 0,
          high_alerts: alertsData.summary?.high || 0,
          health_status: alertsData.health_status
        },
        execution_time_ms: Date.now() - alertsStart
      });
    } catch (error) {
      testResults.push({
        test_suite: 'sla_monitoring',
        test_name: 'Alerts & Errors Endpoint',
        status: 'FAIL',
        expected_result: 'successful API call',
        actual_result: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        execution_time_ms: Date.now() - alertsStart
      });
    }

    // ===== 4️⃣ FALLBACK USAGE CHECK =====
    console.log('\n4️⃣ Testing Fallback Usage...');
    const fallbackStart = Date.now();
    try {
      const { data: fallbackData, error } = await supabase.rpc('check_excessive_fallback_usage');

      if (error) throw error;

      const excessiveFallback = fallbackData && fallbackData.length > 0;

      testResults.push({
        test_suite: 'fallback_system',
        test_name: 'Fallback Usage Within Limits',
        status: excessiveFallback ? 'FAIL' : 'PASS',
        expected_result: 'fallback < 2%',
        actual_result: excessiveFallback 
          ? `${fallbackData[0].fallback_percentage}% for ${fallbackData[0].etl_name}`
          : 'within limits',
        metadata: { fallback_functions: fallbackData },
        execution_time_ms: Date.now() - fallbackStart
      });
    } catch (error) {
      testResults.push({
        test_suite: 'fallback_system',
        test_name: 'Fallback Usage Within Limits',
        status: 'FAIL',
        expected_result: 'successful fallback check',
        actual_result: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        execution_time_ms: Date.now() - fallbackStart
      });
    }

    // ===== 5️⃣ SIGNAL DISTRIBUTION CHECK =====
    console.log('\n5️⃣ Testing Signal Distribution...');
    const signalStart = Date.now();
    try {
      const { data: signalData, error } = await supabase.rpc('check_signal_distribution_skew');

      if (error) throw error;

      const isSkewed = signalData && signalData.length > 0 && signalData[0].is_skewed;

      testResults.push({
        test_suite: 'data_quality',
        test_name: 'Signal Distribution Balance',
        status: isSkewed ? 'WARN' : 'PASS',
        expected_result: 'balanced distribution',
        actual_result: isSkewed ? 'skewed' : 'balanced',
        metadata: signalData && signalData.length > 0 ? signalData[0] : {},
        execution_time_ms: Date.now() - signalStart
      });
    } catch (error) {
      testResults.push({
        test_suite: 'data_quality',
        test_name: 'Signal Distribution Balance',
        status: 'FAIL',
        expected_result: 'successful signal check',
        actual_result: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        execution_time_ms: Date.now() - signalStart
      });
    }

    // ===== 6️⃣ VIEWS VALIDATION =====
    console.log('\n6️⃣ Testing Database Views...');
    const viewsToTest = [
      { name: 'view_stale_tickers', expect_empty: true },
      { name: 'view_fallback_usage', expect_rows: true },
      { name: 'view_api_errors', expect_empty: true }
    ];

    for (const view of viewsToTest) {
      const viewStart = Date.now();
      try {
        const { data, error } = await supabase
          .from(view.name)
          .select('*')
          .limit(10);

        if (error) throw error;

        const rowCount = data?.length || 0;
        const passed = view.expect_empty ? rowCount === 0 : rowCount >= 0;

        testResults.push({
          test_suite: 'database_views',
          test_name: `View: ${view.name}`,
          status: passed ? 'PASS' : 'WARN',
          expected_result: view.expect_empty ? 'empty result' : 'valid query',
          actual_result: `${rowCount} rows`,
          metadata: { view_name: view.name, row_count: rowCount },
          execution_time_ms: Date.now() - viewStart
        });
      } catch (error) {
        testResults.push({
          test_suite: 'database_views',
          test_name: `View: ${view.name}`,
          status: 'FAIL',
          expected_result: 'successful view query',
          actual_result: 'error',
          error_message: error instanceof Error ? error.message : String(error),
          execution_time_ms: Date.now() - viewStart
        });
      }
    }

    // ===== SAVE RESULTS TO DATABASE =====
    console.log('\n💾 Saving test results to database...');
    const { error: insertError } = await supabase
      .from('ingest_logs_test_audit')
      .insert(testResults);

    if (insertError) {
      console.error('Failed to save test results:', insertError);
    }

    // ===== GENERATE SUMMARY =====
    const summary = {
      total_tests: testResults.length,
      passed: testResults.filter(r => r.status === 'PASS').length,
      failed: testResults.filter(r => r.status === 'FAIL').length,
      warnings: testResults.filter(r => r.status === 'WARN').length,
      skipped: testResults.filter(r => r.status === 'SKIP').length,
      pass_rate: ((testResults.filter(r => r.status === 'PASS').length / testResults.length) * 100).toFixed(1),
      execution_time_ms: Date.now() - startTime,
      status: testResults.filter(r => r.status === 'FAIL').length === 0 ? 'PRODUCTION_READY' : 'ISSUES_DETECTED',
      timestamp: new Date().toISOString()
    };

    console.log('\n✅ Test Suite Complete!');
    console.log(`Pass Rate: ${summary.pass_rate}%`);
    console.log(`Status: ${summary.status}`);

    return new Response(
      JSON.stringify({
        summary,
        results: testResults,
        details: {
          by_suite: testResults.reduce((acc, result) => {
            if (!acc[result.test_suite]) {
              acc[result.test_suite] = { passed: 0, failed: 0, warnings: 0, total: 0 };
            }
            acc[result.test_suite].total++;
            if (result.status === 'PASS') acc[result.test_suite].passed++;
            if (result.status === 'FAIL') acc[result.test_suite].failed++;
            if (result.status === 'WARN') acc[result.test_suite].warnings++;
            return acc;
          }, {} as Record<string, any>)
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        summary: {
          status: 'ERROR',
          total_tests: testResults.length,
          passed: testResults.filter(r => r.status === 'PASS').length,
          failed: testResults.filter(r => r.status === 'FAIL').length
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
