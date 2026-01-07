import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    
    // Get top 50 assets by computed_score
    const { data: topAssets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, computed_score')
      .not('computed_score', 'is', null)
      .order('computed_score', { ascending: false })
      .limit(50);
    
    if (assetsError) throw assetsError;
    
    if (!topAssets || topAssets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No scored assets found' }),
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
    
    // Insert snapshots
    const { error: insertError } = await supabase
      .from('asset_score_snapshots')
      .insert(snapshots);
    
    if (insertError) throw insertError;
    
    console.log(`Created ${snapshots.length} score snapshots for ${today}`);
    
    return new Response(
      JSON.stringify({
        message: `Created ${snapshots.length} score snapshots for ${today}`,
        date: today,
        count: snapshots.length,
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
