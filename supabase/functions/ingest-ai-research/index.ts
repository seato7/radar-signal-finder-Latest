import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('🤖 Starting AI research report generation...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get top 5 assets by signal activity (reduced from 10 to prevent timeout)
    const { data: topAssets, error: assetsError } = await supabaseClient
      .from('asset_signal_summary')
      .select('*')
      .order('flow_signals', { ascending: false })
      .limit(5);

    if (assetsError) {
      console.error('Error fetching assets:', assetsError);
      throw new Error(`Failed to fetch assets: ${assetsError.message}`);
    }

    if (!topAssets || topAssets.length === 0) {
      // ✅ GRACEFUL EXIT: No assets with signals - this is not an error
      console.log('⚠️ No assets with signals found - skipping AI research generation (EXPECTED BEHAVIOR)');
      
      await supabaseClient.from('ingest_logs').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - startTime) / 1000),
        rows_inserted: 0,
        rows_skipped: 0,
        source_used: 'skipped - no assets',
      }).eq('id', logId);
      
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        inserted: 0,
        skipped: 0,
        message: '✅ No assets with signals found - skipped gracefully (not an error)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Processing ${topAssets.length} assets with signals...`);

    let inserted = 0;
    let skipped = 0;

    for (const asset of topAssets) {
      try {
        // Gather all available signals for this asset
        const { data: signals } = await supabaseClient
          .from('signals')
          .select('*')
          .eq('asset_id', asset.asset_id)
          .order('observed_at', { ascending: false })
          .limit(20);

        // Get technicals
        const { data: technicals } = await supabaseClient
          .from('advanced_technicals')
          .select('*')
          .eq('asset_id', asset.asset_id)
          .order('timestamp', { ascending: false })
          .limit(1);

        // Get sentiment
        const { data: sentiment } = await supabaseClient
          .from('news_sentiment_aggregate')
          .select('*')
          .eq('asset_id', asset.asset_id)
          .order('date', { ascending: false })
          .limit(1);

        // Get patterns
        const { data: patterns } = await supabaseClient
          .from('pattern_recognition')
          .select('*')
          .eq('asset_id', asset.asset_id)
          .eq('status', 'active')
          .order('detected_at', { ascending: false })
          .limit(3);

        // Build context for AI
        const context = {
          ticker: asset.ticker,
          name: asset.name,
          asset_class: asset.asset_class,
          current_price: asset.current_price,
          trend: asset.trend,
          signals: signals?.slice(0, 10),
          technicals: technicals?.[0],
          sentiment: sentiment?.[0],
          patterns: patterns,
          signal_counts: {
            flow: asset.flow_signals,
            institutional: asset.institutional_signals,
            insider: asset.insider_signals,
            technical: asset.technical_signals,
            sentiment: asset.sentiment_signals,
          }
        };

        // Generate AI report using Lovable AI
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You are a professional financial analyst. Generate a concise investment research report based on the provided market data. Focus on:
1. Executive summary (2-3 sentences)
2. Key technical signals and patterns
3. Sentiment analysis from news and social media
4. Flow analysis (institutional vs retail)
5. Risk assessment
6. Clear recommendation (BUY/HOLD/SELL) with time horizon
7. Price targets and stop loss levels

Be factual, cite data points, and assign a confidence score (0-100).`
              },
              {
                role: 'user',
                content: `Generate a research report for ${asset.ticker} (${asset.name})\n\nData:\n${JSON.stringify(context, null, 2)}`
              }
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`❌ AI API error for ${asset.ticker}: ${aiResponse.status} - ${errorText}`);
          // ✅ GRACEFUL SKIP: AI API failures don't fail the entire job
          skipped++;
          continue;
        }

        const aiData = await aiResponse.json();
        const reportText = aiData.choices?.[0]?.message?.content;

        if (!reportText) {
          console.error(`No report generated for ${asset.ticker}`);
          skipped++;
          continue;
        }

        // Parse report structure (simplified)
        const lines = reportText.split('\n');
        const executiveSummary = lines.slice(0, 3).join(' ');
        
        // Extract recommendation and confidence from text
        let recommendation = 'HOLD';
        let confidenceScore = 60;
        if (reportText.toLowerCase().includes('buy')) recommendation = 'BUY';
        else if (reportText.toLowerCase().includes('sell')) recommendation = 'SELL';
        
        // Simple confidence extraction
        const confMatch = reportText.match(/confidence[:\s]+(\d+)/i);
        if (confMatch) confidenceScore = parseInt(confMatch[1]);

        const report = {
          ticker: asset.ticker,
          asset_id: asset.asset_id,
          asset_class: asset.asset_class,
          report_type: 'ai_generated',
          executive_summary: executiveSummary,
          technical_analysis: reportText,
          fundamental_analysis: `Based on ${context.signal_counts.flow} flow signals, ${context.signal_counts.institutional} institutional signals`,
          sentiment_analysis: sentiment?.[0] ? `Sentiment: ${sentiment[0].sentiment_label} (${sentiment[0].sentiment_score})` : 'N/A',
          risk_assessment: `Volatility based on ${patterns?.length || 0} active patterns`,
          recommendation,
          confidence_score: confidenceScore / 100,
          time_horizon: 'short_term',
          signal_count: signals?.length || 0,
          generated_by: 'gemini-2.5-flash',
          data_sources: ['signals', 'advanced_technicals', 'news_sentiment_aggregate', 'pattern_recognition'],
          metadata: {
            ai_model: 'google/gemini-2.5-flash',
            full_report: reportText,
            signal_summary: context.signal_counts
          }
        };

        const { error } = await supabaseClient
          .from('ai_research_reports')
          .insert(report);

        if (error) {
          console.error(`Error inserting report for ${asset.ticker}:`, error);
          skipped++;
        } else {
          inserted++;
          console.log(`✅ Generated report for ${asset.ticker}`);
        }

        // Rate limiting - reduced to 500ms to speed up processing
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        console.error(`Error processing ${asset.ticker}:`, err);
        skipped++;
      }
    }

    const duration = Math.floor((Date.now() - startTime) / 1000);
    // @guard: Log to function_status heartbeat table for monitoring
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-ai-research',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      duration_ms: duration * 1000,
      source_used: 'gemini-2.5-flash',
      metadata: {
        assets_processed: topAssets.length,
      }
    });
    
    await supabaseClient.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.floor((Date.now() - startTime) / 1000),
      rows_inserted: inserted,
      rows_skipped: skipped,
      source_used: 'Lovable AI + Multi-source',
    }).eq('id', logId);
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-ai-research',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed: 'Lovable AI + Multi-source',
    });

    return new Response(JSON.stringify({
      success: true,
      processed: topAssets.length,
      inserted,
      skipped,
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

    // Send Slack failure alert
    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-ai-research',
      message: `AI Research failed: ${(error as Error).message}`
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
