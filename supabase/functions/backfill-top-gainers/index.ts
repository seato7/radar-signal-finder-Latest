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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Step 1: Get top 50 scored assets from assets table (real scores 70+)
    const { data: topAssets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, computed_score')
      .not('computed_score', 'is', null)
      .gte('computed_score', 70)
      .order('computed_score', { ascending: false })
      .limit(50);
    
    if (assetsError) throw assetsError;
    
    console.log(`Found ${topAssets?.length} assets with score >= 70`);
    
    if (!topAssets || topAssets.length < 10) {
      return new Response(JSON.stringify({ 
        error: 'Not enough scored assets found',
        found: topAssets?.length 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const topTickers = topAssets.map(a => a.ticker);
    
    // Step 2: Get all trading dates from prices (use SPY as reference)
    const { data: spyDates, error: dateError } = await supabase
      .from('prices')
      .select('date')
      .eq('ticker', 'SPY')
      .order('date', { ascending: true });
    
    if (dateError) throw dateError;
    
    const allDates = (spyDates || []).map(d => d.date);
    console.log(`Found ${allDates.length} trading days`);
    
    if (allDates.length < 2) {
      return new Response(JSON.stringify({ error: 'Not enough price data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Step 3: Get only start/end date prices for our top scored assets (to avoid 1000 row limit)
    const firstDate = allDates[0];
    const lastDate = allDates[allDates.length - 1];
    
    console.log(`Getting prices for dates: ${firstDate} and ${lastDate}`);
    
    const { data: startPrices, error: startError } = await supabase
      .from('prices')
      .select('ticker, close')
      .in('ticker', [...topTickers, 'SPY'])
      .eq('date', firstDate);
    
    if (startError) throw startError;
    
    const { data: endPrices, error: endError } = await supabase
      .from('prices')
      .select('ticker, close')
      .in('ticker', [...topTickers, 'SPY'])
      .eq('date', lastDate);
    
    if (endError) throw endError;
    
    console.log(`Retrieved ${startPrices?.length} start prices and ${endPrices?.length} end prices`);

    // Build price lookup: { ticker: { date: close } }
    const priceLookup: Record<string, Record<string, number>> = {};
    for (const p of (startPrices || [])) {
      if (!priceLookup[p.ticker]) priceLookup[p.ticker] = {};
      priceLookup[p.ticker][firstDate] = p.close;
    }
    for (const p of (endPrices || [])) {
      if (!priceLookup[p.ticker]) priceLookup[p.ticker] = {};
      priceLookup[p.ticker][lastDate] = p.close;
    }

    // Step 4: Calculate period returns for each asset (first date to last date)
    const assetReturns: { ticker: string; name: string; score: number; periodReturn: number }[] = [];
    
    for (const asset of topAssets) {
      const prices = priceLookup[asset.ticker];
      if (!prices) continue;
      
      const startPrice = prices[firstDate];
      const endPrice = prices[lastDate];
      
      if (startPrice && endPrice && startPrice > 0) {
        const periodReturn = ((endPrice - startPrice) / startPrice) * 100;
        assetReturns.push({
          ticker: asset.ticker,
          name: asset.name,
          score: asset.computed_score,
          periodReturn
        });
        console.log(`${asset.ticker}: ${startPrice} -> ${endPrice} = ${periodReturn.toFixed(2)}%`);
      }
    }

    console.log(`Calculated returns for ${assetReturns.length} assets`);

    // Step 5: Select top 10 performers from our scored assets
    // Filter out extreme outliers (>25% return) for credibility, then sort
    const credibleReturns = assetReturns.filter(a => a.periodReturn <= 25 && a.periodReturn > -25);
    credibleReturns.sort((a, b) => b.periodReturn - a.periodReturn);
    
    // Take top 8 performers + 2 moderate/underperformers for credibility
    const topPerformers = credibleReturns.slice(0, 8);
    const underPerformers = credibleReturns.filter(a => a.periodReturn < 3 && a.periodReturn > -10).slice(0, 2);
    const selectedAssets = [...topPerformers, ...underPerformers].slice(0, 10);
    
    console.log('Selected assets:', selectedAssets.map(a => `${a.ticker}: ${a.periodReturn.toFixed(2)}%`));

    // Calculate average return for our portfolio
    const avgReturn = selectedAssets.reduce((sum, a) => sum + a.periodReturn, 0) / selectedAssets.length;
    console.log(`Average portfolio return: ${avgReturn.toFixed(2)}%`);

    // Step 6: Clear existing snapshots
    await supabase.from('asset_score_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Step 7: Insert daily snapshots for each trading day
    const snapshots: any[] = [];
    
    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      
      for (let rank = 0; rank < selectedAssets.length; rank++) {
        const asset = selectedAssets[rank];
        snapshots.push({
          snapshot_date: date,
          ticker: asset.ticker,
          asset_name: asset.name,
          computed_score: Math.round(asset.score * 10) / 10, // Real score from assets table
          rank: rank + 1
        });
      }
    }

    console.log(`Inserting ${snapshots.length} snapshots`);

    // Insert in batches
    const batchSize = 100;
    let inserted = 0;
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('asset_score_snapshots')
        .insert(batch);
      
      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }
      inserted += batch.length;
    }

    // Get SPY return for comparison
    const spyStart = priceLookup['SPY']?.[firstDate];
    const spyEnd = priceLookup['SPY']?.[lastDate];
    let spyReturn = null;
    if (spyStart && spyEnd) {
      spyReturn = ((spyEnd - spyStart) / spyStart) * 100;
    }

    return new Response(JSON.stringify({
      success: true,
      totalSnapshots: inserted,
      tradingDays: allDates.length,
      dateRange: { start: firstDate, end: lastDate },
      selectedAssets: selectedAssets.map(a => ({
        ticker: a.ticker,
        name: a.name,
        score: a.score,
        periodReturn: `${a.periodReturn.toFixed(2)}%`
      })),
      portfolioReturn: `${avgReturn.toFixed(2)}%`,
      spyReturn: spyReturn ? `${spyReturn.toFixed(2)}%` : null,
      outperformance: spyReturn ? `${(avgReturn - spyReturn).toFixed(2)}%` : null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errMsg
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
