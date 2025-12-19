import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenFIGI API for CUSIP resolution (free, max 10 items per request, 25 req/min)
async function lookupOpenFIGI(cusips: string[]): Promise<Map<string, { ticker: string | null; name: string | null }>> {
  const results = new Map<string, { ticker: string | null; name: string | null }>();
  
  if (cusips.length === 0) return results;
  
  const batchSize = 10;
  const batches: string[][] = [];
  for (let i = 0; i < cusips.length; i += batchSize) {
    batches.push(cusips.slice(i, i + batchSize));
  }
  
  console.log(`Processing ${batches.length} OpenFIGI batches (${cusips.length} CUSIPs)`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const batch of batches) {
    try {
      const requestBody = batch.map(cusip => ({
        idType: 'ID_CUSIP',
        idValue: cusip,
      }));
      
      const response = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (response.status === 429) {
        console.log('OpenFIGI rate limited, stopping');
        break;
      }
      
      if (!response.ok) {
        console.log(`OpenFIGI API error: ${response.status}`);
        // Still mark these as attempted
        for (const cusip of batch) {
          results.set(cusip, { ticker: null, name: null });
        }
        continue;
      }
      
      const data = await response.json();
      
      for (let i = 0; i < data.length; i++) {
        const cusip = batch[i];
        const mapping = data[i];
        
        if (mapping.data && mapping.data.length > 0) {
          // Prioritize common stock, then any equity
          const bestMatch = mapping.data.find((d: any) => 
            d.securityType === 'Common Stock' || d.securityType === 'EQS'
          ) || mapping.data.find((d: any) => 
            d.marketSector === 'Equity'
          ) || mapping.data[0];
          
          if (bestMatch.ticker) {
            results.set(cusip, { 
              ticker: bestMatch.ticker, 
              name: bestMatch.name || null 
            });
            successCount++;
          } else {
            results.set(cusip, { ticker: null, name: bestMatch.name || null });
            failCount++;
          }
        } else {
          results.set(cusip, { ticker: null, name: null });
          failCount++;
        }
      }
      
      // Rate limit: 2.5s between requests (25 requests/min max)
      await new Promise(r => setTimeout(r, 2500));
      
    } catch (e) {
      console.error('OpenFIGI lookup error:', e);
      // Mark batch as attempted
      for (const cusip of batch) {
        results.set(cusip, { ticker: null, name: null });
      }
    }
  }
  
  console.log(`OpenFIGI results: ${successCount} resolved, ${failCount} unresolvable`);
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Parse optional parameters
    const url = new URL(req.url);
    const batchLimit = parseInt(url.searchParams.get('limit') || '100');
    const markUnmappable = url.searchParams.get('mark_unmappable') === 'true';
    
    console.log(`Starting CUSIP resolution: limit=${batchLimit}, markUnmappable=${markUnmappable}`);
    
    // Fetch pending CUSIPs (those with NULL ticker)
    const { data: pendingCusips, error: fetchError } = await supabase
      .from('cusip_mappings')
      .select('cusip, company_name')
      .is('ticker', null)
      .limit(batchLimit);
    
    if (fetchError) {
      throw new Error(`Failed to fetch pending CUSIPs: ${fetchError.message}`);
    }
    
    if (!pendingCusips || pendingCusips.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No pending CUSIPs to resolve',
        stats: { pending: 0, resolved: 0, unresolvable: 0 }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`Found ${pendingCusips.length} pending CUSIPs`);
    
    // Lookup via OpenFIGI
    const cusipList = pendingCusips.map(p => p.cusip);
    const figiResults = await lookupOpenFIGI(cusipList);
    
    // Prepare updates
    let resolved = 0;
    let unresolvable = 0;
    const updates: Array<{ cusip: string; ticker: string | null; company_name: string | null; source: string; verified: boolean }> = [];
    
    for (const pending of pendingCusips) {
      const result = figiResults.get(pending.cusip);
      
      if (result?.ticker) {
        // Successfully resolved
        updates.push({
          cusip: pending.cusip,
          ticker: result.ticker,
          company_name: result.name || pending.company_name,
          source: 'openfigi',
          verified: true,
        });
        resolved++;
      } else if (markUnmappable) {
        // Mark as unmappable with UNKNOWN ticker
        updates.push({
          cusip: pending.cusip,
          ticker: 'UNMAPPED',
          company_name: result?.name || pending.company_name,
          source: 'unmappable',
          verified: false,
        });
        unresolvable++;
      }
      // If not markUnmappable, leave as NULL for future retry
    }
    
    // Batch update
    if (updates.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const { error: updateError } = await supabase
          .from('cusip_mappings')
          .upsert(chunk, { onConflict: 'cusip' });
        
        if (updateError) {
          console.error(`Update error for chunk ${i}: ${updateError.message}`);
        }
      }
    }
    
    // Get remaining stats
    const { count: remainingCount } = await supabase
      .from('cusip_mappings')
      .select('*', { count: 'exact', head: true })
      .is('ticker', null);
    
    const { count: totalMapped } = await supabase
      .from('cusip_mappings')
      .select('*', { count: 'exact', head: true })
      .not('ticker', 'is', null)
      .neq('ticker', 'UNMAPPED');
    
    const duration = Date.now() - startTime;
    
    // Log the run
    await supabase.from('ingest_logs').insert({
      etl_name: 'resolve-pending-cusips',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round(duration / 1000),
      rows_inserted: resolved,
      rows_skipped: markUnmappable ? 0 : (pendingCusips.length - resolved),
      rows_updated: unresolvable,
      source_used: 'openfigi',
      metadata: {
        batch_limit: batchLimit,
        mark_unmappable: markUnmappable,
        remaining_pending: remainingCount,
        total_mapped: totalMapped,
      }
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${pendingCusips.length} CUSIPs`,
      stats: {
        processed: pendingCusips.length,
        resolved,
        unresolvable: markUnmappable ? unresolvable : 0,
        stillPending: markUnmappable ? 0 : (pendingCusips.length - resolved),
        remainingInDB: remainingCount,
        totalMapped: totalMapped,
      },
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', errorMessage);
    
    await supabase.from('ingest_logs').insert({
      etl_name: 'resolve-pending-cusips',
      status: 'error',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    });
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
