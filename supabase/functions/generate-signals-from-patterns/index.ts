import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Bullish patterns
const BULLISH_PATTERNS = [
  'double_bottom', 'triple_bottom', 'inverse_head_shoulders', 'cup_and_handle',
  'bullish_flag', 'bullish_pennant', 'ascending_triangle', 'morning_star',
  'bullish_engulfing', 'hammer', 'piercing_line', 'three_white_soldiers'
];

// Bearish patterns
const BEARISH_PATTERNS = [
  'double_top', 'triple_top', 'head_shoulders', 'descending_triangle',
  'bearish_flag', 'bearish_pennant', 'evening_star', 'bearish_engulfing',
  'hanging_man', 'dark_cloud_cover', 'three_black_crows', 'shooting_star'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-PATTERNS] Starting pattern recognition signal generation...');

    // Fetch confirmed patterns from last 30 days
    const { data: patterns, error: patternError } = await supabaseClient
      .from('pattern_recognition')
      .select('*')
      .eq('status', 'confirmed')
      .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('detected_at', { ascending: false })
      .limit(5000);

    if (patternError) throw patternError;

    console.log(`[SIGNAL-GEN-PATTERNS] Found ${patterns?.length || 0} confirmed patterns`);

    if (!patterns || patterns.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-patterns',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'pattern_recognition',
      });
      return new Response(JSON.stringify({ message: 'No patterns to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(patterns.map(p => p.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const pattern of patterns) {
      const assetId = tickerToAssetId.get(pattern.ticker);
      if (!assetId) continue;

      const patternType = pattern.pattern_type?.toLowerCase() || '';
      const patternCategory = pattern.pattern_category?.toLowerCase() || '';
      
      // Determine direction
      let direction = 'neutral';
      if (patternCategory === 'bullish' || BULLISH_PATTERNS.some(p => patternType.includes(p))) {
        direction = 'up';
      } else if (patternCategory === 'bearish' || BEARISH_PATTERNS.some(p => patternType.includes(p))) {
        direction = 'down';
      } else if (patternType.includes('bottom') || patternType.includes('hammer') || patternType.includes('reversal_up')) {
        direction = 'up';
      } else if (patternType.includes('top') || patternType.includes('shooting') || patternType.includes('reversal_down')) {
        direction = 'down';
      }

      // Calculate magnitude based on confidence and risk/reward
      const confidence = (pattern.confidence_score || 50) / 100;
      const riskReward = Math.min(pattern.risk_reward_ratio || 1, 5);
      const magnitude = Math.min(5, confidence * riskReward * 2);

      // Determine signal type
      let signalType = 'chart_pattern';
      if (direction === 'up') signalType = 'bullish_pattern';
      else if (direction === 'down') signalType = 'bearish_pattern';

      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: pattern.detected_at || new Date().toISOString(),
        value_text: `${pattern.pattern_type} pattern (${(confidence * 100).toFixed(0)}% confidence, ${riskReward.toFixed(1)}:1 R/R)`,
        checksum: JSON.stringify({ 
          ticker: pattern.ticker, 
          signal_type: signalType, 
          pattern_type: pattern.pattern_type,
          detected_at: pattern.detected_at 
        }),
        citation: { source: 'Pattern Recognition', timestamp: new Date().toISOString() },
        raw: {
          pattern_type: pattern.pattern_type,
          pattern_category: pattern.pattern_category,
          confidence_score: pattern.confidence_score,
          risk_reward_ratio: pattern.risk_reward_ratio,
          entry_price: pattern.entry_price,
          target_price: pattern.target_price,
          stop_loss: pattern.stop_loss
        }
      });
    }

    // Batch upsert
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (!insertError) insertedCount += data?.length || 0;
    }

    console.log(`[SIGNAL-GEN-PATTERNS] ✅ Created ${insertedCount} pattern signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-patterns',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'pattern_recognition',
    });

    return new Response(JSON.stringify({ 
      success: true,
      patterns_processed: patterns.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-PATTERNS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-patterns',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
