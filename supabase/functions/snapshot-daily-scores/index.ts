// redeployed 2026-03-17
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Signal mass threshold - must match Asset Radar's "Scored Only" filter
const SIGNAL_MASS_THRESHOLD = 0.001;

// Extract signal mass from score_explanation jsonb array
// CRITICAL FIX: null score_explanation should be treated as zero contributions (not excluded)
// Previously: null was treated same as empty (both returned 0), but the filter below 
// would exclude both null and low-mass. Now null = zero mass (valid asset, no signal history).
const extractSignalMass = (scoreExplanation: unknown): number => {
  // null/undefined score_explanation = asset scored but no signal mass recorded = treat as 0 (zero contributions)
  if (!scoreExplanation || !Array.isArray(scoreExplanation)) return 0;
  const massEntry = scoreExplanation.find((e: any) => e.k === 'signal_mass');
  if (!massEntry) return 0; // Missing key = zero contributions, not invalid
  return typeof massEntry.v === 'number' ? massEntry.v : parseFloat(String(massEntry.v)) || 0;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Check if we already have a snapshot for today
    const { data: existingSnapshot } = await supabase
      .from('asset_score_snapshots')
      .select('id')
      .eq('snapshot_date', today)
      .limit(1);
    
    if (existingSnapshot && existingSnapshot.length > 0) {
      console.log(`Snapshot already exists for ${today}`);
      return new Response(
        JSON.stringify({ message: `Snapshot already exists for ${today}`, skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get top assets by computed_score (fetch extra to filter by signal_mass)
    const { data: allAssets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, computed_score, score_explanation')
      .not('computed_score', 'is', null)
      .order('computed_score', { ascending: false })
      .limit(500); // Fetch extra to filter
    
    if (assetsError) throw assetsError;
    
    if (!allAssets || allAssets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No scored assets found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Filter to only include assets with meaningful signal mass (matches Asset Radar "Scored Only")
    const scoredAssets = allAssets.filter(asset => {
      // FIX: null score_explanation = asset has a valid score but no signal history recorded
      // Include these assets (don't filter them out) - they have a score, just no detailed explanation
      if (asset.score_explanation === null || asset.score_explanation === undefined) return true;
      const signalMass = extractSignalMass(asset.score_explanation);
      return signalMass >= SIGNAL_MASS_THRESHOLD;
    });
    
    // Take top 50 from filtered set
    const topAssets = scoredAssets.slice(0, 50);
    
    if (topAssets.length === 0) {
      console.log('No assets with sufficient signal mass found');
      return new Response(
        JSON.stringify({ error: 'No assets with sufficient signal mass found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Create snapshot records
    const snapshots = topAssets.map((asset, index) => ({
      snapshot_date: today,
      ticker: asset.ticker,
      asset_name: asset.name,
      computed_score: asset.computed_score,
      rank: index + 1,
    }));
    
    // Upsert snapshots — idempotent on re-run
    const { error: insertError } = await supabase
      .from('asset_score_snapshots')
      .upsert(snapshots, { onConflict: 'snapshot_date,asset_id', ignoreDuplicates: false });
    
    if (insertError) throw insertError;
    
    console.log(`Created ${snapshots.length} score snapshots for ${today} (filtered from ${allAssets.length} total, ${scoredAssets.length} with signal mass >= ${SIGNAL_MASS_THRESHOLD})`);

    // Log to function_status for monitoring
    await supabase.from('function_status').insert({
      function_name: 'snapshot-daily-scores',
      status: 'success',
      rows_inserted: snapshots.length,
      duration_ms: Date.now() - new Date().getTime(),
      metadata: { date: today, total_assets: allAssets.length, scored_assets: scoredAssets.length }
    }).catch(() => {}); // non-critical — don't fail snapshot if logging fails

    return new Response(
      JSON.stringify({
        message: `Created ${snapshots.length} score snapshots for ${today}`,
        date: today,
        count: snapshots.length,
        total_assets: allAssets.length,
        scored_assets: scoredAssets.length,
        signal_mass_threshold: SIGNAL_MASS_THRESHOLD,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in snapshot-daily-scores:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
