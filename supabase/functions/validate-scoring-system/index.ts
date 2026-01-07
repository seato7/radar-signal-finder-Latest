import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  name: string;
  passed: boolean;
  actual: number | string | null;
  expected: string;
  critical: boolean;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: TestResult[] = [];

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[VALIDATE-SCORING] Starting comprehensive scoring validation...');

    // ========================================================================
    // TEST 1: Momentum signals exist (last 24 hours)
    // ========================================================================
    const { count: momentumCount, error: momentumError } = await supabaseClient
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .like('signal_type', 'momentum_%')
      .gte('observed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    results.push({
      name: 'momentum_signals_exist_24h',
      passed: !momentumError && (momentumCount ?? 0) >= 100,
      actual: momentumCount ?? 0,
      expected: '>= 100',
      critical: true,
      message: momentumError ? momentumError.message : `Found ${momentumCount} momentum signals in last 24h`
    });

    // ========================================================================
    // TEST 2: All expected signal types exist (last 24 hours)
    // ========================================================================
    const expectedSignalTypes = [
      'momentum_5d_bullish', 'momentum_5d_bearish',
      'momentum_20d_bullish', 'momentum_20d_bearish',
      'smart_money_accumulation', 'smart_money_distribution',
      'breaking_news_bullish', 'breaking_news_bearish',
      'onchain_accumulation', 'onchain_distribution'
    ];

    const { data: signalTypes } = await supabaseClient
      .from('signals')
      .select('signal_type')
      .gte('observed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const uniqueSignalTypes = new Set(signalTypes?.map(s => s.signal_type) || []);
    const missingTypes = expectedSignalTypes.filter(t => !uniqueSignalTypes.has(t));

    results.push({
      name: 'expected_signal_types_present',
      passed: missingTypes.length <= 3, // Allow up to 3 missing (some may not generate daily)
      actual: `${expectedSignalTypes.length - missingTypes.length}/${expectedSignalTypes.length} present`,
      expected: '>= 7/10 expected types',
      critical: true,
      message: missingTypes.length > 0 ? `Missing: ${missingTypes.join(', ')}` : 'All expected signal types present'
    });

    // ========================================================================
    // TEST 3: No old unmapped signal types being created (last 1 hour)
    // ========================================================================
    const oldSignalTypes = ['momentum_5d', 'momentum_20d', 'smart_money_flow', 'forex_rsi', 'forex_sentiment'];
    const { count: oldTypeCount, error: oldTypeError } = await supabaseClient
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .in('signal_type', oldSignalTypes)
      .gte('observed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    results.push({
      name: 'no_old_signal_types_created',
      passed: !oldTypeError && (oldTypeCount ?? 0) === 0,
      actual: oldTypeCount ?? 0,
      expected: '0',
      critical: true,
      message: oldTypeError ? oldTypeError.message : `${oldTypeCount} old signal types created in last hour`
    });

    // ========================================================================
    // TEST 4: Signal type diversity (should have many different types)
    // ========================================================================
    const { data: typeDistribution } = await supabaseClient
      .from('signals')
      .select('signal_type')
      .gte('observed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const typeCounts = new Map<string, number>();
    for (const sig of typeDistribution || []) {
      typeCounts.set(sig.signal_type, (typeCounts.get(sig.signal_type) || 0) + 1);
    }

    results.push({
      name: 'signal_type_diversity',
      passed: typeCounts.size >= 15,
      actual: typeCounts.size,
      expected: '>= 15 unique types',
      critical: false,
      message: `Top types: ${[...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(', ')}`
    });

    // ========================================================================
    // TEST 5: Score-return correlation check (7-day forward returns)
    // ========================================================================
    const { data: scoreReturnData } = await supabaseClient
      .from('assets')
      .select('ticker, computed_score')
      .not('computed_score', 'is', null)
      .order('computed_score', { ascending: false })
      .limit(1000);

    // Get prices for correlation check
    const scoredTickers = scoreReturnData?.map(a => a.ticker) || [];
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: pricesNow } = await supabaseClient
      .from('prices')
      .select('ticker, close')
      .eq('date', today)
      .in('ticker', scoredTickers);

    const { data: pricesPast } = await supabaseClient
      .from('prices')
      .select('ticker, close')
      .eq('date', sevenDaysAgo)
      .in('ticker', scoredTickers);

    const nowMap = new Map(pricesNow?.map(p => [p.ticker, p.close]) || []);
    const pastMap = new Map(pricesPast?.map(p => [p.ticker, p.close]) || []);

    // Calculate decile returns
    const decileReturns: { decile: number; avgScore: number; avgReturn: number; count: number }[] = [];
    const scoreWithReturns = scoreReturnData?.filter(a => {
      const now = nowMap.get(a.ticker);
      const past = pastMap.get(a.ticker);
      return now && past && past > 0;
    }).map(a => ({
      score: a.computed_score!,
      return7d: ((nowMap.get(a.ticker)! - pastMap.get(a.ticker)!) / pastMap.get(a.ticker)!) * 100
    })) || [];

    if (scoreWithReturns.length >= 100) {
      scoreWithReturns.sort((a, b) => a.score - b.score);
      const chunkSize = Math.floor(scoreWithReturns.length / 10);
      
      for (let i = 0; i < 10; i++) {
        const chunk = scoreWithReturns.slice(i * chunkSize, (i + 1) * chunkSize);
        decileReturns.push({
          decile: i + 1,
          avgScore: chunk.reduce((s, x) => s + x.score, 0) / chunk.length,
          avgReturn: chunk.reduce((s, x) => s + x.return7d, 0) / chunk.length,
          count: chunk.length
        });
      }
    }

    // Check if highest decile beats lowest decile
    const lowestReturn = decileReturns[0]?.avgReturn || 0;
    const highestReturn = decileReturns[9]?.avgReturn || 0;
    const isPositiveCorrelation = highestReturn > lowestReturn;

    results.push({
      name: 'score_return_correlation',
      passed: isPositiveCorrelation || decileReturns.length < 10,
      actual: decileReturns.length >= 10 ? `D1: ${lowestReturn.toFixed(2)}%, D10: ${highestReturn.toFixed(2)}%` : 'Insufficient data',
      expected: 'Decile 10 return > Decile 1 return',
      critical: true,
      message: isPositiveCorrelation ? 'Higher scores predict higher returns ✅' : 'INVERSE CORRELATION - lower scores predict higher returns ⚠️'
    });

    // ========================================================================
    // TEST 6: Assets have recent scores
    // ========================================================================
    const { count: recentScores, error: recentScoresError } = await supabaseClient
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .not('computed_score', 'is', null)
      .gte('score_computed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    results.push({
      name: 'assets_have_recent_scores',
      passed: !recentScoresError && (recentScores ?? 0) >= 1000,
      actual: recentScores ?? 0,
      expected: '>= 1000 assets scored in 24h',
      critical: false,
      message: recentScoresError ? recentScoresError.message : `${recentScores} assets have scores updated in last 24h`
    });

    // ========================================================================
    // TEST 7: Top scorers have leading indicator signals
    // ========================================================================
    const { data: topScorers } = await supabaseClient
      .from('assets')
      .select('id, ticker, computed_score')
      .not('computed_score', 'is', null)
      .order('computed_score', { ascending: false })
      .limit(20);

    const topAssetIds = topScorers?.map(a => a.id) || [];
    const leadingSignalTypes = [
      'insider_buy', 'politician_buy', 'filing_13f_new', 'filing_13f_increase',
      'bigmoney_hold_new', 'smart_money_accumulation', 'congressional_buy',
      'form4_buy', '13f_new_position', '13f_increase'
    ];

    const { data: leadingSignals } = await supabaseClient
      .from('signals')
      .select('asset_id')
      .in('asset_id', topAssetIds)
      .in('signal_type', leadingSignalTypes);

    const uniqueAssetsWithLeading = new Set(leadingSignals?.map(s => s.asset_id) || []).size;

    results.push({
      name: 'top_scorers_have_leading_signals',
      passed: uniqueAssetsWithLeading >= 3,
      actual: `${uniqueAssetsWithLeading}/20 top scorers`,
      expected: '>= 3 of top 20 have leading signals',
      critical: false,
      message: `${uniqueAssetsWithLeading} of top 20 scored assets have insider/institutional signals`
    });

    // ========================================================================
    // TEST 8: Generator execution health
    // ========================================================================
    const generatorNames = [
      'generate-signals-from-momentum',
      'generate-signals-from-13f',
      'generate-signals-from-form4',
      'generate-signals-from-darkpool',
      'generate-signals-from-technicals'
    ];

    const { data: generatorHealth } = await supabaseClient
      .from('function_status')
      .select('function_name, status, executed_at')
      .in('function_name', generatorNames)
      .order('executed_at', { ascending: false })
      .limit(10);

    const recentGenerators = generatorHealth?.filter(g => 
      new Date(g.executed_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
    ) || [];
    const successfulGenerators = recentGenerators.filter(g => g.status === 'success');

    results.push({
      name: 'generator_execution_health',
      passed: successfulGenerators.length >= 3,
      actual: `${successfulGenerators.length}/${recentGenerators.length} successful`,
      expected: '>= 3 generators ran successfully in 24h',
      critical: false,
      message: `Generators: ${[...new Set(successfulGenerators.map(g => g.function_name))].join(', ')}`
    });

    // ========================================================================
    // SUMMARY
    // ========================================================================
    const criticalPassed = results.filter(r => r.critical && r.passed).length;
    const criticalTotal = results.filter(r => r.critical).length;
    const allPassed = results.filter(r => r.passed).length;
    const allTotal = results.length;

    const overallStatus = criticalPassed === criticalTotal ? 'success' : 'failure';

    console.log(`[VALIDATE-SCORING] Completed: ${allPassed}/${allTotal} passed (${criticalPassed}/${criticalTotal} critical)`);

    // Store results in function_status for tracking
    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'validate-scoring-system',
      status: overallStatus,
      duration_ms: duration,
      rows_inserted: allPassed,
      metadata: {
        tests: results,
        critical_passed: criticalPassed,
        critical_total: criticalTotal,
        decile_returns: decileReturns
      }
    });

    // Store in dedicated validation results table if it exists
    try {
      await supabaseClient.from('scoring_validation_results').insert({
        test_run_at: new Date().toISOString(),
        tests_passed: allPassed,
        tests_total: allTotal,
        critical_passed: criticalPassed,
        critical_total: criticalTotal,
        overall_status: overallStatus,
        results: results,
        decile_analysis: decileReturns
      });
    } catch {
      // Table may not exist yet, that's OK
    }

    return new Response(JSON.stringify({
      success: overallStatus === 'success',
      summary: {
        tests_passed: allPassed,
        tests_total: allTotal,
        critical_passed: criticalPassed,
        critical_total: criticalTotal
      },
      results,
      decile_analysis: decileReturns,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VALIDATE-SCORING] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'validate-scoring-system',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      results 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
