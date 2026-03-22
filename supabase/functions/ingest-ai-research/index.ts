import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const BATCH_SIZE = 50; // Tickers per invocation
const AI_CONCURRENCY = 5; // Parallel AI calls
const AI_DELAY_MS = 300; // Delay between AI batches

// Priority tickers - always process these first
const PRIORITY_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'V',
  'UNH', 'MA', 'HD', 'PG', 'JNJ', 'XOM', 'CVX', 'LLY', 'AVGO', 'COST',
  'KO', 'PEP', 'MRK', 'ABBV', 'WMT', 'BAC', 'CSCO', 'CRM', 'ADBE', 'AMD'
];

interface AssetContext {
  ticker: string;
  asset_id: string;
  name: string;
  asset_class: string;
  current_price: number | null;
  trend: string | null;
  signals: any[];
  technicals: any | null;
  sentiment: any | null;
  patterns: any[];
  signal_counts: {
    flow: number;
    institutional: number;
    insider: number;
    technical: number;
    sentiment: number;
  };
}

async function generateAIReport(
  context: AssetContext,
): Promise<{ success: boolean; report?: any; error?: string }> {
  try {
    const aiPrompt = `You are a professional financial analyst. Generate a CONCISE investment research report. Output ONLY:
1. Executive Summary (2 sentences max)
2. Recommendation: BUY/HOLD/SELL
3. Confidence: 0-100
4. Key Risk: 1 sentence
5. Time Horizon: short_term/medium_term/long_term

Be factual and cite specific data points.

Analyze ${context.ticker} (${context.name})

Price: $${context.current_price || 'N/A'}
Trend: ${context.trend || 'N/A'}
Signals: ${context.signal_counts.flow} flow, ${context.signal_counts.institutional} institutional, ${context.signal_counts.insider} insider
Patterns: ${context.patterns.length} active
Sentiment: ${context.sentiment?.sentiment_label || 'N/A'} (${context.sentiment?.sentiment_score || 'N/A'})`;

    const reportText = await callGemini(aiPrompt, 600, 'text');

    if (!reportText) {
      return { success: false, error: 'No content in AI response' };
    }

    // Parse AI response
    let recommendation = 'HOLD';
    let confidenceScore = 60;
    let timeHorizon = 'short_term';

    const buyMatch = reportText.match(/\b(STRONG BUY|BUY)\b/);
    const sellMatch = reportText.match(/\b(STRONG SELL|SELL)\b/);
    const holdMatch = reportText.match(/\bHOLD\b/);
    if (buyMatch) recommendation = buyMatch[1];
    else if (sellMatch) recommendation = sellMatch[1];
    else if (holdMatch) recommendation = 'HOLD';

    const confMatch = reportText.match(/confidence[:\s]*(\d+)/i);
    if (confMatch) confidenceScore = Math.min(100, Math.max(0, parseInt(confMatch[1])));

    if (reportText.toLowerCase().includes('medium_term') || reportText.toLowerCase().includes('medium term')) {
      timeHorizon = 'medium_term';
    } else if (reportText.toLowerCase().includes('long_term') || reportText.toLowerCase().includes('long term')) {
      timeHorizon = 'long_term';
    }

    const lines = reportText.split('\n').filter((l: string) => l.trim());
    const executiveSummary = lines.slice(0, 2).join(' ').substring(0, 500);

    return {
      success: true,
      report: {
        ticker: context.ticker,
        asset_id: context.asset_id,
        asset_class: context.asset_class,
        report_type: 'ai_generated',
        executive_summary: executiveSummary || `AI analysis for ${context.ticker}`,
        technical_analysis: reportText,
        fundamental_analysis: `Based on ${context.signal_counts.flow} flow signals, ${context.signal_counts.institutional} institutional signals`,
        sentiment_analysis: context.sentiment ? `Sentiment: ${context.sentiment.sentiment_label} (${context.sentiment.sentiment_score})` : 'N/A',
        risk_assessment: `Volatility based on ${context.patterns.length} active patterns`,
        recommendation,
        confidence_score: confidenceScore / 100,
        time_horizon: timeHorizon,
        signal_count: context.signals.length,
        generated_by: 'gemini-2.5-flash',
        data_sources: ['signals', 'advanced_technicals', 'news_sentiment_aggregate', 'pattern_recognition'],
        metadata: {
          ai_model: 'gemini-2.0-flash',
          full_report: reportText,
          signal_summary: context.signal_counts,
          processed_at: new Date().toISOString()
        }
      }
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function processAIBatch(
  contexts: AssetContext[],
): Promise<{ reports: any[]; errors: number }> {
  const reports: any[] = [];
  let errors = 0;

  // Process in parallel batches
  for (let i = 0; i < contexts.length; i += AI_CONCURRENCY) {
    const batch = contexts.slice(i, i + AI_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(ctx => generateAIReport(ctx))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success && result.value.report) {
        reports.push(result.value.report);
      } else {
        errors++;
        const reason = result.status === 'rejected' ? result.reason : result.value?.error;
        console.log(`⚠️ AI error: ${reason}`);
      }
    }

    // Rate limit delay between batches
    if (i + AI_CONCURRENCY < contexts.length) {
      await new Promise(resolve => setTimeout(resolve, AI_DELAY_MS));
    }
  }

  return { reports, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const startTime = Date.now();
  const logId = crypto.randomUUID();
  const slackAlerter = new SlackAlerter();
  
  try {
    await supabaseClient.from('ingest_logs').insert({
      id: logId,
      etl_name: 'ingest-ai-research',
      status: 'running',
      started_at: new Date().toISOString(),
    });

    console.log('🤖 [BATCH MODE] Starting AI research report generation...');

    // ========================================
    // STEP 1: Smart Ticker Selection
    // ========================================
    
    // Get all assets with any signal activity
    const { data: allAssets, error: assetsError } = await supabaseClient
      .from('asset_signal_summary')
      .select('asset_id,ticker,name,asset_class,current_price,trend,flow_signals,institutional_signals,insider_signals,technical_signals,sentiment_signals')
      .or('flow_signals.gt.0,institutional_signals.gt.0,insider_signals.gt.0,technical_signals.gt.0,sentiment_signals.gt.0')
      .limit(500);

    if (assetsError) {
      throw new Error(`Failed to fetch assets: ${assetsError.message}`);
    }

    if (!allAssets || allAssets.length === 0) {
      console.log('⚠️ No assets with signals found - skipping');
      await supabaseClient.from('ingest_logs').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - startTime) / 1000),
        rows_inserted: 0,
        source_used: 'skipped - no assets',
      }).eq('id', logId);
      
      return new Response(JSON.stringify({
        success: true,
        message: 'No assets with signals found'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get recently processed tickers (last 4 hours) to rotate
    const { data: recentReports } = await supabaseClient
      .from('ai_research_reports')
      .select('ticker')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const recentlyProcessed = new Set(recentReports?.map(r => r.ticker) || []);

    // Priority sorting:
    // 1. Priority tickers not recently processed
    // 2. High signal activity assets not recently processed
    // 3. Remaining assets not recently processed
    // 4. Priority tickers (even if recently processed, for freshness)
    
    const priorityAssets: typeof allAssets = [];
    const highSignalAssets: typeof allAssets = [];
    const otherAssets: typeof allAssets = [];
    const reprocessPriority: typeof allAssets = [];

    for (const asset of allAssets) {
      const isPriority = PRIORITY_TICKERS.includes(asset.ticker);
      const isRecent = recentlyProcessed.has(asset.ticker);
      const totalSignals = (asset.flow_signals || 0) + (asset.institutional_signals || 0) +
                          (asset.insider_signals || 0) + (asset.technical_signals || 0) +
                          (asset.sentiment_signals || 0);

      if (isPriority && !isRecent) {
        priorityAssets.push(asset);
      } else if (isPriority && isRecent) {
        reprocessPriority.push(asset);
      } else if (totalSignals >= 5 && !isRecent) {
        highSignalAssets.push(asset);
      } else if (!isRecent) {
        otherAssets.push(asset);
      }
    }

    // Sort high signal assets by total signals
    highSignalAssets.sort((a, b) => {
      const aTotal = (a.flow_signals || 0) + (a.institutional_signals || 0) + (a.sentiment_signals || 0);
      const bTotal = (b.flow_signals || 0) + (b.institutional_signals || 0) + (b.sentiment_signals || 0);
      return bTotal - aTotal;
    });

    // Combine and take BATCH_SIZE
    const selectedAssets = [
      ...priorityAssets,
      ...highSignalAssets,
      ...otherAssets,
      ...reprocessPriority
    ].slice(0, BATCH_SIZE);

    console.log(`📊 Selected ${selectedAssets.length} tickers for batch processing`);
    console.log(`   Priority: ${priorityAssets.length}, High-Signal: ${highSignalAssets.length}, Other: ${otherAssets.length}`);

    if (selectedAssets.length === 0) {
      console.log('✅ All tickers recently processed - nothing to do');
      await supabaseClient.from('ingest_logs').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - startTime) / 1000),
        rows_inserted: 0,
        source_used: 'all cached',
      }).eq('id', logId);
      
      return new Response(JSON.stringify({
        success: true,
        message: 'All tickers recently processed'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ========================================
    // STEP 2: Bulk Data Fetching
    // ========================================
    
    const assetIds = selectedAssets.map(a => a.asset_id);
    console.log(`📥 Fetching bulk data for ${assetIds.length} assets...`);

    // Fetch all data in parallel with BULK queries
    const [signalsResult, technicalsResult, sentimentResult, patternsResult] = await Promise.all([
      supabaseClient
        .from('signals')
        .select('*')
        .in('asset_id', assetIds)
        .order('observed_at', { ascending: false })
        .limit(500), // 10 per asset max

      supabaseClient
        .from('advanced_technicals')
        .select('*')
        .in('asset_id', assetIds)
        .order('timestamp', { ascending: false }),

      supabaseClient
        .from('news_sentiment_aggregate')
        .select('*')
        .in('asset_id', assetIds)
        .order('date', { ascending: false }),

      supabaseClient
        .from('pattern_recognition')
        .select('*')
        .in('asset_id', assetIds)
        .eq('status', 'active')
        .order('detected_at', { ascending: false })
    ]);

    // Group data by asset_id for quick lookup
    const signalsByAsset = new Map<string, any[]>();
    const technicalsByAsset = new Map<string, any>();
    const sentimentByAsset = new Map<string, any>();
    const patternsByAsset = new Map<string, any[]>();

    for (const signal of signalsResult.data || []) {
      if (!signalsByAsset.has(signal.asset_id)) {
        signalsByAsset.set(signal.asset_id, []);
      }
      const arr = signalsByAsset.get(signal.asset_id)!;
      if (arr.length < 10) arr.push(signal);
    }

    for (const tech of technicalsResult.data || []) {
      if (!technicalsByAsset.has(tech.asset_id)) {
        technicalsByAsset.set(tech.asset_id, tech);
      }
    }

    for (const sent of sentimentResult.data || []) {
      if (!sentimentByAsset.has(sent.asset_id)) {
        sentimentByAsset.set(sent.asset_id, sent);
      }
    }

    for (const pattern of patternsResult.data || []) {
      if (!patternsByAsset.has(pattern.asset_id)) {
        patternsByAsset.set(pattern.asset_id, []);
      }
      const arr = patternsByAsset.get(pattern.asset_id)!;
      if (arr.length < 3) arr.push(pattern);
    }

    console.log(`📊 Data loaded: ${signalsResult.data?.length || 0} signals, ${technicalsResult.data?.length || 0} technicals`);

    // ========================================
    // STEP 3: Build Contexts
    // ========================================
    
    const contexts: AssetContext[] = selectedAssets.map(asset => ({
      ticker: asset.ticker,
      asset_id: asset.asset_id,
      name: asset.name || asset.ticker,
      asset_class: asset.asset_class || 'stock',
      current_price: asset.current_price,
      trend: asset.trend,
      signals: signalsByAsset.get(asset.asset_id) || [],
      technicals: technicalsByAsset.get(asset.asset_id) || null,
      sentiment: sentimentByAsset.get(asset.asset_id) || null,
      patterns: patternsByAsset.get(asset.asset_id) || [],
      signal_counts: {
        flow: asset.flow_signals || 0,
        institutional: asset.institutional_signals || 0,
        insider: asset.insider_signals || 0,
        technical: asset.technical_signals || 0,
        sentiment: asset.sentiment_signals || 0,
      }
    }));

    // ========================================
    // STEP 4: Parallel AI Processing
    // ========================================
    
    console.log(`🤖 Generating ${contexts.length} AI reports (${AI_CONCURRENCY} concurrent)...`);
    const { reports, errors } = await processAIBatch(contexts);
    console.log(`✅ Generated ${reports.length} reports, ${errors} errors`);

    // ========================================
    // STEP 5: Batch Upsert
    // ========================================
    
    let inserted = 0;
    let skipped = 0;

    if (reports.length > 0) {
      // Upsert in batches of 25 - replaces old reports for same ticker+report_type
      for (let i = 0; i < reports.length; i += 25) {
        const batch = reports.slice(i, i + 25);
        const { error: upsertError, data: upsertData } = await supabaseClient
          .from('ai_research_reports')
          .upsert(batch, { 
            onConflict: 'ticker,report_type',
            ignoreDuplicates: false 
          })
          .select('id');

        if (upsertError) {
          console.error(`Batch upsert error: ${upsertError.message}`);
          skipped += batch.length;
        } else {
          inserted += upsertData?.length || batch.length;
        }
      }
    }

    skipped += errors;

    // ========================================
    // STEP 6: Logging & Completion
    // ========================================
    
    const duration = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n=== BATCH COMPLETE ===`);
    console.log(`Duration: ${duration}s`);
    console.log(`Processed: ${selectedAssets.length} tickers`);
    console.log(`Inserted: ${inserted}, Skipped: ${skipped}`);

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-ai-research',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: duration * 1000,
      source_used: 'gemini-2.0-flash-batch',
      metadata: {
        batch_size: selectedAssets.length,
        priority_count: priorityAssets.length,
        high_signal_count: highSignalAssets.length,
        ai_concurrency: AI_CONCURRENCY,
      }
    });
    
    await supabaseClient.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
      rows_inserted: inserted,
      rows_skipped: skipped,
      source_used: 'Gemini 2.0 Flash Batch',
    }).eq('id', logId);
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-ai-research',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: `Batch ${selectedAssets.length} tickers`,
    });

    return new Response(JSON.stringify({
      success: true,
      batch_size: selectedAssets.length,
      inserted,
      skipped,
      duration_seconds: duration,
      tickers: selectedAssets.slice(0, 10).map(a => a.ticker),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Fatal error:', error);
    await supabaseClient.from('ingest_logs').update({
      status: 'failure',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.floor((Date.now() - startTime) / 1000),
      error_message: (error as Error).message || String(error),
    }).eq('id', logId);

    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-ai-research',
      message: `AI Research batch failed: ${(error as Error).message}`
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
